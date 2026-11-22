import {
  getActiveEditor,
  getFrontend,
  IMenuItem,
  Plugin,
  showMessage
} from "siyuan";
import pluginInfo from "@/../plugin.json";
import { DOC_ASSIST_ICON_SVG } from "@/icons";
import { AiServiceConfig } from "@/core/ai-service-config-core";
import { filterDockVisibleActions } from "@/core/doc-menu-registration-core";
import { KeyInfoFilter } from "@/core/key-info-core";
import { ActionRunner, ConfirmDetailItem } from "@/plugin/action-runner";
import { ACTIONS, ActionKey } from "@/plugin/actions";
import {
  ALPHA_FEATURE_HIDE_CONFIG,
  filterVisibleActions,
  getHiddenActionKeys
} from "@/plugin/alpha-feature-config";
import { getProtyleDocId, ProtyleLike, resolvePairedCursorDocId } from "@/plugin/doc-context";
import { KeyInfoController } from "@/plugin/key-info-controller";
import { setTransactionDebugLogEnabled } from "@/plugin/transaction-runner";
import { setDocAssistantDebugEnabled } from "@/core/logger-core";
import {
  bindPluginLifecycleEvents,
  unbindPluginLifecycleEvents
} from "@/plugin/plugin-lifecycle-events";
import {
  addFloatDocTreeMenuItem,
  addFloatSelectedTextBlockMenuItem,
  addFloatSelectedTextContentMenuItem,
  isFloatSelectedTextHidden,
  populateEditorTitleMenu,
  registerPluginCommands
} from "@/plugin/plugin-lifecycle-menu";
import {
  buildDefaultPluginDocMenuState,
  getOrderedPluginActions,
  PluginDocMenuState,
  normalizePluginDocMenuState,
  reorderPluginDocFavoriteActions,
  resetPluginDocActionOrder,
  serializePluginDocMenuState,
  setAllPluginDocActionEnabled,
  setAllPluginDocMenuRegistration,
  setAiSummaryConfig,
  setFloatingConfig,
  setPluginDocActionFavorite,
  setPluginDocActionOrder,
  setPluginStartupDocProcessTabEnabled,
  setPluginDynamicOutlineEnabled,
  setPluginDynamicOutlineFollowKeyInfo,
  setPluginDynamicOutlineQuickSwitchEnabled,
  setPluginDynamicOutlinePosition,
  setPluginDynamicOutlineViewModes,
  setPluginDynamicOutlineDocSectionsExpanded,
  setPluginKeyInfoFilter,
  setPluginMouseGestureBindings,
  setPluginMouseGestureEnabled,
  setSinglePluginDocActionEnabled,
  setSinglePluginDocMenuRegistration
} from "@/plugin/plugin-lifecycle-state";
import {
  ApiSwitchSyncHandle,
  buildPluginLifecycleSettingPage,
  setupApiSwitchSync,
  shouldRunClipboardMonitor
} from "@/plugin/plugin-lifecycle-settings-bridge";
import {
  DynamicOutlinePosition,
  DynamicOutlineViewMode
} from "@/core/dynamic-outline-core";
import { ClipboardMonitorService } from "@/services/clipboard-monitor";
import { DynamicOutlineController } from "@/plugin/dynamic-outline-controller";
import { createKeyInfoNavigation } from "@/plugin/key-info-navigation";
import {
  activateOpenDocTab,
  collectCurrentWndOpenDocTabs,
  fetchRecentDocItems,
  openDocTab
} from "@/services/doc-navigation";
import { getDocKeyInfo } from "@/services/key-info";
import { GestureBindings } from "@/core/gesture-recognition-core";
import { createMouseGestureController } from "@/plugin/mouse-gesture-controller";
import {
  bindPluginFloatingPersistence,
  resetFloatingTextConfigCache,
  setCachedFloatingTextConfig
} from "@/services/floating-text/floating-text-storage";
import { rangeSelectionObserverManager } from "@/plugin/action-runner-select-range-handlers";
import { disposeFloatingWindowHostGlobals } from "@/services/floating-text/floating-window-adapter";
import { FloatingTextConfig } from "@/core/floating-text-core";
import { createPluginSettings } from "@/ui/plugin-settings";
import {
  destroyActionProcessingOverlay,
  hideActionProcessingOverlay,
  showActionProcessingOverlay
} from "@/ui/action-processing-overlay";
import { resolveNetworkLensPluginFromPlugins } from "@/services/network-lens-ai-index";
import { resolveCanvasPluginFromPlugins } from "@/services/canvas-plugin-resolver";
import { createPowerButtonsProvider } from "@/plugin/power-buttons-provider";
import type { PowerButtonsCommandProvider } from "@/plugin/power-buttons-provider-types";
import { askConfirmWithDetail } from "@/ui/confirm-detail-dialog";
import { floatingTextService } from "@/services/floating-text/floating-text-service";

