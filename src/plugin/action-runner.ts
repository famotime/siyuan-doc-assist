import { showMessage } from "siyuan";
import { convertSiyuanLinksAndRefsInMarkdown } from "@/core/link-core";
import {
  findDeleteFromCurrentBlockIds,
  findExtraBlankParagraphIds,
  findHeadingMissingBlankParagraphBeforeIds,
  removeTrailingWhitespaceFromDom,
  removeTrailingWhitespaceFromMarkdown,
} from "@/core/markdown-cleanup-core";
import { decodeURIComponentSafe } from "@/core/workspace-path-core";
import { resolveDocDirectChildBlockId } from "@/services/block-lineage";
import { deleteDocsByIds, findDuplicateCandidates } from "@/services/dedupe";
import { exportCurrentDocMarkdown, exportDocIdsAsMarkdownZip } from "@/services/exporter";
import {
  appendBlock,
  deleteBlockById,
  getBlockDOMs,
  getBlockKramdowns,
  getChildBlocksByParentId,
  getDocMetaByID,
  insertBlockBefore,
  updateBlockDom,
  updateBlockMarkdown,
} from "@/services/kernel";
import {
  filterDocRefsByExistingLinks,
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
import { applyBlockStyle, BlockStyle } from "@/core/markdown-style-core";
import { createDocAssistantLogger } from "@/core/logger-core";
import { dispatchAction, ActionHandlerMap } from "@/plugin/action-runner-dispatcher";
import { getSelectedBlockIds, resolveCurrentBlockId } from "@/plugin/action-runner-context";
import { convertDocImagesToWebp } from "@/services/image-webp";
import { convertDocImagesToPng } from "@/services/image-png";
import { removeDocImageLinks } from "@/services/image-remove";

type ActionRunnerDeps = {
  isMobile: () => boolean;
  resolveDocId: (explicitId?: string, protyle?: ProtyleLike) => string;
  askConfirm: (title: string, text: string) => Promise<boolean>;
  setBusy?: (busy: boolean) => void;
};

type StyleFailureKind = "source-missing" | "update-failed";

type StyleFailureDetail = {
  id: string;
  kind: StyleFailureKind;
  reason: string;
};

const forwardLinksLogger = createDocAssistantLogger("ForwardLinks");
const styleLogger = createDocAssistantLogger("Style");
const trailingWhitespaceLogger = createDocAssistantLogger("TrailingWhitespace");
const deleteFromCurrentLogger = createDocAssistantLogger("DeleteFromCurrent");

/**
 * Extracts block-level IAL lines from a cleaned kramdown string.
 * The block-level IAL (e.g. `{: id="..." memo="..."}`) appears at the end of the
 * per-block kramdown. Returning it allows callers to append it to a different
 * content string so that block attributes such as `memo` are preserved when
 * calling updateBlock.
 */
function extractBlockLevelIal(kramdown: string): string | null {
  if (!kramdown) return null;
  const lines = kramdown.split(/\r?\n/);
  const ialLines: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed === "") continue;
    if (/^\{:/.test(trimmed)) {
      ialLines.unshift(trimmed);
    } else {
      break;
    }
  }
  return ialLines.length > 0 ? ialLines.join("\n") : null;
}

function isHighRiskForMarkdownWrite(value: string): boolean {
  if (!value) {
    return false;
  }
  return (
    /inline-memo/i.test(value) ||
    /data-inline-memo-content/i.test(value) ||
    /data-memo-content/i.test(value) ||
    /data-memo=/i.test(value) ||
    /\(\([^)]+\)\)\{:/.test(value)
  );
}

export class ActionRunner {
  private isRunning = false;

