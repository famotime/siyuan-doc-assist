import {
  confirm,
  getActiveEditor,
  getFrontend,
  Plugin,
  showMessage,
} from "siyuan";
import {
  DocMenuRegistrationState,
} from "@/core/doc-menu-registration-core";
import { buildDefaultKeyInfoFilter, KeyInfoFilter } from "@/core/key-info-core";
import {
  collectLayoutTabIds,
  isPinnedTab,
  resolveMoveTabNextIdAfterPinned,
  type PinnedTabPlacementLike,
} from "@/core/pinned-tab-placement-core";
import { ActionRunner } from "@/plugin/action-runner";
import { ACTIONS, ActionKey } from "@/plugin/actions";
import { getProtyleDocId, ProtyleLike } from "@/plugin/doc-context";
import { KeyInfoController } from "@/plugin/key-info-controller";
import {
  bindPluginLifecycleEvents,
  unbindPluginLifecycleEvents,
} from "@/plugin/plugin-lifecycle-events";
import {
  populateEditorTitleMenu,
  registerPluginCommands,
} from "@/plugin/plugin-lifecycle-menu";
import {
  buildDefaultPluginDocMenuState,
  getOrderedPluginActions,
  PluginDocMenuState,
  normalizePluginDocMenuState,
  reorderPluginDocFavoriteActions,
  resetPluginDocActionOrder,
  serializePluginDocMenuState,
  setKeepNewDocAfterPinnedTabs,
  setAllPluginDocMenuRegistration,
  setPluginDocActionFavorite,
  setPluginDocActionOrder,
  setPluginKeyInfoFilter,
  setSinglePluginDocMenuRegistration,
} from "@/plugin/plugin-lifecycle-state";
import { createPluginSettings } from "@/ui/plugin-settings";
import {
  destroyActionProcessingOverlay,
  hideActionProcessingOverlay,
  showActionProcessingOverlay,
} from "@/ui/action-processing-overlay";

const KEY_INFO_DOCK_TYPE = "doc-assistant-keyinfo";
const DOC_ASSIST_TOPBAR_ICON_ID = "iconDocAssist";
const DOC_ASSIST_TOPBAR_ICON = `
<symbol id="${DOC_ASSIST_TOPBAR_ICON_ID}" viewBox="0 0 24 24">
  <path d="M6 3.75C4.757 3.75 3.75 4.757 3.75 6v12c0 1.243 1.007 2.25 2.25 2.25h12c1.243 0 2.25-1.007 2.25-2.25V8.561a2.25 2.25 0 0 0-.659-1.591l-2.561-2.561a2.25 2.25 0 0 0-1.591-.659H6Zm0 1.5h9.189c.199 0 .39.079.53.22l2.561 2.561c.141.14.22.331.22.53V18c0 .414-.336.75-.75.75H6a.75.75 0 0 1-.75-.75V6c0-.414.336-.75.75-.75Zm2.25 4.5a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 0-1.5h-7.5Zm0 3.75a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Z"></path>
  <path d="M15.75 13.75a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0-1.5a3.5 3.5 0 0 1 2.833 5.557l1.197 1.197a.75.75 0 1 1-1.06 1.06l-1.197-1.196a3.5 3.5 0 1 1-1.773-6.618Z"></path>
</symbol>`;

export default class DocLinkToolkitPlugin extends Plugin {
  private static readonly PINNED_TAB_PLACEMENT_RETRY_DELAYS = [0, 32, 96, 192];
  public setting?: ReturnType<typeof createPluginSettings>;
  private currentDocId = "";
  private currentProtyle?: ProtyleLike;
  private isMobile = false;
  private readonly docMenuRegistrationStorageName = "doc-menu-registration";
  private docMenuRegistrationState: DocMenuRegistrationState =
    buildDefaultPluginDocMenuState(ACTIONS).docMenuRegistrationState;
  private docActionOrderState: ActionKey[] =
    buildDefaultPluginDocMenuState(ACTIONS).docActionOrderState;
  private docFavoriteActionKeys: ActionKey[] = [];
  private keyInfoFilterState: KeyInfoFilter = buildDefaultKeyInfoFilter();
  private keepNewDocAfterPinnedTabs =
    buildDefaultPluginDocMenuState(ACTIONS).keepNewDocAfterPinnedTabs;
  private readonly knownTabIds = new Set<string>();
  private readonly pendingPinnedTabPlacementTasks =
    new Map<string, ReturnType<typeof setTimeout>>();