export default class DocLinkToolkitPlugin extends Plugin {
  declare displayName: string;
  public setting?: ReturnType<typeof createPluginSettings>;
  private currentDocId = "";
  private currentProtyle?: ProtyleLike;
  private isMobile = false;
  private readonly docMenuRegistrationStorageName = "doc-menu-registration";
  private menuState: PluginDocMenuState = buildDefaultPluginDocMenuState(ACTIONS);
  private readonly dynamicOutlineNavigation = createKeyInfoNavigation();

  private managedAiConfig: AiServiceConfig | null = null;
  private apiSwitchHandle?: ApiSwitchSyncHandle;
  private unloaded = false;
  private persistQueue: Promise<void> = Promise.resolve();
  private persistInFlight = false;
  private persistEpoch = 0;

  // Keep read-only accessors for test inspection and narrow collaborators without
  // duplicating mutable fields across the class and PluginDocMenuState.
  get docActionEnabledState() {
    return this.menuState.docActionEnabledState;
  }

  get docMenuRegistrationState() {
    return this.menuState.docMenuRegistrationState;
  }

  get docActionOrderState() {
    return this.menuState.docActionOrderState;
  }

  get docFavoriteActionKeys() {
    return this.menuState.docFavoriteActionKeys;
  }

  get keyInfoFilterState() {
    return this.menuState.keyInfoFilterState;
  }

  get aiSummaryConfig() {
    return this.menuState.aiSummaryConfig;
  }

  get debugLogEnabled() {
    return this.menuState.debugLogEnabled;
  }

  get floatingConfig() {
    return this.menuState.floatingConfig;
  }

  get startupDocProcessTabEnabled() {
    return this.menuState.startupDocProcessTabEnabled;
  }

  get mouseGestureEnabled() {
    return this.menuState.mouseGestureEnabled;
  }

  get mouseGestureBindings() {
    return this.menuState.mouseGestureBindings;
  }

  get dynamicOutlineEnabled() {
    return this.menuState.dynamicOutlineEnabled;
  }

  get dynamicOutlineFollowKeyInfo() {
    return this.menuState.dynamicOutlineFollowKeyInfo;
  }

  get dynamicOutlineQuickSwitchEnabled() {
    return this.menuState.dynamicOutlineQuickSwitchEnabled;
  }

  private readonly clipboardMonitor = new ClipboardMonitorService({
    loadData: (name) => this.loadData(name),
    saveData: (name, data) => this.saveData(name, data),
    onChange: (items) => this.dynamicOutlineController.notifyClipboardChanged(items)
  });