  private readonly actionHandlers: ActionHandlerMap = {
    "export-current": async (docId) => this.handleExportCurrent(docId),
    "insert-backlinks": async (docId) => this.handleInsertBacklinks(docId),
    "insert-child-docs": async (docId) => this.handleInsertChildDocs(docId),
    "export-backlinks-zip": async (docId) => this.handleExportBacklinksZip(docId),
    "export-forward-zip": async (docId) => this.handleExportForwardZip(docId),
    "move-backlinks": async (docId) => this.handleMoveBacklinks(docId),
    "move-forward-links": async (docId) => this.handleMoveForwardLinks(docId),
    dedupe: async (docId) => this.handleDedupe(docId),
    "remove-extra-blank-lines": async (docId) => this.handleRemoveExtraBlankLines(docId),
    "trim-trailing-whitespace": async (docId) => this.handleTrimTrailingWhitespace(docId),
    "convert-images-to-webp": async (docId) => this.handleConvertImagesToWebp(docId),
    "convert-images-to-png": async (docId) => this.handleConvertImagesToPng(docId),
    "remove-doc-images": async (docId) => this.handleRemoveDocImages(docId),
    "toggle-links-refs": async (docId) => this.handleToggleLinksRefs(docId),
    "insert-blank-before-headings": async (docId) => this.handleInsertBlankBeforeHeadings(docId),
    "delete-from-current-to-end": async (docId, protyle) =>
      this.handleDeleteFromCurrentToEnd(docId, protyle),
    "bold-selected-blocks": async (docId, protyle) =>
      this.handleStyleSelectedBlocks(docId, protyle, "bold"),
    "highlight-selected-blocks": async (docId, protyle) =>
      this.handleStyleSelectedBlocks(docId, protyle, "highlight"),
  };