  private readonly actionRunner: ActionRunner = new ActionRunner({
    isMobile: () => this.isMobile,
    resolveDocId: (explicitId?: string, protyle?: ProtyleLike) =>
      this.resolveDocId(explicitId, protyle),
    askConfirm: (title, text) => this.askConfirm(title, text),
    setBusy: (busy) => this.setActionBusy(busy),
    getKeyInfoFilter: (): KeyInfoFilter | undefined => this.keyInfoController.getCurrentFilter(),
  });

  private readonly keyInfoController: KeyInfoController = new KeyInfoController({
    isMobile: () => this.isMobile,
    getCurrentDocId: () => this.currentDocId,
    getCurrentProtyle: () => this.currentProtyle,
    getKeyInfoFilter: () => this.keyInfoFilterState,
    setKeyInfoFilter: (filter) => this.setKeyInfoFilter(filter),
    resolveDocId: (explicitId?: string, protyle?: ProtyleLike) =>
      this.resolveDocId(explicitId, protyle),
    runAction: (action, explicitId, protyle): Promise<void> =>
      this.actionRunner.runAction(action, explicitId, protyle),
    actions: () => this.getOrderedActions(),
    getDocMenuRegistrationState: () => this.docMenuRegistrationState,
    setAllDocMenuRegistration: (enabled) => this.setAllDocMenuRegistration(enabled),
    setSingleDocMenuRegistration: (key, enabled) =>
      this.setSingleDocMenuRegistration(key, enabled),
    setDocActionOrder: (order) => this.setDocActionOrder(order),
    resetDocActionOrder: () => this.resetDocActionOrder(),
    getDocFavoriteActionKeys: () => this.docFavoriteActionKeys,
    setDocActionFavorite: (key, favorited) =>
      this.setDocActionFavorite(key, favorited),
    setDocFavoriteActionOrder: (order) =>
      this.setDocFavoriteActionOrder(order),
  });