  private readonly dynamicOutlineController: DynamicOutlineController = new DynamicOutlineController({
    isMobile: () => this.isMobile,
    getCurrentProtyle: () => this.currentProtyle,
    getCurrentDocId: () => this.syncPairedCursor(),
    getKeyInfoFilter: () => this.menuState.keyInfoFilterState,
    fetchDocKeyInfo: (docId, protyle) => getDocKeyInfo(docId, protyle),
    navigateBlock: (blockId, protyle) => {
      this.dynamicOutlineNavigation.handleItemClick(
        { blockId } as any,
        () => protyle || this.currentProtyle
      );
    },
    getOpenDocTabs: (protyle) => collectCurrentWndOpenDocTabs(protyle || this.currentProtyle),
    activateOpenDocTab: (item) => activateOpenDocTab(item, this.app),
    getRecentDocs: () => fetchRecentDocItems(),
    openRecentDoc: (item) => openDocTab(this.app, item.docId),
    setDocSectionsExpanded: (sections) => this.setDynamicOutlineDocSectionsExpanded(sections),
    setPosition: (position) => this.setDynamicOutlinePosition(position),
    onFloatSelectedText: (protyle) => {
      const activeProtyle = protyle || this.currentProtyle;
      const docId = getProtyleDocId(activeProtyle) || this.syncPairedCursor();
      void this.actionRunner.runAction("float-selected-text", docId, activeProtyle);
    },
    getClipboardItems: () => this.clipboardMonitor.getItems(),
    ensureClipboardLoaded: async () => {
      const items = await this.clipboardMonitor.ensureLoaded();
      this.clipboardMonitor.syncNow();
      return this.clipboardMonitor.getItems().length > 0 ? this.clipboardMonitor.getItems() : items;
    },
    onClipboardCopy: (item) => this.clipboardMonitor.copyItem(item),
    onClipboardCopyMerged: (ids) => this.clipboardMonitor.copyMergedItems(ids),
    onClipboardAggregate: (ids) => this.clipboardMonitor.aggregateItems(ids),
    onClipboardToggleFavorite: (id) => this.clipboardMonitor.toggleFavorite(id),
    onClipboardDelete: (id) => this.clipboardMonitor.deleteItem(id),
    onClipboardDeleteBatch: (ids) => this.clipboardMonitor.deleteItems(ids),
    onClipboardClearNonFavorites: () => this.clipboardMonitor.clearNonFavorites(),
    onClipboardOpenFileLocation: (filePath) => this.clipboardMonitor.openFileLocation(filePath),
    resolveClipboardImageUrl: (fileName) => this.clipboardMonitor.getImageDataUrl(fileName),
    getConfig: () => ({
      enabled: this.menuState.dynamicOutlineEnabled,
      followKeyInfo: this.menuState.dynamicOutlineFollowKeyInfo,
      quickSwitchEnabled: this.menuState.dynamicOutlineQuickSwitchEnabled,
      position: this.menuState.dynamicOutlinePosition,
      viewModes: this.menuState.dynamicOutlineViewModes,
      openDocsExpanded: this.menuState.dynamicOutlineOpenDocsExpanded,
      recentDocsExpanded: this.menuState.dynamicOutlineRecentDocsExpanded
    })
  });

  private readonly mouseGestureController = createMouseGestureController({
    getApp: () => this.app,
    isEnabled: () => this.menuState.mouseGestureEnabled && !this.isMobile,
    getBindings: () => this.menuState.mouseGestureBindings
  });

  private readonly powerButtonsProvider: PowerButtonsCommandProvider = createPowerButtonsProvider({
    pluginVersion: pluginInfo.version,
    runAction: (action, context) => this.actionRunner.runAction(action, context, this.currentProtyle)
  });

  private readonly actionRunner: ActionRunner = new ActionRunner({
    isMobile: () => this.isMobile,
    resolveDocId: (explicitId?: string, protyle?: ProtyleLike) =>
      this.resolveDocId(explicitId, protyle),
    askConfirm: (title, text, detailItems) => this.askConfirm(title, text, detailItems),
    setBusy: (busy) => this.setActionBusy(busy),
    setBackgroundActionRunning: (action, _docId, running) =>
      this.keyInfoController.setDocActionRunning(action, running),
    getKeyInfoFilter: (): KeyInfoFilter | undefined => this.keyInfoController.getCurrentFilter(),
    getAiSummaryConfig: () => this.managedAiConfig || this.menuState.aiSummaryConfig,
    resolveNetworkLensPlugin: () => resolveNetworkLensPluginFromPlugins(this.app?.plugins),
    resolveCanvasPlugin: () => resolveCanvasPluginFromPlugins(this.app?.plugins)
  });

