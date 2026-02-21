import {
  confirm,
  getActiveEditor,
  getFrontend,
  Plugin,
  showMessage,
} from "siyuan";
import "@/index.scss";
import { buildKeyInfoMarkdown, KeyInfoItem } from "@/core/key-info-core";
import { buildDockDocActions, DockDocActionGroup } from "@/core/dock-panel-core";
import { findExtraBlankParagraphIds } from "@/core/markdown-cleanup-core";
import { decodeURIComponentSafe } from "@/core/workspace-path-core";
import { exportCurrentDocMarkdown, exportDocIdsAsMarkdownZip } from "@/services/exporter";
import { getDocKeyInfo } from "@/services/key-info";
import {
  appendBlock,
  deleteBlockById,
  getChildBlocksByParentId,
  getDocMetaByID,
} from "@/services/kernel";
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
import { createKeyInfoDock, KeyInfoDockHandle } from "@/ui/key-info-dock";

type ActionKey =
  | "export-current"
  | "insert-backlinks"
  | "insert-child-docs"
  | "export-backlinks-zip"
  | "export-forward-zip"
  | "move-backlinks"
  | "dedupe"
  | "remove-extra-blank-lines";

type ActionConfig = {
  key: ActionKey;
  commandText: string;
  menuText: string;
  group: DockDocActionGroup;
  desktopOnly?: boolean;
  icon: string;
};

const ACTIONS: ActionConfig[] = [
  {
    key: "export-current",
    commandText: "仅导出当前文档",
    menuText: "仅导出当前文档",
    group: "export",
    icon: "iconDownload",
  },
  {
    key: "export-backlinks-zip",
    commandText: "打包导出反链文档",
    menuText: "打包导出反链文档",
    group: "export",
    icon: "iconDownload",
  },
  {
    key: "export-forward-zip",
    commandText: "打包导出正链文档",
    menuText: "打包导出正链文档",
    group: "export",
    icon: "iconDownload",
  },
  {
    key: "insert-backlinks",
    commandText: "插入反链文档列表到正文",
    menuText: "插入反链文档列表到正文",
    group: "insert",
    icon: "iconList",
  },
  {
    key: "insert-child-docs",
    commandText: "插入子文档列表到正文",
    menuText: "插入子文档列表到正文",
    group: "insert",
    icon: "iconList",
  },
  {
    key: "move-backlinks",
    commandText: "移动反链文档为子文档",
    menuText: "移动反链文档为子文档",
    group: "organize",
    desktopOnly: true,
    icon: "iconMove",
  },
  {
    key: "dedupe",
    commandText: "识别本层级重复文档",
    menuText: "识别本层级重复文档",
    group: "organize",
    desktopOnly: true,
    icon: "iconTrashcan",
  },
  {
    key: "remove-extra-blank-lines",
    commandText: "去除本文档空段落",
    menuText: "去除本文档空段落",
    group: "organize",
    icon: "iconTrashcan",
  },
];

const ACTION_KEY_SET = new Set<ActionKey>(ACTIONS.map((action) => action.key));

function isActionKey(value: string): value is ActionKey {
  return ACTION_KEY_SET.has(value as ActionKey);
}

function getProtyleDocId(protyle: any): string {
  return (
    protyle?.block?.rootID ||
    protyle?.block?.rootId ||
    protyle?.block?.root_id ||
    protyle?.block?.id ||
    ""
  );
}

export default class DocLinkToolkitPlugin extends Plugin {
  private currentDocId = "";
  private currentProtyle?: any;
  private isMobile = false;
  private keyInfoDock?: KeyInfoDockHandle;
  private keyInfoRequestId = 0;
  private keyInfoJumpId = 0;
  private lastProtocolOpenId = "";
  private lastProtocolOpenAt = 0;
  private keyInfoDocId = "";