  constructor(private readonly deps: ActionRunnerDeps) {}

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
      await dispatchAction(action, docId, protyle, this.actionHandlers);
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
    const filtered = await filterDocRefsByExistingLinks(docId, backlinks);
    if (!filtered.items.length) {
      showMessage("当前文档已包含所有反向链接文档", 5000, "info");
      return;
    }
    const markdown = toBacklinkMarkdown(filtered.items);
    await appendBlock(markdown, docId);
    const skipSuffix = filtered.skipped.length ? `，跳过已存在 ${filtered.skipped.length} 个` : "";
    showMessage(`已插入 ${filtered.items.length} 个反链文档链接${skipSuffix}`, 5000, "info");
  }

  private async handleInsertChildDocs(docId: string) {
    const childDocs = await getChildDocs(docId);
    if (!childDocs.length) {
      showMessage("当前文档没有可插入的子文档", 5000, "info");
      return;
    }
    const filtered = await filterDocRefsByExistingLinks(docId, childDocs);
    if (!filtered.items.length) {
      showMessage("当前文档已包含所有子文档链接", 5000, "info");
      return;
    }
    const markdown = toChildDocMarkdown(filtered.items);
    await appendBlock(markdown, docId);
    const skipSuffix = filtered.skipped.length ? `，跳过已存在 ${filtered.skipped.length} 个` : "";
    showMessage(`已插入 ${filtered.items.length} 个子文档链接${skipSuffix}`, 5000, "info");
  }

  private async handleExportBacklinksZip(docId: string) {
    const backlinks = await getBacklinkDocs(docId);
    const ids = backlinks.map((item) => item.id);
    await this.exportDocZip(ids, "反链", docId);
  }

  private async handleExportForwardZip(docId: string) {
    const ids = await getForwardLinkedDocIds(docId);
    forwardLinksLogger.debug("export-forward-zip trigger", {
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

  private async handleMoveForwardLinks(docId: string) {
    const forwardLinkedIds = await getForwardLinkedDocIds(docId);
    if (!forwardLinkedIds.length) {
      showMessage("当前文档没有正链文档可移动", 5000, "info");
      return;
    }
    const ok = await this.askConfirmWithVisibleDialog(
      "确认移动",
      `将尝试把 ${forwardLinkedIds.length} 篇正链文档移动为当前文档子文档，是否继续？`
    );
    if (!ok) {
      return;
    }
    this.deps.setBusy?.(true);

    const report = await moveDocsAsChildren(docId, forwardLinkedIds);
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
      onOpenAll: (docs) => {
        this.openDocsByProtocol(docs.map((doc) => doc.id));
      },
      onInsertLinks: (docs) => {
        void this.insertDocLinks(docId, docs);
      },
    });
    showMessage(`识别到 ${candidates.length} 组重复候选`, 5000, "info");
  }

  private async handleStyleSelectedBlocks(
    docId: string,
    protyle: ProtyleLike | undefined,
    style: BlockStyle
  ) {
    const selectedIds = getSelectedBlockIds(protyle);
    if (!selectedIds.length) {
      showMessage("未选中任何块，请先选中块", 5000, "info");
      return;
    }

    const kramdowns = await getBlockKramdowns(selectedIds);
    const kramdownMap = new Map(
      kramdowns.map((item) => [item.id, item.kramdown || ""])
    );

    let success = 0;
    let failed = 0;
    let skipped = 0;
    const failures: StyleFailureDetail[] = [];
    for (const id of selectedIds) {
      const source = kramdownMap.get(id);
      if (source === undefined) {
        failed += 1;
        failures.push({
          id,
          kind: "source-missing",
          reason: "读取块源码失败",
        });
        continue;
      }
      const next = applyBlockStyle(source, style);
      if (next === source) {
        skipped += 1;
        continue;
      }
      try {
        await updateBlockMarkdown(id, next);
        success += 1;
      } catch (error: unknown) {
        failed += 1;
        failures.push({
          id,
          kind: "update-failed",
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (success === 0 && failed === 0 && skipped > 0) {
      showMessage("未发现可处理内容", 4000, "info");
      return;
    }
    if (failed > 0) {
      const sample = this.summarizeStyleFailures(failures);
      styleLogger.warn("apply failed", {
        docId,
        style,
        selectedCount: selectedIds.length,
        success,
        failed,
        skipped,
        failures,
      });
      showMessage(
        `处理完成，成功 ${success}，失败 ${failed}${sample ? `（${sample}）` : ""}`,
        6000,
        "error"
      );
      return;
    }
    showMessage(`已处理 ${success} 个块`, 5000, "info");
  }

  private summarizeStyleFailures(failures: StyleFailureDetail[]): string {
    if (!failures.length) {
      return "";
    }
    const normalized = failures
      .slice(0, 3)
      .map((item) => {
        const reason = (item.reason || "").replace(/\s+/g, " ").trim();
        if (!reason) {
          return `${item.id}`;
        }
        const compact = reason.length > 24 ? `${reason.slice(0, 24)}...` : reason;
        return `${item.id}:${compact}`;
      })
      .join("；");
    return normalized;
  }

  private openDocByProtocol(blockId: string) {
    const url = `siyuan://blocks/${blockId}`;
    try {
      window.open(url);
    } catch {
      window.location.href = url;
    }
  }

  private openDocsByProtocol(ids: string[]) {
    const unique = [...new Set(ids)].filter(Boolean);
    if (!unique.length) {
      showMessage("没有可打开的文档", 4000, "info");
      return;
    }
    unique.forEach((id, index) => {
      window.setTimeout(() => {
        this.openDocByProtocol(id);
      }, index * 120);
    });
    showMessage(`已尝试打开 ${unique.length} 篇文档`, 5000, "info");
  }

  private async insertDocLinks(
    docId: string,
    docs: Array<{ id: string; title: string }>
  ) {
    const unique = new Map<string, { id: string; title: string }>();
    for (const doc of docs) {
      if (!doc?.id || unique.has(doc.id)) {
        continue;
      }
      unique.set(doc.id, { id: doc.id, title: doc.title || doc.id });
    }
    const items = Array.from(unique.values());
    if (!items.length) {
      showMessage("没有可插入的文档链接", 4000, "info");
      return;
    }
    const lines = items.map((item) => `- [${item.title}](siyuan://blocks/${item.id})`);
    const markdown = `## 重复候选文档\n\n${lines.join("\n")}`;
    await appendBlock(markdown, docId);
    showMessage(`已插入 ${items.length} 个文档链接`, 5000, "info");
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

  private async handleToggleLinksRefs(docId: string) {
    const blocks = await getChildBlocksByParentId(docId);
    if (!blocks.length) {
      showMessage("当前文档没有可处理的段落", 4000, "info");
      return;
    }

    const docMarkdown = blocks.map((block) => block.markdown || "").join("\n");
    const modeResult = convertSiyuanLinksAndRefsInMarkdown(docMarkdown);
    if (modeResult.mode === "none" || modeResult.convertedCount <= 0) {
      showMessage("当前文档未发现可互转的思源文档链接或引用", 4000, "info");
      return;
    }

    let convertedCount = 0;
    let updatedBlockCount = 0;
    let failedBlockCount = 0;
    const skippedRiskyIds: string[] = [];
    for (const block of blocks) {
      const source = block.markdown || "";
      if (!source) {
        continue;
      }
      if (isHighRiskForMarkdownWrite(source)) {
        skippedRiskyIds.push(block.id);
        continue;
      }
      const converted = convertSiyuanLinksAndRefsInMarkdown(source, modeResult.mode);
      if (converted.convertedCount <= 0 || converted.markdown === source) {
        continue;
      }
      try {
        await updateBlockMarkdown(block.id, converted.markdown);
        updatedBlockCount += 1;
        convertedCount += converted.convertedCount;
      } catch {
        failedBlockCount += 1;
      }
    }

    if (!updatedBlockCount) {
      if (skippedRiskyIds.length) {
        showMessage("检测到高风险块，未执行互转（可先移除复杂内联后重试）", 5000, "error");
        return;
      }
      showMessage("当前文档未发现可互转的思源文档链接或引用", 4000, "info");
      return;
    }

    const actionLabel =
      modeResult.mode === "link-to-ref" ? "文档链接转换为引用" : "引用转换为文档链接";
    if (failedBlockCount > 0) {
      showMessage(
        `已将 ${convertedCount} 处${actionLabel}，共更新 ${updatedBlockCount} 个块，失败 ${failedBlockCount} 个块`,
        7000,
        "error"
      );
      return;
    }
    showMessage(`已将 ${convertedCount} 处${actionLabel}，共更新 ${updatedBlockCount} 个块`, 5000, "info");
  }

  private async handleConvertImagesToWebp(docId: string) {
    const report = await convertDocImagesToWebp(docId);
    if (report.scannedImageCount <= 0) {
      showMessage("当前文档未发现可转换的本地图片", 5000, "info");
      return;
    }
    if (report.replacedLinkCount <= 0) {
      if (report.failedImageCount > 0) {
        showMessage(`未完成任何替换，失败 ${report.failedImageCount} 张图片`, 7000, "error");
        return;
      }
      showMessage("未完成任何替换（可能已是 WebP 或压缩收益不足）", 5000, "info");
      return;
    }
    const savedKb = (report.totalSavedBytes / 1024).toFixed(1);
    const gifSuffix = report.skippedGifCount > 0 ? `（已忽略 GIF ${report.skippedGifCount} 张）` : "";
    const suffix = report.failedImageCount > 0 ? `，失败 ${report.failedImageCount} 张` : "";
    showMessage(
      `图片转换完成：替换 ${report.replacedLinkCount} 处，更新 ${report.updatedBlockCount} 个块，转换 ${report.convertedImageCount} 张，节省 ${savedKb} KB${gifSuffix}${suffix}`,
      report.failedImageCount > 0 ? 7000 : 6000,
      report.failedImageCount > 0 ? "error" : "info"
    );
  }

  private async handleConvertImagesToPng(docId: string) {
    const report = await convertDocImagesToPng(docId);
    if (report.scannedImageCount <= 0) {
      showMessage("当前文档未发现可转换的本地图片", 5000, "info");
      return;
    }
    if (report.replacedLinkCount <= 0) {
      if (report.failedImageCount > 0) {
        showMessage(`未完成任何替换，失败 ${report.failedImageCount} 张图片`, 7000, "error");
        return;
      }
      showMessage("未完成任何替换（已是 PNG 或仅包含 GIF）", 5000, "info");
      return;
    }
    const suffix =
      report.failedImageCount > 0 ? `，失败 ${report.failedImageCount} 张` : "";
    showMessage(
      `PNG 转换完成：替换 ${report.replacedLinkCount} 处，更新 ${report.updatedBlockCount} 个块，转换 ${report.convertedImageCount} 张（已忽略 GIF）${suffix}`,
      report.failedImageCount > 0 ? 7000 : 6000,
      report.failedImageCount > 0 ? "error" : "info"
    );
  }

  private async handleRemoveDocImages(docId: string) {
    const report = await removeDocImageLinks(docId);
    if (report.scannedImageLinkCount <= 0) {
      showMessage("当前文档未发现可删除的图片链接", 5000, "info");
      return;
    }
    if (report.removedLinkCount <= 0) {
      showMessage(`未删除任何图片链接，失败 ${report.failedBlockCount} 个块`, 7000, "error");
      return;
    }
    const suffix = report.failedBlockCount > 0 ? `，失败 ${report.failedBlockCount} 个块` : "";
    showMessage(
      `图片链接删除完成：删除 ${report.removedLinkCount} 处，更新 ${report.updatedBlockCount} 个块${suffix}`,
      report.failedBlockCount > 0 ? 7000 : 6000,
      report.failedBlockCount > 0 ? "error" : "info"
    );
  }

  private async handleTrimTrailingWhitespace(docId: string) {
    const blocks = await getChildBlocksByParentId(docId);
    const paragraphBlocks = blocks.filter(
      (block) => (block.type || "").toLowerCase() === "p"
    );
    const paragraphBlockIdSet = new Set(paragraphBlocks.map((block) => block.id));
    trailingWhitespaceLogger.debug("scan start", {
      docId,
      blockCount: blocks.length,
      paragraphCount: paragraphBlocks.length,
    });
    if (!paragraphBlocks.length) {
      showMessage("当前文档没有可处理的段落", 4000, "info");
      return;
    }

    const collectUpdatesFromSourceMap = (
      sourceMap: Map<string, string>,
      domMap: Map<string, string>
    ) => {
      const updates: Array<{
        id: string;
        dataType: "markdown" | "dom";
        data: string;
        changedLines: number;
      }> = [];
      const skippedRiskyIds: string[] = [];
      let affectedLineCount = 0;
      for (const block of paragraphBlocks) {
        const sourceFromKramdown = sourceMap.get(block.id);
        const sourceDom = domMap.get(block.id) || "";
        if (block.resolved === false && sourceFromKramdown === undefined) {
          continue;
        }
        const source = sourceFromKramdown === undefined ? block.markdown || "" : sourceFromKramdown;
        const markdownCleaned = removeTrailingWhitespaceFromMarkdown(source);
        const hasHighRiskFormat =
          isHighRiskForMarkdownWrite(source) ||
          isHighRiskForMarkdownWrite(block.markdown || "") ||
          isHighRiskForMarkdownWrite(sourceDom);
        if (hasHighRiskFormat) {
          if (!sourceDom) {
            if (markdownCleaned.changedLines > 0) {
              skippedRiskyIds.push(block.id);
            }
            continue;
          }
          const domCleaned = removeTrailingWhitespaceFromDom(sourceDom);
          if (domCleaned.changedLines <= 0) {
            continue;
          }
          updates.push({
            id: block.id,
            dataType: "dom",
            data: domCleaned.dom,
            changedLines: domCleaned.changedLines,
          });
          affectedLineCount += domCleaned.changedLines;
          continue;
        }
        if (markdownCleaned.changedLines <= 0) {
          continue;
        }
        const cleaned = markdownCleaned;
        let markdownForUpdate = cleaned.markdown;
        if (sourceFromKramdown !== undefined && block.resolved !== false) {
          // Blocks containing block references with inline IALs (((ref)){: ...}) are known to have
          // their IAL corrupted by updateBlock reconstruction — the IAL becomes literal text.
          // Skip such blocks unconditionally to prevent content corruption.
          if (/\(\([^)]+\)\)\{:/.test(block.markdown || "")) {
            trailingWhitespaceLogger.debug("skip block with block-ref inline IAL to prevent corruption", {
              id: block.id,
            });
            continue;
          }
          // Prefer SQL markdown for write-back to preserve leading indentation.
          // Also append the block-level IAL from the cleaned per-block kramdown so that
          // block attributes (e.g. memo/备注) are not lost on reconstruction.
          const sqlCleaned = removeTrailingWhitespaceFromMarkdown(block.markdown || "");
          markdownForUpdate = sqlCleaned.markdown;
          const blockIal = extractBlockLevelIal(cleaned.markdown);
          if (blockIal) {
            markdownForUpdate = `${markdownForUpdate}\n${blockIal}`;
          }
        }
        updates.push({
          id: block.id,
          dataType: "markdown",
          data: markdownForUpdate,
          changedLines: cleaned.changedLines,
        });
        affectedLineCount += cleaned.changedLines;
      }
      return { updates, affectedLineCount, skippedRiskyIds };
    };

    const batchRows = (await getBlockKramdowns(paragraphBlocks.map((block) => block.id))) || [];
    const batchMap = new Map(
      batchRows.map((item) => [item.id, item.kramdown || ""])
    );
    const domRows = (await getBlockDOMs(paragraphBlocks.map((block) => block.id))) || [];
    const domMap = new Map(
      domRows.map((item) => [item.id, item.dom || ""])
    );
    const { updates, affectedLineCount, skippedRiskyIds } = collectUpdatesFromSourceMap(batchMap, domMap);
    trailingWhitespaceLogger.debug("batch scan result", {
      docId,
      batchCount: batchRows.length,
      domCount: domRows.length,
      updateCount: updates.length,
      affectedLineCount,
      skippedRiskyCount: skippedRiskyIds.length,
      skippedRiskySample: skippedRiskyIds.slice(0, 8),
      updateSample: updates.slice(0, 8).map((item) => item.id),
    });

    if (!updates.length) {
      const probeSamples = paragraphBlocks.slice(0, 8).map((block) => {
        const source = (batchMap.get(block.id) ?? block.markdown) || "";
        return {
          id: block.id,
          length: source.length,
          hasWhiteSpacePre: /white-space\s*:\s*pre/i.test(source),
          hasTailWhitespace: /[ \t]+$/.test(source),
          hasEscapedWhitespaceToken: /(?:\\t|\\u0009|\\x09)/i.test(source),
          preview: JSON.stringify(source.slice(0, 200)),
        };
      });
      trailingWhitespaceLogger.debug("no-op source probe", {
        docId,
        sampleCount: probeSamples.length,
        samples: probeSamples,
      });
      showMessage("未发现需要清理的行尾空格", 4000, "info");
      return;
    }

    const ok = await this.askConfirmWithVisibleDialog(
      "确认清理行尾空格",
      `将更新 ${updates.length} 个块，清理 ${affectedLineCount} 行行尾空格，是否继续？`
    );
    if (!ok) {
      return;
    }
    this.deps.setBusy?.(true);

    const maxApplyAttempts = 3;
    const maxVerifyReadAttempts = 3;
    const verifyReadDelayMs = 80;
    const retryDelayMs = 120;
    const sleep = async (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });
    const previewMarkdown = (value: string, max = 160) =>
      JSON.stringify(value.length > max ? `${value.slice(0, max)}…` : value);
    let successBlockCount = 0;
    let successLineCount = 0;
    let failedBlockCount = 0;
    const failedUpdates: Array<{
      id: string;
      attempts: number;
      verifyReads: number;
      message: string;
      lastChangedLines: number;
      persistedPreview: string;
      cleanedPreview: string;
    }> = [];
    for (const item of updates) {
      let currentData = item.data;
      let attempts = 0;
      let applied = false;
      let failureMessage = "";
      let verifyReads = 0;
      let lastChangedLines = 0;
      let lastPersistedPreview = "";
      let lastCleanedPreview = previewMarkdown(currentData);
      for (let attempt = 1; attempt <= maxApplyAttempts; attempt += 1) {
        attempts = attempt;
        try {
          if (item.dataType === "dom") {
            await updateBlockDom(item.id, currentData);
          } else {
            await updateBlockMarkdown(item.id, currentData);
          }
        } catch (error: unknown) {
          failureMessage = error instanceof Error ? error.message : String(error);
          break;
        }
        if (item.dataType === "dom") {
          applied = true;
          break;
        }
        try {
          let verifiedClean = false;
          for (let readAttempt = 1; readAttempt <= maxVerifyReadAttempts; readAttempt += 1) {
            verifyReads = readAttempt;
            const persistedRows = paragraphBlockIdSet.has(item.id)
              ? (await getBlockKramdowns([item.id])) || []
              : [];
            const persistedMarkdown = persistedRows.find((row) => row.id === item.id)?.kramdown;
            if (typeof persistedMarkdown !== "string") {
              // Some kernels may not return row data immediately; keep backward-compatible success.
              applied = true;
              verifiedClean = true;
              break;
            }
            lastPersistedPreview = previewMarkdown(persistedMarkdown);
            const verification = removeTrailingWhitespaceFromMarkdown(persistedMarkdown);
            lastChangedLines = verification.changedLines;
            lastCleanedPreview = previewMarkdown(verification.markdown);
            if (verification.changedLines <= 0) {
              applied = true;
              verifiedClean = true;
              break;
            }
            currentData = verification.markdown;
            failureMessage = `verification-not-clean:${verification.changedLines}`;
            if (readAttempt < maxVerifyReadAttempts) {
              await sleep(verifyReadDelayMs * readAttempt);
            }
          }
          if (verifiedClean) {
            break;
          }
          if (attempt < maxApplyAttempts) {
            await sleep(retryDelayMs * attempt);
          }
        } catch (error: unknown) {
          // Verification failures should not block the operation itself.
          applied = true;
          failureMessage = `verification-skipped:${error instanceof Error ? error.message : String(error)}`;
          break;
        }
      }
      if (applied) {
        successBlockCount += 1;
        successLineCount += item.changedLines;
      } else {
        failedBlockCount += 1;
        failedUpdates.push({
          id: item.id,
          attempts,
          verifyReads,
          message: failureMessage || "unknown failure",
          lastChangedLines,
          persistedPreview: lastPersistedPreview,
          cleanedPreview: lastCleanedPreview,
        });
      }
    }
    const failedSummary = failedUpdates
      .slice(0, 8)
      .map(
        (item) =>
          `${item.id}|attempts=${item.attempts}|reads=${item.verifyReads}|changed=${item.lastChangedLines}|${item.message}`
      );
    trailingWhitespaceLogger.debug("apply result", {
      docId,
      updateCount: updates.length,
      successBlockCount,
      successLineCount,
      failedBlockCount,
      maxApplyAttempts,
      maxVerifyReadAttempts,
      failedSummary,
      failedSample: failedUpdates.slice(0, 8),
    });

    if (failedBlockCount > 0) {
      showMessage(
        `已清理 ${successBlockCount} 个块、${successLineCount} 行，失败 ${failedBlockCount} 个块`,
        7000,
        "error"
      );
      return;
    }
    showMessage(`已清理 ${successBlockCount} 个块、${successLineCount} 行行尾空格`, 5000, "info");
  }

  private async handleDeleteFromCurrentToEnd(docId: string, protyle?: ProtyleLike) {
    const current = resolveCurrentBlockId(docId, protyle);
    const currentBlockId = current.id;
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
    let mappedFromNested = false;
    if (!directChildIdSet.has(deleteStartId)) {
      const mapped = await resolveDocDirectChildBlockId(docId, deleteStartId);
      if (mapped) {
        mappedFromNested = true;
        deleteStartId = mapped;
      }
    }
    deleteFromCurrentLogger.debug("resolve start block", {
      docId,
      source: current.source,
      currentBlockIdWasDocId: current.wasDocId,
      currentBlockId,
      deleteStartId,
      mappedFromNested,
      directChildCount: blocks.length,
    });

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
