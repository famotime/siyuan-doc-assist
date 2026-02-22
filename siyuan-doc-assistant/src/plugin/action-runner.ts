import { getActiveEditor, showMessage } from "siyuan";
import {
  findDeleteFromCurrentBlockIds,
  findExtraBlankParagraphIds,
  findHeadingMissingBlankParagraphBeforeIds,
} from "@/core/markdown-cleanup-core";
import { decodeURIComponentSafe } from "@/core/workspace-path-core";
import { resolveDocDirectChildBlockId } from "@/services/block-lineage";
import { deleteDocsByIds, findDuplicateCandidates } from "@/services/dedupe";
import { exportCurrentDocMarkdown, exportDocIdsAsMarkdownZip } from "@/services/exporter";
import {
  appendBlock,
  deleteBlockById,
  getChildBlocksByParentId,
  getDocMetaByID,
  insertBlockBefore,
} from "@/services/kernel";
import {
  getBacklinkDocs,
  getChildDocs,
  getForwardLinkedDocIds,
  toBacklinkMarkdown,
  toChildDocMarkdown,
} from "@/services/link-resolver";
import { moveDocsAsChildren } from "@/services/mover";
import { openDedupeDialog } from "@/ui/dialogs";
import { ActionConfig, ActionKey, ACTIONS } from "@/plugin/actions";
import { ProtyleLike } from "@/plugin/doc-context";

type ActionRunnerDeps = {
  isMobile: () => boolean;
  resolveDocId: (explicitId?: string, protyle?: ProtyleLike) => string;
  askConfirm: (title: string, text: string) => Promise<boolean>;
  setBusy?: (busy: boolean) => void;
};

export class ActionRunner {
  private isRunning = false;

  constructor(private readonly deps: ActionRunnerDeps) {}

  private getProtyleBlockId(protyle?: ProtyleLike): string {
    return (protyle?.block?.id || "").trim();
  }

  private resolveCurrentBlockId(protyle?: ProtyleLike): string {
    const fromProvided = this.getProtyleBlockId(protyle);
    if (fromProvided) {
      return fromProvided;
    }
    const activeProtyle = getActiveEditor()?.protyle as ProtyleLike | undefined;
    return this.getProtyleBlockId(activeProtyle);
  }

  private async askConfirmWithVisibleDialog(title: string, text: string): Promise<boolean> {
    this.deps.setBusy?.(false);
    return this.deps.askConfirm(title, text);
  }

  async runAction(action: ActionKey, explicitId?: string, protyle?: ProtyleLike) {
    const config = ACTIONS.find((item) => item.key === action);
    if (config?.desktopOnly && this.deps.isMobile()) {
      showMessage("该操作当前仅支持桌面端", 5000, "error");
      return;
    }

    const docId = this.deps.resolveDocId(explicitId, protyle);
    if (!docId) {
      showMessage("未找到当前文档上下文，请先打开文档后重试", 5000, "error");
      return;
    }

    if (this.isRunning) {
      showMessage("正在处理中，请等待当前任务完成", 4000, "info");
      return;
    }

    this.isRunning = true;
    this.deps.setBusy?.(true);

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
        case "insert-blank-before-headings":
          await this.handleInsertBlankBeforeHeadings(docId);
          break;
        case "delete-from-current-to-end":
          await this.handleDeleteFromCurrentToEnd(docId, protyle);
          break;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      showMessage(message, 7000, "error");
    } finally {
      this.isRunning = false;
      this.deps.setBusy?.(false);
    }
  }

  registerCommands(register: (config: ActionConfig, run: () => void) => void) {
    for (const action of ACTIONS) {
      register(action, () => {
        void this.runAction(action.key);
      });
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
    const ok = await this.askConfirmWithVisibleDialog(
      "确认移动",
      `将尝试把 ${backlinks.length} 篇反链文档移动为当前文档子文档，是否继续？`
    );
    if (!ok) {
      return;
    }
    this.deps.setBusy?.(true);

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

    const ok = await this.askConfirmWithVisibleDialog(
      "确认去除空行",
      `将删除 ${result.removedCount} 个空段落，是否继续？`
    );
    if (!ok) {
      return;
    }
    this.deps.setBusy?.(true);

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

  private async handleInsertBlankBeforeHeadings(docId: string) {
    const blocks = await getChildBlocksByParentId(docId);
    if (!blocks.length) {
      showMessage("当前文档没有可处理的段落", 4000, "info");
      return;
    }

    const result = findHeadingMissingBlankParagraphBeforeIds(blocks);
    if (result.insertCount === 0) {
      showMessage("所有标题前均已有空段落", 4000, "info");
      return;
    }

    const ok = await this.askConfirmWithVisibleDialog(
      "确认补空段落",
      `将为 ${result.insertCount} 个标题前插入空段落，是否继续？`
    );
    if (!ok) {
      return;
    }
    this.deps.setBusy?.(true);

    let failed = 0;
    for (const headingId of result.insertBeforeIds) {
      try {
        await insertBlockBefore("<br />", headingId, docId);
      } catch {
        failed += 1;
      }
    }

    if (failed > 0) {
      showMessage(`已为 ${result.insertCount - failed} 个标题补充空段落，失败 ${failed} 个`, 6000, "error");
      return;
    }
    showMessage(`已为 ${result.insertCount} 个标题补充空段落`, 5000, "info");
  }

  private async handleDeleteFromCurrentToEnd(docId: string, protyle?: ProtyleLike) {
    const currentBlockId = this.resolveCurrentBlockId(protyle);
    if (!currentBlockId) {
      showMessage("未定位到当前段落，请将光标置于正文后重试", 5000, "error");
      return;
    }

    const blocks = await getChildBlocksByParentId(docId);
    if (!blocks.length) {
      showMessage("当前文档没有可处理的段落", 4000, "info");
      return;
    }

    const directChildIdSet = new Set(blocks.map((item) => item.id));
    let deleteStartId = currentBlockId;
    if (!directChildIdSet.has(deleteStartId)) {
      const mapped = await resolveDocDirectChildBlockId(docId, deleteStartId);
      if (mapped) {
        deleteStartId = mapped;
      }
    }

    const result = findDeleteFromCurrentBlockIds(blocks, deleteStartId);
    if (result.deleteCount === 0) {
      showMessage("未找到从当前段落开始的可删除内容", 5000, "error");
      return;
    }

    const ok = await this.askConfirmWithVisibleDialog(
      "确认删除后续段落",
      `将删除 ${result.deleteCount} 个段落（含当前段），是否继续？`
    );
    if (!ok) {
      return;
    }
    this.deps.setBusy?.(true);

    let failed = 0;
    for (const id of result.deleteIds) {
      try {
        await deleteBlockById(id);
      } catch {
        failed += 1;
      }
    }

    if (failed > 0) {
      showMessage(`已删除 ${result.deleteCount - failed} 个段落，失败 ${failed} 个`, 6000, "error");
      return;
    }
    showMessage(`已删除 ${result.deleteCount} 个段落`, 5000, "info");
  }
}