  private readonly onSwitchProtyle = (event: CustomEvent<{ protyle?: ProtyleLike }>) => {
    const protyle = event.detail?.protyle;
    const id = getProtyleDocId(protyle);
    if (!id) {
      return;
    }
    this.currentDocId = id;
    this.currentProtyle = protyle;
    this.keepPinnedTabsVisibleOnNewDoc(protyle);
    void this.keyInfoController.refresh(id, protyle);
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
      docMenuRegistrationState: this.docMenuRegistrationState,
      runAction: (action, explicitId, protyle) =>
        this.actionRunner.runAction(action, explicitId, protyle),
    });
  };

  async onload() {
    await this.loadDocMenuRegistrationState();
    const frontend = getFrontend();
    this.isMobile = frontend === "mobile" || frontend === "browser-mobile";
    this.seedKnownTabIds();
    this.setting = this.buildPluginSettingPage();
    const pluginApi = this as DocLinkToolkitPlugin & {
      addIcons?: (svg: string) => void;
      addTopBar?: (options: {
        icon: string;
        title: string;
        callback: (event: MouseEvent) => void;
        position?: "right" | "left";
      }) => HTMLElement;
    };
    if (typeof pluginApi.addIcons === "function") {
      pluginApi.addIcons(DOC_ASSIST_TOPBAR_ICON);
    }
    if (typeof pluginApi.addTopBar === "function") {
      this.registerTopBarEntry();
    }

    bindPluginLifecycleEvents(this.eventBus, {
      onSwitchProtyle: this.onSwitchProtyle,
      onEditorTitleMenu: this.onEditorTitleMenu,
    });
    this.keyInfoController.registerDock(this);

    registerPluginCommands({
      actions: this.getOrderedActions(),
      register: (config) => this.addCommand(config),
      runAction: (action, explicitId, protyle) =>
        this.actionRunner.runAction(action, explicitId, protyle),
    });
  }

  onunload() {
    this.clearPendingPinnedTabPlacementTasks();
    unbindPluginLifecycleEvents(this.eventBus, {
      onSwitchProtyle: this.onSwitchProtyle,
      onEditorTitleMenu: this.onEditorTitleMenu,
    });
    this.keyInfoController.destroy();
    destroyActionProcessingOverlay();
  }

  openSetting() {
    this.setting = this.buildPluginSettingPage();
    this.setting.open(this.name);
  }

  private registerTopBarEntry() {
    (
      this as DocLinkToolkitPlugin & {
        addTopBar: (options: {
          icon: string;
          title: string;
          callback: (event: MouseEvent) => void;
          position?: "right" | "left";
        }) => HTMLElement;
      }
    ).addTopBar({
      icon: DOC_ASSIST_TOPBAR_ICON_ID,
      title: "文档助手",
      callback: () => {
        this.openKeyInfoDockFromTopBar();
      },
    });
  }

  private openKeyInfoDockFromTopBar() {
    if (typeof window === "undefined") {
      return;
    }

    const siyuan = (window as Window & {
      siyuan?: {
        layout?: {
          rightDock?: {
            toggleModel?: (
              type: string,
              show?: boolean,
              close?: boolean,
              hide?: boolean,
              isSaveLayout?: boolean
            ) => void;
          };
        };
      };
    }).siyuan;
    const toggleModel = siyuan?.layout?.rightDock?.toggleModel;
    if (typeof toggleModel === "function") {
      toggleModel(KEY_INFO_DOCK_TYPE, true, false, false);
    }
    void this.keyInfoController.refresh(this.currentDocId, this.currentProtyle);
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

  private async askConfirm(title: string, text: string): Promise<boolean> {
    return new Promise((resolve) => {
      confirm(
        title,
        text,
        () => resolve(true),
        () => resolve(false)
      );
    });
  }

  private setActionBusy(busy: boolean) {
    if (busy) {
      showActionProcessingOverlay("文档处理中，请稍候...");
      return;
    }
    hideActionProcessingOverlay();
  }

  private buildPluginSettingPage() {
    return createPluginSettings({
      actions: this.getOrderedActions(),
      registration: this.docMenuRegistrationState,
      isMobile: this.isMobile,
      keepNewDocAfterPinnedTabs: this.keepNewDocAfterPinnedTabs,
      onToggleKeepNewDocAfterPinnedTabs: (enabled) =>
        this.setKeepNewDocAfterPinnedTabs(enabled),
      onToggleAll: (enabled) => this.setAllDocMenuRegistration(enabled),
      onToggleSingle: (key, enabled) =>
        this.setSingleDocMenuRegistration(key, enabled),
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

  private async persistDocMenuRegistrationState() {
    await this.saveData(
      this.docMenuRegistrationStorageName,
      serializePluginDocMenuState(this.snapshotDocMenuState())
    );
  }

  private getOrderedActions() {
    return getOrderedPluginActions(ACTIONS, this.snapshotDocMenuState());
  }

  private snapshotDocMenuState(): PluginDocMenuState {
    return {
      docMenuRegistrationState: this.docMenuRegistrationState,
      docActionOrderState: this.docActionOrderState,
      docFavoriteActionKeys: this.docFavoriteActionKeys,
      keyInfoFilterState: this.keyInfoFilterState,
      keepNewDocAfterPinnedTabs: this.keepNewDocAfterPinnedTabs,
    };
  }

  private applyDocMenuState(state: PluginDocMenuState) {
    this.docMenuRegistrationState = state.docMenuRegistrationState;
    this.docActionOrderState = state.docActionOrderState;
    this.docFavoriteActionKeys = state.docFavoriteActionKeys;
    this.keyInfoFilterState = state.keyInfoFilterState;
    this.keepNewDocAfterPinnedTabs = state.keepNewDocAfterPinnedTabs;
  }

  async setAllDocMenuRegistration(enabled: boolean) {
    this.applyDocMenuState(
      setAllPluginDocMenuRegistration(this.snapshotDocMenuState(), enabled)
    );
    await this.persistDocMenuRegistrationState();
    this.keyInfoController.syncDocActions();
  }

  async setSingleDocMenuRegistration(key: ActionKey, enabled: boolean) {
    this.applyDocMenuState(
      setSinglePluginDocMenuRegistration(this.snapshotDocMenuState(), key, enabled)
    );
    await this.persistDocMenuRegistrationState();
    this.keyInfoController.syncDocActions();
  }

  async setDocActionOrder(order: ActionKey[]) {
    this.applyDocMenuState(
      setPluginDocActionOrder(this.snapshotDocMenuState(), order, ACTIONS)
    );
    await this.persistDocMenuRegistrationState();
    this.keyInfoController.syncDocActions();
  }

  async resetDocActionOrder() {
    this.applyDocMenuState(
      resetPluginDocActionOrder(this.snapshotDocMenuState(), ACTIONS)
    );
    await this.persistDocMenuRegistrationState();
    this.keyInfoController.syncDocActions();
  }

  async setDocActionFavorite(key: ActionKey, favorited: boolean) {
    this.applyDocMenuState(
      setPluginDocActionFavorite(this.snapshotDocMenuState(), key, favorited)
    );
    await this.persistDocMenuRegistrationState();
    this.keyInfoController.syncDocActions();
  }

  async setDocFavoriteActionOrder(order: ActionKey[]) {
    this.applyDocMenuState(
      reorderPluginDocFavoriteActions(this.snapshotDocMenuState(), order)
    );
    await this.persistDocMenuRegistrationState();
    this.keyInfoController.syncDocActions();
  }

  async setKeyInfoFilter(filter: KeyInfoFilter) {
    this.applyDocMenuState(
      setPluginKeyInfoFilter(this.snapshotDocMenuState(), filter)
    );
    await this.persistDocMenuRegistrationState();
  }

  async setKeepNewDocAfterPinnedTabs(enabled: boolean) {
    this.applyDocMenuState(
      setKeepNewDocAfterPinnedTabs(this.snapshotDocMenuState(), enabled)
    );
    await this.persistDocMenuRegistrationState();
  }

  private seedKnownTabIds() {
    if (typeof window === "undefined") {
      return;
    }

    const siyuan = (window as Window & {
      siyuan?: {
        layout?: {
          centerLayout?: unknown;
        };
        config?: {
          uiLayout?: {
            layout?: unknown;
          };
        };
      };
    }).siyuan;
    for (const id of collectLayoutTabIds(siyuan?.layout?.centerLayout)) {
      this.knownTabIds.add(id);
    }
    for (const id of collectLayoutTabIds(siyuan?.config?.uiLayout?.layout)) {
      this.knownTabIds.add(id);
    }
  }

  private keepPinnedTabsVisibleOnNewDoc(protyle?: ProtyleLike) {
    const currentTab = this.getProtyleTab(protyle);
    if (!currentTab?.id) {
      return;
    }

    if (!this.keepNewDocAfterPinnedTabs || this.isMobile) {
      return;
    }

    const siblingTabs = Array.isArray(currentTab.parent?.children)
      ? currentTab.parent.children
      : [];
    const isKnownTab = this.knownTabIds.has(currentTab.id);
    siblingTabs.forEach((tab) => {
      if (tab?.id) {
        this.knownTabIds.add(tab.id);
      }
    });
    this.knownTabIds.add(currentTab.id);
    if (isKnownTab) {
      return;
    }

    this.placeTabBehindPinnedAndKeepPinnedVisible(currentTab);
    this.schedulePinnedTabPlacementRetry(currentTab.id, protyle);
  }

  private placeTabBehindPinnedAndKeepPinnedVisible(currentTab: PluginTabLike) {
    const siblingTabs = this.getSiblingTabs(currentTab);
    if (!siblingTabs.length) {
      return;
    }

    const desiredIndex = this.getPinnedTabBoundaryIndex(siblingTabs);
    if (desiredIndex < 0) {
      this.revealPinnedTabHeaders(siblingTabs);
      return;
    }
    const currentIndex = siblingTabs.findIndex((tab) => tab.id === currentTab.id);
    if (currentIndex < 0) {
      this.revealPinnedTabHeaders(siblingTabs);
      return;
    }
    if (currentIndex === desiredIndex) {
      this.revealPinnedTabHeaders(siblingTabs);
      return;
    }

    const moveTab = currentTab.parent?.moveTab;
    if (typeof moveTab !== "function") {
      this.revealPinnedTabHeaders(siblingTabs);
      return;
    }

    let latestTabs = siblingTabs;
    const nextId = resolveMoveTabNextIdAfterPinned(latestTabs, currentTab.id);
    if (nextId) {
      try {
        moveTab(currentTab, nextId);
        latestTabs = this.getSiblingTabs(currentTab);
      } catch {
        latestTabs = this.getSiblingTabs(currentTab);
      }
    }

    this.revealPinnedTabHeaders(latestTabs);
  }

  private schedulePinnedTabPlacementRetry(
    tabId: string,
    protyle?: ProtyleLike,
    attempt = 0
  ) {
    const delay =
      DocLinkToolkitPlugin.PINNED_TAB_PLACEMENT_RETRY_DELAYS[attempt];
    if (typeof delay === "undefined") {
      return;
    }

    if (attempt === 0) {
      const pending = this.pendingPinnedTabPlacementTasks.get(tabId);
      if (typeof pending !== "undefined") {
        clearTimeout(pending);
      }
    }

    const task = setTimeout(() => {
      this.pendingPinnedTabPlacementTasks.delete(tabId);
      if (!this.keepNewDocAfterPinnedTabs || this.isMobile) {
        return;
      }
      const currentTab = this.getProtyleTab(protyle);
      if (!currentTab || currentTab.id !== tabId) {
        return;
      }
      this.placeTabBehindPinnedAndKeepPinnedVisible(currentTab);
      this.schedulePinnedTabPlacementRetry(tabId, protyle, attempt + 1);
    }, delay);
    this.pendingPinnedTabPlacementTasks.set(tabId, task);
  }

  private clearPendingPinnedTabPlacementTasks() {
    this.pendingPinnedTabPlacementTasks.forEach((task) => {
      clearTimeout(task);
    });
    this.pendingPinnedTabPlacementTasks.clear();
  }

  private revealPinnedTabHeaders(tabs: PluginTabLike[]) {
    const firstPinnedTab = tabs.find((tab) => isPinnedTab(tab));
    const headElement = firstPinnedTab?.headElement;
    if (!headElement || !(headElement instanceof HTMLElement)) {
      return;
    }
    if (typeof headElement.scrollIntoView === "function") {
      headElement.scrollIntoView({
        block: "nearest",
        inline: "start",
      });
      return;
    }
    const tabStrip = headElement.parentElement;
    if (tabStrip) {
      tabStrip.scrollLeft = 0;
    }
  }

  private getSiblingTabs(currentTab: PluginTabLike): PluginTabLike[] {
    return Array.isArray(currentTab.parent?.children)
      ? currentTab.parent.children
      : [];
  }

  private getPinnedTabBoundaryIndex(tabs: PluginTabLike[]): number {
    let lastPinnedIndex = -1;
    tabs.forEach((tab, index) => {
      if (isPinnedTab(tab)) {
        lastPinnedIndex = index;
      }
    });
    if (lastPinnedIndex < 0) {
      return -1;
    }
    return lastPinnedIndex + 1;
  }

  private getProtyleTab(protyle?: ProtyleLike): PluginTabLike | null {
    const tab = protyle?.model?.parent as PluginTabLike | undefined;
    if (!tab || typeof tab !== "object") {
      return null;
    }
    return typeof tab.id === "string" ? tab : null;
  }
}

type PluginTabLike = PinnedTabPlacementLike & {
  id: string;
  parent?: {
    children?: PluginTabLike[];
    moveTab?: (tab: PluginTabLike, nextId?: string) => void;
  };
};
