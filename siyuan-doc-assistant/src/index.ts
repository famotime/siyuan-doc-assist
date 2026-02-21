import {
  confirm,
  getActiveEditor,
  getFrontend,
  Plugin,
  showMessage,
} from "siyuan";
import "@/index.scss";
import { decodeURIComponentSafe } from "@/core/workspace-path-core";
import { exportCurrentDocMarkdown, exportDocIdsAsMarkdownZip } from "@/services/exporter";
import { appendBlock, getDocMetaByID } from "@/services/kernel";
import { deleteDocsByIds, findDuplicateCandidates } from "@/services/dedupe";
import {
  getBacklinkDocs,
  getChildDocs,
  getForwardLinkedDocIds,
  toBacklinkMarkdown,
  toChildDocMarkdown,
} from "@/services/link-resolver";
import { moveDocsAsChildren } from "@/services/mover";
import { openDedupeDialog } from "@/ui/dialogs";

type ActionKey =
  | "export-current"
  | "insert-backlinks"
  | "insert-child-docs"
  | "export-backlinks-zip"
  | "export-forward-zip"
  | "move-backlinks"
  | "dedupe";

type ActionConfig = {
  key: ActionKey;
  commandText: string;
  menuText: string;
  desktopOnly?: boolean;
  icon: string;
};

const ACTIONS: ActionConfig[] = [
  {
    key: "export-current",
    commandText: "仅导出当前文档",
    menuText: "仅导出当前文档",
    icon: "iconDownload",
  },
  {
    key: "export-backlinks-zip",
    commandText: "打包导出反链文档",
    menuText: "打包导出反链文档",
    icon: "iconDownload",
  },
  {
    key: "export-forward-zip",
    commandText: "打包导出正链文档",
    menuText: "打包导出正链文档",
    icon: "iconDownload",
  },
  {
    key: "insert-backlinks",
    commandText: "插入反链文档列表到正文",
    menuText: "插入反链文档列表到正文",
    icon: "iconList",
  },
  {
    key: "insert-child-docs",
    commandText: "插入子文档列表到正文",
    menuText: "插入子文档列表到正文",
    icon: "iconList",
  },
  {
    key: "move-backlinks",
    commandText: "移动反链文档为子文档",
    menuText: "移动反链文档为子文档",
    desktopOnly: true,
    icon: "iconMove",
  },
  {
    key: "dedupe",
    commandText: "识别本层级重复文档",
    menuText: "识别本层级重复文档",
    desktopOnly: true,
    icon: "iconTrashcan",
  },
];

function getProtyleDocId(protyle: any): string {
  return protyle?.block?.rootID || protyle?.block?.id || "";
}

export default class DocLinkToolkitPlugin extends Plugin {
  private currentDocId = "";
  private isMobile = false;

  private readonly onSwitchProtyle = (event: CustomEvent<any>) => {
    const id = getProtyleDocId(event.detail?.protyle);
    if (id) {
      this.currentDocId = id;
    }
  };

  private readonly onEditorTitleMenu = (event: CustomEvent<any>) => {
    const detail = event.detail;
    const menu = detail?.menu;
    const docId = detail?.data?.id;
    if (!menu || !docId) {
      return;
    }
    this.currentDocId = docId;

    menu.addSeparator();
    for (const action of ACTIONS) {
      menu.addItem({
        icon: action.icon,
        label: action.menuText,
        click: () => {
          void this.runAction(action.key, docId, detail?.protyle);
        },
      });
    }
  };

  async onload() {
    const frontend = getFrontend();
    this.isMobile = frontend === "mobile" || frontend === "browser-mobile";

    this.eventBus.on("switch-protyle", this.onSwitchProtyle);
    this.eventBus.on("click-editortitleicon", this.onEditorTitleMenu);

    for (const action of ACTIONS) {
      this.addCommand({
        langKey: `docLinkToolkit.${action.key}`,
        langText: action.commandText,
        callback: () => {
          void this.runAction(action.key);
        },
        editorCallback: (protyle) => {
          void this.runAction(action.key, undefined, protyle);
        },
      });
    }
  }

  onunload() {
    this.eventBus.off("switch-protyle", this.onSwitchProtyle);
    this.eventBus.off("click-editortitleicon", this.onEditorTitleMenu);
  }