  private readonly onSwitchProtyle = (event: CustomEvent<any>) => {
    const protyle = event.detail?.protyle;
    const id = getProtyleDocId(protyle);
    if (id) {
      this.currentDocId = id;
      this.currentProtyle = protyle;
      void this.refreshKeyInfoDock(id, protyle);
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
    if (detail?.protyle) {
      this.currentProtyle = detail.protyle;
    }

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
    this.registerKeyInfoDock();

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
    this.keyInfoDock?.destroy();
    this.keyInfoDock = undefined;
  }

  private resolveDocId(explicitId?: string, protyle?: any): string {
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
    const activeId = getProtyleDocId(activeEditor?.protyle);
    if (activeId) {
      this.currentDocId = activeId;
      if (activeEditor?.protyle) {
        this.currentProtyle = activeEditor.protyle;
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

  private openBlockByProtocol(blockId: string) {
    const url = `siyuan://blocks/${blockId}`;
    try {
      window.open(url);
    } catch {
      window.location.href = url;
    }
  }

  private openBlockByProtocolThrottled(blockId: string) {
    const now = performance.now();
    if (this.lastProtocolOpenId === blockId && now - this.lastProtocolOpenAt < 800) {
      return;
    }
    this.lastProtocolOpenId = blockId;
    this.lastProtocolOpenAt = now;
    this.openBlockByProtocol(blockId);
  }

  private flashBlockElement(target: HTMLElement) {
    const flashClass = "doc-assistant-keyinfo__flash";
    target.classList.remove(flashClass);
    void target.offsetWidth;
    target.classList.add(flashClass);
    window.setTimeout(() => {
      target.classList.remove(flashClass);
    }, 900);
  }

  private scheduleFlashAfterScroll(
    target: HTMLElement,
    jumpId: number,
    onTimeout?: () => void
  ) {
    const start = performance.now();
    const minDelay = 160;
    const maxWait = 2000;
    const check = () => {
      if (jumpId !== this.keyInfoJumpId) {
        return;
      }
      const now = performance.now();
      const viewHeight =
        window.innerHeight || document.documentElement.clientHeight || 0;
      if (!viewHeight) {
        this.flashBlockElement(target);
        return;
      }
      const rect = target.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const delta = Math.abs(center - viewHeight / 2);
      const threshold = Math.min(80, viewHeight * 0.1);
      const ready = delta <= threshold && now - start >= minDelay;
      if (ready) {
        this.flashBlockElement(target);
        return;
      }
      if (now - start >= maxWait) {
        onTimeout?.();
        return;
      }
      window.requestAnimationFrame(check);
    };
    window.requestAnimationFrame(check);
  }

  private handleKeyInfoItemClick(item: KeyInfoItem) {
    const blockId = item.blockId;
    if (!blockId) {
      return;
    }
    const jumpId = ++this.keyInfoJumpId;
    const protyle = this.currentProtyle || getActiveEditor()?.protyle;
    const root = protyle?.wysiwyg?.element as HTMLElement | undefined;
    if (root) {
      const target = root.querySelector(
        `[data-node-id="${blockId}"]`
      ) as HTMLElement | null;
      if (target) {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
        this.scheduleFlashAfterScroll(target, jumpId, () => {
          this.openBlockByProtocolThrottled(blockId);
        });
        return;
      }
    }
    this.openBlockByProtocolThrottled(blockId);
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
        case "remove-extra-blank-lines":
          await this.handleRemoveExtraBlankLines(docId);
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

  private async handleRemoveExtraBlankLines(docId: string) {
    const blocks = await getChildBlocksByParentId(docId);
    if (!blocks.length) {
      showMessage("当前文档没有可处理的段落", 4000, "info");
      return;
    }

    const result = findExtraBlankParagraphIds(blocks);
    if (result.removedCount === 0) {
      showMessage("未发现需要去除的空段落", 4000, "info");
      return;
    }

    const ok = await this.askConfirm(
      "确认去除空行",
      `将删除 ${result.removedCount} 个空段落，是否继续？`
    );
    if (!ok) {
      return;
    }

    let failed = 0;
    for (const id of result.deleteIds) {
      try {
        await deleteBlockById(id);
      } catch {
        failed += 1;
      }
    }

    if (failed > 0) {
      showMessage(`已去除 ${result.removedCount - failed} 个空段落，失败 ${failed} 个`, 6000, "error");
      return;
    }
    showMessage(`已去除 ${result.removedCount} 个空段落`, 5000, "info");
  }

  private registerKeyInfoDock() {
    this.addDock({
      type: "doc-assistant-keyinfo",
      data: {},
      config: {
        title: "文档助手",
        icon: "iconList",
        position: "RightTop",
        size: {
          width: 320,
          height: null,
        },
      },
      init: (dock) => {
        this.keyInfoDock = createKeyInfoDock(dock.element, {
          onExport: () => this.exportKeyInfoMarkdown(),
          onRefresh: () => {
            void this.refreshKeyInfoDock();
          },
          onItemClick: (item) => {
            this.handleKeyInfoItemClick(item);
          },
          onDocActionClick: (actionKey) => {
            if (!isActionKey(actionKey)) {
              return;
            }
            void this.runAction(actionKey);
          },
        });
        this.keyInfoDock.setState({
          docActions: buildDockDocActions(ACTIONS, this.isMobile),
        });
        void this.refreshKeyInfoDock(undefined, getActiveEditor()?.protyle);
      },
      update: () => {
        void this.refreshKeyInfoDock();
      },
      destroy: () => {
        this.keyInfoDock?.destroy();
        this.keyInfoDock = undefined;
      },
    });
  }

  private async refreshKeyInfoDock(explicitId?: string, protyle?: any) {
    if (!this.keyInfoDock) {
      return;
    }
    const docId = this.resolveDocId(explicitId, protyle);
    if (!docId) {
      this.keyInfoDock.setState({
        docTitle: "",
        items: [],
        loading: false,
        isRefreshing: false,
        emptyText: "未找到当前文档",
        scrollContextKey: "",
      });
      return;
    }

    const requestId = ++this.keyInfoRequestId;
    const currentState = this.keyInfoDock.getState();
    const isSameDoc = this.keyInfoDocId && this.keyInfoDocId === docId;
    const hasItems = currentState.items.length > 0;
    this.keyInfoDock.setState({
      loading: !hasItems || !isSameDoc,
      isRefreshing: true,
      emptyText: !hasItems || !isSameDoc ? "加载中..." : currentState.emptyText,
      scrollContextKey: docId,
    });

    try {
      const activeProtyle =
        protyle || this.currentProtyle || getActiveEditor()?.protyle;
      const data = await getDocKeyInfo(docId, activeProtyle);
      if (requestId !== this.keyInfoRequestId) {
        return;
      }
      this.keyInfoDocId = docId;
      let nextItems = data.items;
      if (isSameDoc && hasItems) {
        const existingIds = new Set(currentState.items.map((item) => item.id));
        const appended = data.items.filter((item) => !existingIds.has(item.id));
        if (appended.length) {
          nextItems = [...currentState.items, ...appended];
        } else {
          nextItems = currentState.items;
        }
      }
      this.keyInfoDock.setState({
        docTitle: data.docTitle || docId,
        items: nextItems,
        loading: false,
        isRefreshing: false,
        emptyText: "暂无关键内容",
        scrollContextKey: docId,
      });
    } catch (error: any) {
      if (requestId !== this.keyInfoRequestId) {
        return;
      }
      const message = error?.message || String(error);
      showMessage(`加载关键内容失败：${message}`, 7000, "error");
      const keepItems = isSameDoc && hasItems;
      this.keyInfoDock.setState({
        loading: false,
        isRefreshing: false,
        emptyText: "加载失败",
        scrollContextKey: docId,
        ...(keepItems
          ? {}
          : {
              docTitle: "",
              items: [],
            }),
      });
    }
  }

  private exportKeyInfoMarkdown() {
    if (!this.keyInfoDock) {
      return;
    }
    const items = this.keyInfoDock.getVisibleItems();
    if (!items.length) {
      showMessage("没有可导出的关键内容", 4000, "info");
      return;
    }

    const state = this.keyInfoDock.getState();
    const docTitle = state.docTitle || this.currentDocId || "key-info";
    const content = buildKeyInfoMarkdown(items);
    const fileName = this.buildKeyInfoFileName(docTitle);
    this.triggerMarkdownDownload(fileName, content);
    showMessage(`已导出 ${items.length} 条关键内容`, 5000, "info");
  }

  private buildKeyInfoFileName(docTitle: string): string {
    const safeTitle = (docTitle || "key-info").replace(/[\\/:*?"<>|]/g, "_").trim();
    const base = safeTitle || "key-info";
    return `${base}-key-info.md`;
  }

  private triggerMarkdownDownload(fileName: string, content: string) {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }
}
