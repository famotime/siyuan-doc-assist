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
import { openPluginSettings } from "@/ui/plugin-settings";
import {
  destroyActionProcessingOverlay,
  hideActionProcessingOverlay,
  showActionProcessingOverlay,
} from "@/ui/action-processing-overlay";

export default class DocLinkToolkitPlugin extends Plugin {
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
    unbindPluginLifecycleEvents(this.eventBus, {
      onSwitchProtyle: this.onSwitchProtyle,
      onEditorTitleMenu: this.onEditorTitleMenu,
    });
    this.keyInfoController.destroy();
    destroyActionProcessingOverlay();
  }

  openSetting() {
    openPluginSettings({
      pluginName: this.name,
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

    const siblingTabs = Array.isArray(currentTab.parent?.children)
      ? currentTab.parent.children
      : [];
    const isKnownTab = this.knownTabIds.has(currentTab.id);
    siblingTabs.forEach((tab) => {
      if (tab?.id) {
        this.knownTabIds.add(tab.id);
      }
    });
    if (!this.keepNewDocAfterPinnedTabs || this.isMobile || isKnownTab) {
      return;
    }

    const nextId = resolveMoveTabNextIdAfterPinned(siblingTabs, currentTab.id);
    if (!nextId || typeof currentTab.parent?.moveTab !== "function") {
      return;
    }
    currentTab.parent.moveTab(currentTab, nextId);
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