  private resolveDocId(explicitId?: string, protyle?: any): string {
    if (explicitId) {
      this.currentDocId = explicitId;
      return explicitId;
    }
    const fromProtyle = getProtyleDocId(protyle);
    if (fromProtyle) {
      this.currentDocId = fromProtyle;
      return fromProtyle;
    }
    const activeEditor = getActiveEditor();
    const activeId = getProtyleDocId(activeEditor?.protyle);
    if (activeId) {
      this.currentDocId = activeId;
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

  private async runAction(action: ActionKey, explicitId?: string, protyle?: any) {
    const config = ACTIONS.find((item) => item.key === action);
    if (config?.desktopOnly && this.isMobile) {
      showMessage("该操作当前仅支持桌面端", 5000, "error");
      return;
    }

    const docId = this.resolveDocId(explicitId, protyle);
    if (!docId) {
      showMessage("未找到当前文档上下文，请先打开文档后重试", 5000, "error");
      return;
    }

    try {
      switch (action) {
        case "export-current":
          await this.handleExportCurrent(docId);
          break;
        case "insert-backlinks":
          await this.handleInsertBacklinks(docId);
          break;
        case "insert-child-docs":
          await this.handleInsertChildDocs(docId);
          break;
        case "export-backlinks-zip":
          await this.handleExportBacklinksZip(docId);
          break;
        case "export-forward-zip":
          await this.handleExportForwardZip(docId);
          break;
        case "move-backlinks":
          await this.handleMoveBacklinks(docId);
          break;
        case "dedupe":
          await this.handleDedupe(docId);
          break;
      }
    } catch (error: any) {
      showMessage(error?.message || String(error), 7000, "error");
    }
  }

  private async handleExportCurrent(docId: string) {
    const result = await exportCurrentDocMarkdown(docId);
    if (result.mode === "zip") {
      showMessage(
        `导出完成（含媒体）：${result.fileName}${result.zipPath ? `，路径 ${result.zipPath}` : ""}`,
        8000,
        "info"
      );
      return;
    }
    showMessage(`导出完成：${result.fileName}`, 5000, "info");
  }

  private async handleInsertBacklinks(docId: string) {
    const backlinks = await getBacklinkDocs(docId);
    if (!backlinks.length) {
      showMessage("当前文档没有可插入的反向链接文档", 5000, "info");
      return;
    }
    const markdown = toBacklinkMarkdown(backlinks);
    await appendBlock(markdown, docId);
    showMessage(`已插入 ${backlinks.length} 个反链文档链接`, 5000, "info");
  }

  private async handleInsertChildDocs(docId: string) {
    const childDocs = await getChildDocs(docId);
    if (!childDocs.length) {
      showMessage("当前文档没有可插入的子文档", 5000, "info");
      return;
    }
    const markdown = toChildDocMarkdown(childDocs);
    await appendBlock(markdown, docId);
    showMessage(`已插入 ${childDocs.length} 个子文档链接`, 5000, "info");
  }

  private async handleExportBacklinksZip(docId: string) {
    const backlinks = await getBacklinkDocs(docId);
    const ids = backlinks.map((item) => item.id);
    await this.exportDocZip(ids, "反链", docId);
  }

  private async handleExportForwardZip(docId: string) {
    const ids = await getForwardLinkedDocIds(docId);
    console.info("[DocAssistant][ForwardLinks] export-forward-zip trigger", {
      currentDocId: docId,
      forwardDocCount: ids.length,
      forwardDocIds: ids,
    });
    if (!ids.length) {
      showMessage(
        "未找到可导出的正链文档。请打开开发者工具查看 [DocAssistant][ForwardLinks] 调试日志",
        9000,
        "error"
      );
      return;
    }
    await this.exportDocZip(ids, "正链", docId);
  }

  private async exportDocZip(ids: string[], label: string, currentDocId: string) {
    if (!ids.length) {
      showMessage(`未找到可导出的${label}文档`, 5000, "error");
      return;
    }
    const currentDoc = await getDocMetaByID(currentDocId);
    const preferredZipName = currentDoc?.title || currentDocId;
    const result = await exportDocIdsAsMarkdownZip(ids, preferredZipName);
    const displayName = decodeURIComponentSafe(result.name || "");
    const displayZip = decodeURIComponentSafe(result.zip || "");
    showMessage(`导出完成（${displayName}）：${displayZip}`, 9000, "info");
  }

  private async handleMoveBacklinks(docId: string) {
    const backlinks = await getBacklinkDocs(docId);
    if (!backlinks.length) {
      showMessage("当前文档没有反向链接文档可移动", 5000, "info");
      return;
    }
    const ok = await this.askConfirm(
      "确认移动",
      `将尝试把 ${backlinks.length} 篇反链文档移动为当前文档子文档，是否继续？`
    );
    if (!ok) {
      return;
    }

    const report = await moveDocsAsChildren(
      docId,
      backlinks.map((item) => item.id)
    );
    const message = [
      `移动完成：成功 ${report.successIds.length}`,
      `跳过 ${report.skippedIds.length}`,
      `重命名 ${report.renamed.length}`,
      `失败 ${report.failed.length}`,
    ].join("，");
    showMessage(message, 9000, report.failed.length ? "error" : "info");
  }

  private async handleDedupe(docId: string) {
    const candidates = await findDuplicateCandidates(docId, 0.85);
    if (!candidates.length) {
      showMessage("未识别到重复文档", 5000, "info");
      return;
    }

    openDedupeDialog({
      candidates,
      onDelete: async (ids) => deleteDocsByIds(ids),
    });
    showMessage(`识别到 ${candidates.length} 组重复候选`, 5000, "info");
  }
}