  private readonly keyInfoController: KeyInfoController = new KeyInfoController({
    isMobile: () => this.isMobile,
    // 成对消费入口做游标重同步：显式 docId 更新与 protyle 失步时以 protyle 为准（审计 2.2）
    getCurrentDocId: () => this.syncPairedCursor(),
    getCurrentProtyle: () => this.currentProtyle,
    getKeyInfoFilter: () => this.menuState.keyInfoFilterState,
    setKeyInfoFilter: (filter) => this.setKeyInfoFilter(filter),
    resolveDocId: (explicitId?: string, protyle?: ProtyleLike) =>
      this.resolveDocId(explicitId, protyle),
    runAction: async (action, explicitId, protyle): Promise<void> => {
      await this.actionRunner.runAction(action, explicitId, protyle);
    },
    actions: () => this.getDockActions(),
    getDocMenuRegistrationState: () => this.menuState.docMenuRegistrationState,
    setAllDocMenuRegistration: (enabled) => this.setAllDocMenuRegistration(enabled),
    setSingleDocMenuRegistration: (key, enabled) =>
      this.setSingleDocMenuRegistration(key, enabled),
    setDocActionOrder: (order) => this.setDocActionOrder(order),
    resetDocActionOrder: () => this.resetDocActionOrder(),
    getDocFavoriteActionKeys: () => this.menuState.docFavoriteActionKeys,
    setDocActionFavorite: (key, favorited) =>
      this.setDocActionFavorite(key, favorited),
    setDocFavoriteActionOrder: (order) =>
      this.setDocFavoriteActionOrder(order),
    resolveCanvasPlugin: () => resolveCanvasPluginFromPlugins(this.app?.plugins),
    getStartupDocProcessTabEnabled: () => this.menuState.startupDocProcessTabEnabled
  });

  private readonly onSwitchProtyle = (event: CustomEvent<{ protyle?: ProtyleLike }>) => {
    const protyle = event.detail?.protyle;
    const id = getProtyleDocId(protyle);
    if (!id) {
      return;
    }
    this.currentDocId = id;
    this.currentProtyle = protyle;
    void this.keyInfoController.refresh(id, protyle);
    this.dynamicOutlineController.syncActiveEditor(protyle);
  };

  private readonly onEditorTitleMenu = (event: CustomEvent<{
    menu?: {
      addSeparator: () => void;
      addItem: (config: { icon: string; label: string; click: () => void }) => void;
    };
    data?: { id?: string };
    protyle?: ProtyleLike;
  }>) => {
    const detail = event.detail;
    const menu = detail?.menu;
    const docId = detail?.data?.id;
    if (!menu || !docId) {
      return;
    }
    this.currentDocId = docId;
    if (detail.protyle) {
      this.currentProtyle = detail.protyle;
    }

    populateEditorTitleMenu({
      menu,
      docId,
      protyle: detail.protyle,
      actions: this.getOrderedActions(),
      docMenuRegistrationState: this.menuState.docMenuRegistrationState,
      docActionEnabledState: this.menuState.docActionEnabledState,
      runAction: async (action, explicitId, protyle) => {
        await this.actionRunner.runAction(action, explicitId, protyle);
      }
    });
  };

  private readonly onContentMenu = (event: CustomEvent<{
    menu?: {
      addItem: (config: { icon: string; label: string; click: () => void }) => void;
      addSeparator?: () => void;
    };
    range?: Range;
    protyle?: ProtyleLike;
  }>) => {
    const detail = event.detail;
    if (!detail?.menu) {
      return;
    }
    if (
      isFloatSelectedTextHidden(
        getHiddenActionKeys(ALPHA_FEATURE_HIDE_CONFIG),
        this.menuState.docActionEnabledState
      )
    ) {
      return;
    }
    addFloatSelectedTextContentMenuItem({
      menu: detail.menu,
      protyle: detail.protyle,
      range: detail.range,
      openFloatingText: (text) => void floatingTextService.openFloatingText(text)
    });
  };

  private readonly onBlockIconMenu = (event: CustomEvent<{
    menu?: {
      addItem: (config: { icon: string; label: string; click: () => void }) => void;
      addSeparator?: () => void;
    };
    protyle?: ProtyleLike;
    blockElements?: HTMLElement[];
  }>) => {
    const detail = event.detail;
    if (!detail?.menu) {
      return;
    }
    if (
      isFloatSelectedTextHidden(
        getHiddenActionKeys(ALPHA_FEATURE_HIDE_CONFIG),
        this.menuState.docActionEnabledState
      )
    ) {
      return;
    }

    const protyle = detail.protyle;
    addFloatSelectedTextBlockMenuItem({
      menu: detail.menu,
      protyle,
      blockElements: detail.blockElements,
      openFloatingText: (text) => void floatingTextService.openFloatingText(text),
      runFloatActionFallback: () => {
        const docId = getProtyleDocId(protyle as ProtyleLike) || this.currentDocId;
        void this.actionRunner.runAction("float-selected-text", docId, protyle as ProtyleLike);
      }
    });
  };

