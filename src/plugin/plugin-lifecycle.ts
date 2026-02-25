import {
  confirm,
  getActiveEditor,
  getFrontend,
  Plugin,
  showMessage,
} from "siyuan";
import {
  buildDefaultDocActionOrder,
  buildDefaultDocMenuRegistration,
  DocMenuRegistrationState,
  DocMenuRegistrationStorageV1,
  filterDocMenuActions,
  normalizeDocActionOrder,
  normalizeDocMenuRegistration,
  setAllDocMenuRegistration as setAllDocMenuRegistrationState,
  setSingleDocMenuRegistration as setSingleDocMenuRegistrationState,
  sortActionsByOrder,
} from "@/core/doc-menu-registration-core";
import { ActionRunner } from "@/plugin/action-runner";
import { ACTIONS, ActionKey } from "@/plugin/actions";
import { getProtyleDocId, ProtyleLike } from "@/plugin/doc-context";
import { KeyInfoController } from "@/plugin/key-info-controller";
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
    buildDefaultDocMenuRegistration(ACTIONS);
  private docActionOrderState: ActionKey[] = buildDefaultDocActionOrder(ACTIONS);

  private readonly actionRunner = new ActionRunner({
    isMobile: () => this.isMobile,
    resolveDocId: (explicitId?: string, protyle?: ProtyleLike) =>
      this.resolveDocId(explicitId, protyle),
    askConfirm: (title, text) => this.askConfirm(title, text),
    setBusy: (busy) => this.setActionBusy(busy),
  });

  private readonly keyInfoController = new KeyInfoController({
    isMobile: () => this.isMobile,
    getCurrentDocId: () => this.currentDocId,
    getCurrentProtyle: () => this.currentProtyle,
    resolveDocId: (explicitId?: string, protyle?: ProtyleLike) =>
      this.resolveDocId(explicitId, protyle),
    runAction: (action, explicitId, protyle) =>
      this.actionRunner.runAction(action, explicitId, protyle),
    actions: () => this.getOrderedActions(),
    getDocMenuRegistrationState: () => this.docMenuRegistrationState,
    setAllDocMenuRegistration: (enabled) => this.setAllDocMenuRegistration(enabled),
    setSingleDocMenuRegistration: (key, enabled) =>
      this.setSingleDocMenuRegistration(key, enabled),
    setDocActionOrder: (order) => this.setDocActionOrder(order),
    resetDocActionOrder: () => this.resetDocActionOrder(),
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

    const menuActions = filterDocMenuActions(
      this.getOrderedActions(),
      this.docMenuRegistrationState
    );
    if (!menuActions.length) {
      return;
    }
    menu.addSeparator();
    for (const action of menuActions) {
      menu.addItem({
        icon: action.icon,
        label: action.menuText,
        click: () => {
          void this.actionRunner.runAction(action.key, docId, detail.protyle);
        },
      });
    }
  };

  async onload() {
    await this.loadDocMenuRegistrationState();
    const frontend = getFrontend();
    this.isMobile = frontend === "mobile" || frontend === "browser-mobile";

    this.eventBus.on("switch-protyle", this.onSwitchProtyle);
    this.eventBus.on("click-editortitleicon", this.onEditorTitleMenu);
    this.keyInfoController.registerDock(this);

    this.getOrderedActions().forEach((action) => {
      const run = () => {
        void this.actionRunner.runAction(action.key);
      };
      this.addCommand({
        langKey: `docLinkToolkit.${action.key}`,
        langText: action.commandText,
        hotkey: "",
        callback: run,
        editorCallback: (protyle: unknown) => {
          void this.actionRunner.runAction(action.key, undefined, protyle as ProtyleLike);
        },
      });
    });
  }

  onunload() {
    this.eventBus.off("switch-protyle", this.onSwitchProtyle);
    this.eventBus.off("click-editortitleicon", this.onEditorTitleMenu);
    this.keyInfoController.destroy();
    destroyActionProcessingOverlay();
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
      this.docMenuRegistrationState = normalizeDocMenuRegistration(raw, ACTIONS);
      this.docActionOrderState = normalizeDocActionOrder(raw, ACTIONS);
    } catch (error: unknown) {
      this.docMenuRegistrationState = buildDefaultDocMenuRegistration(ACTIONS);
      this.docActionOrderState = buildDefaultDocActionOrder(ACTIONS);
      const message = error instanceof Error ? error.message : String(error);
      showMessage(`读取菜单注册配置失败：${message}`, 5000, "error");
    }
  }

  private async persistDocMenuRegistrationState() {
    const payload: DocMenuRegistrationStorageV1 = {
      version: 1,
      actionEnabled: this.docMenuRegistrationState,
      actionOrder: this.docActionOrderState,
    };
    await this.saveData(this.docMenuRegistrationStorageName, payload);
  }

  private getOrderedActions() {
    return sortActionsByOrder(ACTIONS, this.docActionOrderState);
  }

  async setAllDocMenuRegistration(enabled: boolean) {
    this.docMenuRegistrationState = setAllDocMenuRegistrationState(
      this.docMenuRegistrationState,
      enabled
    );
    await this.persistDocMenuRegistrationState();
    this.keyInfoController.syncDocActions();
  }

  async setSingleDocMenuRegistration(key: ActionKey, enabled: boolean) {
    this.docMenuRegistrationState = setSingleDocMenuRegistrationState(
      this.docMenuRegistrationState,
      key,
      enabled
    );
    await this.persistDocMenuRegistrationState();
    this.keyInfoController.syncDocActions();
  }

  async setDocActionOrder(order: ActionKey[]) {
    this.docActionOrderState = normalizeDocActionOrder(
      { actionOrder: order },
      ACTIONS
    );
    await this.persistDocMenuRegistrationState();
    this.keyInfoController.syncDocActions();
  }

  async resetDocActionOrder() {
    this.docActionOrderState = buildDefaultDocActionOrder(ACTIONS);
    await this.persistDocMenuRegistrationState();
    this.keyInfoController.syncDocActions();
  }
}
