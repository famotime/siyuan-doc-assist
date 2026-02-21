import {
  confirm,
  getActiveEditor,
  getFrontend,
  Plugin,
} from "siyuan";
import { ActionRunner } from "@/plugin/action-runner";
import { ACTIONS } from "@/plugin/actions";
import { getProtyleDocId, ProtyleLike } from "@/plugin/doc-context";
import { KeyInfoController } from "@/plugin/key-info-controller";

export default class DocLinkToolkitPlugin extends Plugin {
  private currentDocId = "";
  private currentProtyle?: ProtyleLike;
  private isMobile = false;

  private readonly actionRunner = new ActionRunner({
    isMobile: () => this.isMobile,
    resolveDocId: (explicitId?: string, protyle?: ProtyleLike) =>
      this.resolveDocId(explicitId, protyle),
    askConfirm: (title, text) => this.askConfirm(title, text),
  });

  private readonly keyInfoController = new KeyInfoController({
    isMobile: () => this.isMobile,
    getCurrentDocId: () => this.currentDocId,
    getCurrentProtyle: () => this.currentProtyle,
    resolveDocId: (explicitId?: string, protyle?: ProtyleLike) =>
      this.resolveDocId(explicitId, protyle),
    runAction: (action) => this.actionRunner.runAction(action),
    actions: () => ACTIONS,
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

    menu.addSeparator();
    for (const action of ACTIONS) {
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
    const frontend = getFrontend();
    this.isMobile = frontend === "mobile" || frontend === "browser-mobile";

    this.eventBus.on("switch-protyle", this.onSwitchProtyle);
    this.eventBus.on("click-editortitleicon", this.onEditorTitleMenu);
    this.keyInfoController.registerDock(this);

    this.actionRunner.registerCommands((action, run) => {
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
}