  private readonly onDocTreeMenu = (event: CustomEvent<{
    menu?: {
      addItem: (config: { icon: string; label: string; click: () => void }) => void;
    };
    elements?: NodeListOf<HTMLElement>;
    type?: string;
  }>) => {
    const detail = event.detail;
    addFloatDocTreeMenuItem({
      menu: detail?.menu,
      elements: detail?.elements,
      eventType: detail?.type,
      openFloatingDoc: (docId) => void floatingTextService.openFloatingDoc(docId)
    });
  };

  async onload() {
    this.unloaded = false;
    if (!this.displayName) {
      this.displayName =
        pluginInfo.displayName?.zh_CN ||
        pluginInfo.displayName?.default ||
        "文档助手";
    }
    const frontend = getFrontend();
    this.isMobile = frontend === "mobile" || frontend === "browser-mobile";
    await this.loadDocMenuRegistrationState();
    if (this.unloaded) {
      return;
    }
    this.setting = this.buildPluginSettingPage();

    bindPluginLifecycleEvents(this.eventBus, {
      onSwitchProtyle: this.onSwitchProtyle,
      onEditorTitleMenu: this.onEditorTitleMenu,
      onContentMenu: this.onContentMenu,
      onDocTreeMenu: this.onDocTreeMenu,
      onBlockIconMenu: this.onBlockIconMenu
    });
    this.addIcons(DOC_ASSIST_ICON_SVG);
    this.keyInfoController.registerDock(this);

    registerPluginCommands({
      actions: this.getOrderedActions(),
      register: (config) => this.addCommand(config),
      runAction: async (action, explicitId, protyle) => {
        await this.actionRunner.runAction(action, explicitId, protyle);
      }
    });

    this.apiSwitchHandle = setupApiSwitchSync({
      pluginName: this.name,
      pluginDisplayName: this.displayName,
      aiSummaryConfig: this.menuState.aiSummaryConfig,
      onManagedConfigChange: (config) => {
        this.managedAiConfig = config;
        if (this.setting) {
          const updater = (this.setting as unknown as {
            updateManagedConfig?: (cfg: AiServiceConfig | null) => void;
          }).updateManagedConfig;
          if (typeof updater === "function") {
            updater(config);
          }
        }
      }
    });
    setTransactionDebugLogEnabled(this.menuState.debugLogEnabled);

    if (!this.isMobile) {
      this.mouseGestureController.bind();
    }

    bindPluginFloatingPersistence((cfg) => {
      this.menuState = { ...this.menuState, floatingConfig: cfg };
      void this.persistDocMenuRegistrationState();
    });

    this.dynamicOutlineController.syncActiveEditor(
      getActiveEditor()?.protyle as ProtyleLike | undefined
    );
    this.syncClipboardMonitorLifecycle();
  }

  onunload() {
    this.unloaded = true;
    // 自兜底：旧版前端卸载插件时不会强制关闭已打开的设置对话框（2026-09 起官方
    // loader 才加入 plugin.setting?.close()），主动关闭以覆盖旧版内核（审计 4.2）。
    try {
      this.setting?.close();
    } catch {
      // 对话框未打开或已销毁时忽略
    }
    this.apiSwitchHandle?.dispose();
    this.apiSwitchHandle = undefined;
    bindPluginFloatingPersistence(null);
    disposeFloatingWindowHostGlobals();
    resetFloatingTextConfigCache();
    unbindPluginLifecycleEvents(this.eventBus, {
      onSwitchProtyle: this.onSwitchProtyle,
      onEditorTitleMenu: this.onEditorTitleMenu,
      onContentMenu: this.onContentMenu,
      onDocTreeMenu: this.onDocTreeMenu,
      onBlockIconMenu: this.onBlockIconMenu
    });
    this.actionRunner.dispose();
    rangeSelectionObserverManager.deactivate();
    this.dynamicOutlineNavigation.destroy();
    this.keyInfoController.destroy();
    this.dynamicOutlineController.destroy();
    this.clipboardMonitor.stop();
    this.mouseGestureController.destroy();
    destroyActionProcessingOverlay();
    this.currentDocId = "";
    this.currentProtyle = undefined;
  }

  openSetting() {
    this.setting = this.buildPluginSettingPage();
    this.setting.open(this.name);
  }

  public updateProtyleToolbar(toolbar: Array<string | IMenuItem>): Array<string | IMenuItem> {
    if (!toolbar) {
      return toolbar;
    }
    if (
      getHiddenActionKeys(ALPHA_FEATURE_HIDE_CONFIG).has("float-selected-text") ||
      this.menuState?.docActionEnabledState?.["float-selected-text"] === false
    ) {
      return toolbar;
    }
    const hasItem = toolbar.some(
      (item) => typeof item === "object" && item?.name === "float-selected-text"
    );
    if (!hasItem) {
      if (toolbar.length > 0 && toolbar[toolbar.length - 1] !== "|") {
        toolbar.push("|");
      }
      toolbar.push({
        name: "float-selected-text",
        icon: "iconPin",
        tipPosition: "n",
        tip: "悬浮选中文本",
        click: (protyle: any) => {
          const docId = getProtyleDocId(protyle as ProtyleLike);
          void this.actionRunner.runAction("float-selected-text", docId, protyle as ProtyleLike);
        }
      });
    }
    return toolbar;
  }

  public getPowerButtonsIntegration(): PowerButtonsCommandProvider {
    return this.powerButtonsProvider;
  }

  // 游标成对校验：不一致时以 protyle 为准写回 docId（审计遗留项 2.2）。
  // resolveDocId 的写入副作用保持不变（现有流程隐式依赖，测试锁定其调用契约）。
  private syncPairedCursor(): string {
    const paired = resolvePairedCursorDocId(this.currentDocId, this.currentProtyle);
    if (paired !== this.currentDocId) {
      this.currentDocId = paired;
    }
    return paired;
  }

  private resolveDocId(explicitId?: string, protyle?: ProtyleLike): string {
    if (explicitId) {
      this.currentDocId = explicitId;
      if (protyle) {
        this.currentProtyle = protyle;
      }
      return explicitId;
    }
    const fromProtyle = getProtyleDocId(protyle);
    if (fromProtyle) {
      this.currentDocId = fromProtyle;
      this.currentProtyle = protyle;
      return fromProtyle;
    }
    const activeEditor = getActiveEditor();
    const activeId = getProtyleDocId(activeEditor?.protyle as ProtyleLike | undefined);
    if (activeId) {
      this.currentDocId = activeId;
      if (activeEditor?.protyle) {
        this.currentProtyle = activeEditor.protyle as ProtyleLike;
      }
      return activeId;
    }
    return this.currentDocId;
  }

  private async askConfirm(
    title: string,
    text: string,
    detailItems?: ConfirmDetailItem[]
  ): Promise<boolean> {
    return askConfirmWithDetail(title, text, detailItems);
  }

  private setActionBusy(busy: boolean) {
    if (busy) {
      showActionProcessingOverlay("文档处理中，请稍候...");
      return;
    }
    hideActionProcessingOverlay();
  }

  private buildPluginSettingPage() {
    return buildPluginLifecycleSettingPage({
      actions: this.getOrderedActions(),
      state: this.menuState,
      isMobile: this.isMobile,
      managedAiConfig: this.managedAiConfig,
      onAiSummaryConfigChange: (config) => this.setAiSummaryConfig(config),
      onToggleAllEnabled: (enabled) => this.setAllDocActionEnabled(enabled),
      onToggleAllMenu: (enabled) => this.setAllDocMenuRegistration(enabled),
      onToggleSingleEnabled: (key, enabled) => this.setSingleDocActionEnabled(key, enabled),
      onToggleSingleMenu: (key, enabled) => this.setSingleDocMenuRegistration(key, enabled),
      onDebugLogEnabledChange: (enabled) => this.setDebugLogEnabled(enabled),
      onAutoPasteOnSelectChange: (enabled) =>
        this.setFloatingConfig({ autoPasteOnSelect: enabled }),
      onStartupDocProcessTabEnabledChange: (enabled) =>
        this.setStartupDocProcessTabEnabled(enabled),
      onMouseGestureEnabledChange: (enabled) => this.setMouseGestureEnabled(enabled),
      onMouseGestureBindingsChange: (bindings) => this.setMouseGestureBindings(bindings),
      onGestureRecordingChange: (recording) =>
        this.mouseGestureController.setSuspended(recording),
      onDynamicOutlineEnabledChange: (enabled) => this.setDynamicOutlineEnabled(enabled),
      onDynamicOutlineFollowKeyInfoChange: (follow) =>
        this.setDynamicOutlineFollowKeyInfo(follow),
      onDynamicOutlineQuickSwitchEnabledChange: (enabled) =>
        this.setDynamicOutlineQuickSwitchEnabled(enabled),
      onDynamicOutlineViewModesChange: (modes) => this.setDynamicOutlineViewModes(modes)
    });
  }

  private async loadDocMenuRegistrationState() {
    try {
      const raw = await this.loadData(this.docMenuRegistrationStorageName);
      this.applyDocMenuState(normalizePluginDocMenuState(raw, ACTIONS));
    } catch (error: unknown) {
      this.applyDocMenuState(buildDefaultPluginDocMenuState(ACTIONS));
      const message = error instanceof Error ? error.message : String(error);
      showMessage(`读取菜单注册配置失败：${message}`, 5000, "error");
    }
  }

  private persistDocMenuRegistrationState(): Promise<void> {
    const snapshot = serializePluginDocMenuState(this.menuState);
    const epoch = ++this.persistEpoch;
    const runSave = async () => {
      try {
        await this.saveData(this.docMenuRegistrationStorageName, snapshot);
      } catch (error: unknown) {
        // A failed save previously produced an unhandled rejection and silently
        // forked the in-memory state from disk; surface it like load failures do.
        const message = error instanceof Error ? error.message : String(error);
        showMessage(`保存插件配置失败：${message}`, 5000, "error");
      } finally {
        if (this.persistEpoch === epoch) {
          this.persistInFlight = false;
        }
      }
    };

    let nextPersist: Promise<void>;
    if (!this.persistInFlight) {
      this.persistInFlight = true;
      nextPersist = runSave();
    } else {
      nextPersist = this.persistQueue.then(runSave);
    }
    this.persistQueue = nextPersist.catch(() => undefined);
    return nextPersist;
  }

  private getOrderedActions() {
    return filterVisibleActions(
      getOrderedPluginActions(ACTIONS, this.menuState),
      ALPHA_FEATURE_HIDE_CONFIG
    );
  }

  private getDockActions() {
    return filterDockVisibleActions(
      this.getOrderedActions(),
      this.menuState.docActionEnabledState
    );
  }

  private applyDocMenuState(state: PluginDocMenuState) {
    this.menuState = state;
    this.syncClipboardMonitorLifecycle();
    setCachedFloatingTextConfig(state.floatingConfig);
    setTransactionDebugLogEnabled(state.debugLogEnabled);
    setDocAssistantDebugEnabled(state.debugLogEnabled);
  }

  private async updateMenuState(
    updater: (prev: PluginDocMenuState) => PluginDocMenuState,
    hooks?: { beforePersist?: () => void; afterPersist?: () => void }
  ) {
    this.applyDocMenuState(updater(this.menuState));
    hooks?.beforePersist?.();
    await this.persistDocMenuRegistrationState();
    hooks?.afterPersist?.();
  }

  async setAllDocActionEnabled(enabled: boolean) {
    await this.updateMenuState(
      (s) => setAllPluginDocActionEnabled(s, enabled),
      { afterPersist: () => this.keyInfoController.syncDocActions() }
    );
  }

  async setSingleDocActionEnabled(key: ActionKey, enabled: boolean) {
    await this.updateMenuState(
      (s) => setSinglePluginDocActionEnabled(s, key, enabled),
      { afterPersist: () => this.keyInfoController.syncDocActions() }
    );
  }

  async setAllDocMenuRegistration(enabled: boolean) {
    await this.updateMenuState(
      (s) => setAllPluginDocMenuRegistration(s, enabled),
      { afterPersist: () => this.keyInfoController.syncDocActions() }
    );
  }

  async setSingleDocMenuRegistration(key: ActionKey, enabled: boolean) {
    await this.updateMenuState(
      (s) => setSinglePluginDocMenuRegistration(s, key, enabled),
      { afterPersist: () => this.keyInfoController.syncDocActions() }
    );
  }

  async setDocActionOrder(order: ActionKey[]) {
    await this.updateMenuState(
      (s) => setPluginDocActionOrder(s, order, ACTIONS),
      { afterPersist: () => this.keyInfoController.syncDocActions() }
    );
  }

  async resetDocActionOrder() {
    await this.updateMenuState(
      (s) => resetPluginDocActionOrder(s, ACTIONS),
      { afterPersist: () => this.keyInfoController.syncDocActions() }
    );
  }

  async setDocActionFavorite(key: ActionKey, favorited: boolean) {
    await this.updateMenuState(
      (s) => setPluginDocActionFavorite(s, key, favorited),
      { afterPersist: () => this.keyInfoController.syncDocActions() }
    );
  }

  async setDocFavoriteActionOrder(order: ActionKey[]) {
    await this.updateMenuState(
      (s) => reorderPluginDocFavoriteActions(s, order),
      { afterPersist: () => this.keyInfoController.syncDocActions() }
    );
  }

  async setKeyInfoFilter(filter: KeyInfoFilter) {
    await this.updateMenuState(
      (s) => setPluginKeyInfoFilter(s, filter),
      {
        afterPersist: () => {
          if (this.menuState.dynamicOutlineFollowKeyInfo) {
            this.dynamicOutlineController.refresh();
          }
        }
      }
    );
  }

  async setAiSummaryConfig(config: AiServiceConfig) {
    await this.updateMenuState((s) => setAiSummaryConfig(s, config));
  }

  async setDebugLogEnabled(enabled: boolean) {
    await this.updateMenuState((s) => ({ ...s, debugLogEnabled: enabled }));
  }

  async setStartupDocProcessTabEnabled(enabled: boolean) {
    await this.updateMenuState(
      (s) => setPluginStartupDocProcessTabEnabled(s, enabled),
      {
        beforePersist: () => {
          if (enabled) {
            this.keyInfoController.setActiveTab("doc-process");
          }
        }
      }
    );
  }

  async setFloatingConfig(config: Partial<FloatingTextConfig>) {
    await this.updateMenuState((s) => setFloatingConfig(s, config));
  }

  async setMouseGestureEnabled(enabled: boolean) {
    await this.updateMenuState((s) => setPluginMouseGestureEnabled(s, enabled));
  }

  async setMouseGestureBindings(bindings: GestureBindings) {
    await this.updateMenuState((s) => setPluginMouseGestureBindings(s, bindings));
  }

  async setDynamicOutlineEnabled(enabled: boolean) {
    await this.updateMenuState(
      (s) => setPluginDynamicOutlineEnabled(s, enabled),
      { afterPersist: () => this.dynamicOutlineController.refresh() }
    );
  }

  async setDynamicOutlineFollowKeyInfo(follow: boolean) {
    await this.updateMenuState(
      (s) => setPluginDynamicOutlineFollowKeyInfo(s, follow),
      { afterPersist: () => this.dynamicOutlineController.refresh() }
    );
  }

  async setDynamicOutlineQuickSwitchEnabled(enabled: boolean) {
    await this.updateMenuState(
      (s) => setPluginDynamicOutlineQuickSwitchEnabled(s, enabled),
      { afterPersist: () => this.dynamicOutlineController.refresh() }
    );
  }

  async setDynamicOutlinePosition(position: DynamicOutlinePosition) {
    await this.updateMenuState((s) => setPluginDynamicOutlinePosition(s, position));
  }

  async setDynamicOutlineViewModes(modes: DynamicOutlineViewMode[]) {
    await this.updateMenuState(
      (s) => setPluginDynamicOutlineViewModes(s, modes),
      { afterPersist: () => this.dynamicOutlineController.refresh() }
    );
  }

  private syncClipboardMonitorLifecycle() {
    const shouldRun = shouldRunClipboardMonitor({
      isMobile: this.isMobile,
      state: this.menuState
    });
    if (this.menuState.debugLogEnabled) {
      console.info("[DocAssistant][Clipboard] syncLifecycle", {
        shouldRun,
        isMobile: this.isMobile,
        dynamicOutlineEnabled: this.menuState.dynamicOutlineEnabled,
        viewModes: this.menuState.dynamicOutlineViewModes
      });
    }
    if (shouldRun) {
      void this.clipboardMonitor.start();
    } else {
      this.clipboardMonitor.stop();
    }
  }

  async setDynamicOutlineDocSectionsExpanded(sections: {
    openDocsExpanded: boolean;
    recentDocsExpanded: boolean;
  }) {
    await this.updateMenuState((s) => setPluginDynamicOutlineDocSectionsExpanded(s, sections));
  }
}
