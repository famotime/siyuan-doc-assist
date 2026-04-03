import { showMessage } from "siyuan";
import { AiServiceConfig } from "@/core/ai-service-config-core";
import { buildMergeSelectedListBlocksPreview } from "@/core/list-block-merge-core";
import {
  convertSiyuanLinksAndRefsInMarkdown,
  extractSiyuanBlockIdsFromMarkdown,
  markInvalidSiyuanLinkRefsInMarkdown,
} from "@/core/link-core";
import { KeyInfoFilter } from "@/core/key-info-core";
import { buildHeadingBoldTogglePreview } from "@/core/heading-bold-toggle-core";
import { createDocAssistantLogger } from "@/core/logger-core";
import {
  cleanupAiOutputArtifactsInMarkdown,
  findDeleteFromCurrentBlockIds,
  findExtraBlankParagraphIds,
  findHeadingMissingBlankParagraphBeforeIds,
  removeClippedListPrefixesFromMarkdown,
  removeStrikethroughMarkedContentFromMarkdown,
  removeTrailingWhitespaceFromDom,
  removeTrailingWhitespaceFromMarkdown,
  splitBilingualParagraphMarkdown,
} from "@/core/markdown-cleanup-core";
import { applyBlockStyle, BlockStyle } from "@/core/markdown-style-core";
import {
  convertChineseEnglishPunctuation,
  detectPunctuationToggleMode,
  PunctuationToggleMode,
} from "@/core/punctuation-toggle-core";
import { resolveDocDirectChildBlockId } from "@/services/block-lineage";
import {
  appendBlock,
  deleteBlocksByIds,
  getBlockDOMs,
  getDocReadonlyState,
  getBlockKramdowns,
  getChildBlockRefsByParentId,
  getChildBlocksByParentId,
  getDocMetaByID,
  insertBlockBefore,
  updateBlockDom,
  updateBlockMarkdown,
} from "@/services/kernel";
import { ActionConfig, ActionKey, ACTIONS } from "@/plugin/actions";
import { applyMarkdownTransformToBlocks } from "@/plugin/action-runner-block-transform";
import {
  getExplicitlySelectedBlockIds,
  getSelectedBlockIds,
  resolveCurrentBlockId,
} from "@/plugin/action-runner-context";
import { dispatchAction, ActionHandlerMap } from "@/plugin/action-runner-dispatcher";
import { createAiActionHandlers } from "@/plugin/action-runner-ai-handlers";
import { createExportActionHandlers } from "@/plugin/action-runner-export-handlers";
import { createInsertActionHandlers } from "@/plugin/action-runner-insert-handlers";
import { createMediaActionHandlers } from "@/plugin/action-runner-media-handlers";
import { createOrganizeActionHandlers } from "@/plugin/action-runner-organize-handlers";
import { ProtyleLike } from "@/plugin/doc-context";

type ActionRunnerDeps = {
  isMobile: () => boolean;
  resolveDocId: (explicitId?: string, protyle?: ProtyleLike) => string;
  askConfirm: (title: string, text: string) => Promise<boolean>;
  setBusy?: (busy: boolean) => void;
  getKeyInfoFilter?: () => KeyInfoFilter | undefined;
  getAiSummaryConfig?: () => AiServiceConfig | undefined;
};

type StyleFailureKind = "source-missing" | "update-failed";

type StyleFailureDetail = {
  id: string;
  kind: StyleFailureKind;
  reason: string;
};

type AiOutputCleanupPreview = {
  cleanableBlockCount: number;
  riskyPendingBlockCount: number;
  removedSupCount: number;
  removedCaretCount: number;
  removedInternetLinkCount: number;
};

type StrikethroughCleanupPreview = {
  cleanableBlockCount: number;
  riskyPendingBlockCount: number;
  removedCount: number;
};

type LinebreakToggleMode = "linebreak-to-paragraph" | "paragraph-to-line";

const styleLogger = createDocAssistantLogger("Style");
const trailingWhitespaceLogger = createDocAssistantLogger("TrailingWhitespace");
const deleteFromCurrentLogger = createDocAssistantLogger("DeleteFromCurrent");
const INLINE_SPACE_LIKE_PATTERN = /[ \t\u00A0\u1680\u2000-\u200D\u202F\u205F\u3000\uFEFF]/gu;
const DELETE_BLOCK_CONCURRENCY = 6;

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

function normalizeLineEndings(value: string): string {
  return (value || "").replace(/\r\n/g, "\n");
}

function countSingleLineBreaks(value: string): number {
  const normalized = normalizeLineEndings(value);
  const matches = normalized.match(/(?<!\n)\n(?!\n)/g);
  return matches?.length || 0;
}

function convertSingleLineBreaksToParagraphMarks(value: string): string {
  const normalized = normalizeLineEndings(value);
  return normalized.replace(/(?<!\n)\n(?!\n)/g, "\n\n");
}

function isParagraphBlockType(type: string): boolean {
  const normalized = (type || "").trim().toLowerCase();
  return (
    normalized === "p" ||
    normalized === "paragraph" ||
    normalized === "nodeparagraph" ||
    normalized === "i" ||
    normalized === "listitem" ||
    normalized === "nodelistitem" ||
    normalized === "l" ||
    normalized === "list" ||
    normalized === "nodelist"
  );
}

function isSafeBilingualSplitBlockType(type: string): boolean {
  const normalized = (type || "").trim().toLowerCase();
  return normalized === "p" || normalized === "paragraph" || normalized === "nodeparagraph";
}

function removeSpaceLikeChars(value: string): { next: string; removedCount: number } {
  let removedCount = 0;
  const next = (value || "").replace(INLINE_SPACE_LIKE_PATTERN, () => {
    removedCount += 1;
    return "";
  });
  return { next, removedCount };
}

export class ActionRunner {
  private isRunning = false;

  private readonly actionHandlers: ActionHandlerMap;

  constructor(private readonly deps: ActionRunnerDeps) {
    this.actionHandlers = {
      ...createExportActionHandlers({
        getKeyInfoFilter: this.deps.getKeyInfoFilter,
      }),
      ...createAiActionHandlers({
        getAiSummaryConfig: this.deps.getAiSummaryConfig,
      }),
      ...createInsertActionHandlers(),
      ...createOrganizeActionHandlers({
        askConfirmWithVisibleDialog: (title, text) => this.askConfirmWithVisibleDialog(title, text),
        ensureDocWritable: (docId, actionLabel) => this.ensureDocWritable(docId, actionLabel),
        setBusy: this.deps.setBusy,
      }),
      ...createMediaActionHandlers(),
      "remove-extra-blank-lines": async (docId) => this.handleRemoveExtraBlankLines(docId),
      "trim-trailing-whitespace": async (docId) => this.handleTrimTrailingWhitespace(docId),
      "toggle-links-refs": async (docId) => this.handleToggleLinksRefs(docId),
      "clean-ai-output": async (docId) => this.handleCleanAiOutput(docId),
      "clean-clipped-list-prefixes": async (docId) => this.handleCleanClippedListPrefixes(docId),
      "remove-strikethrough-marked-content": async (docId) =>
        this.handleRemoveStrikethroughMarkedContent(docId),
      "mark-invalid-links-refs": async (docId) => this.handleMarkInvalidLinksRefs(docId),
      "insert-blank-before-headings": async (docId) => this.handleInsertBlankBeforeHeadings(docId),
      "toggle-heading-bold": async (docId) => this.handleToggleHeadingBold(docId),
      "merge-selected-list-blocks": async (docId, protyle) =>
        this.handleMergeSelectedListBlocks(docId, protyle),
      "delete-from-current-to-end": async (docId, protyle) =>
        this.handleDeleteFromCurrentToEnd(docId, protyle),
      "bold-selected-blocks": async (docId, protyle) =>
        this.handleStyleSelectedBlocks(docId, protyle, "bold"),
      "highlight-selected-blocks": async (docId, protyle) =>
        this.handleStyleSelectedBlocks(docId, protyle, "highlight"),
      "toggle-linebreaks-paragraphs": async (docId, protyle) =>
        this.handleToggleLinebreaksParagraphs(docId, protyle),
      "remove-selected-spacing": async (docId, protyle) =>
        this.handleRemoveSelectedSpacing(docId, protyle),
      "toggle-selected-punctuation": async (docId, protyle) =>
        this.handleToggleSelectedPunctuation(docId, protyle),
    } as ActionHandlerMap;
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

    if (config?.requiresWritableDoc) {
      const writable = await this.ensureDocWritable(docId, config.commandText);
      if (!writable) {
        return;
      }
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

  private async ensureDocWritable(docId: string, actionLabel: string): Promise<boolean> {
    if (!docId) {
      return true;
    }
    const readonly = await getDocReadonlyState(docId);
    if (!readonly) {
      return true;
    }
    showMessage(
      `当前文档已锁定，无法执行“${actionLabel}”。请先解除文档锁定后再试。`,
      5000,
      "info"
    );
    return false;
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

    const pendingUpdates: Array<{ id: string; next: string }> = [];
    let skipped = 0;
    const failures: StyleFailureDetail[] = [];
    for (const id of selectedIds) {
      const source = kramdownMap.get(id);
      if (source === undefined) {
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
      pendingUpdates.push({ id, next });
    }

    if (pendingUpdates.length > 0) {
      const styleLabel = style === "bold" ? "加粗" : "高亮";
      const confirmLines = [
        `模式：选中块${styleLabel}`,
        `选中 ${selectedIds.length} 个块，预计更新 ${pendingUpdates.length} 个块。`,
      ];
      if (skipped > 0) {
        confirmLines.push(`无变化 ${skipped} 个块。`);
      }
      if (failures.length > 0) {
        confirmLines.push(`读取失败 ${failures.length} 个块，本次将跳过。`);
      }
      confirmLines.push("是否继续？");
      const ok = await this.askConfirmWithVisibleDialog("确认批量样式处理", confirmLines.join("\n"));
      if (!ok) {
        return;
      }
      this.deps.setBusy?.(true);
    }

    let success = 0;
    for (const item of pendingUpdates) {
      try {
        await updateBlockMarkdown(item.id, item.next);
        success += 1;
      } catch (error: unknown) {
        failures.push({
          id: item.id,
          kind: "update-failed",
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const failed = failures.length;

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

  private async handleRemoveSelectedSpacing(_docId: string, protyle?: ProtyleLike) {
    const explicitSelectedIds = getExplicitlySelectedBlockIds(protyle);
    if (!explicitSelectedIds.length) {
      const partialResult = this.applyPartialSelectionSpacingCleanup(protyle);
      if (partialResult.handled) {
        if (partialResult.removedCount > 0) {
          showMessage(`已清理选中内容，移除 ${partialResult.removedCount} 个字符`, 5000, "info");
        } else {
          showMessage("选中内容未发现可清理字符", 4000, "info");
        }
        return;
      }
    }

    if (explicitSelectedIds.length > 0) {
      const selectedBlockResult = this.applySelectedBlocksSpacingCleanupFromDom(
        protyle,
        explicitSelectedIds
      );
      if (selectedBlockResult) {
        if (selectedBlockResult.removedCount > 0) {
          showMessage(
            `已清理 ${selectedBlockResult.cleanedBlockCount} 个块，移除 ${selectedBlockResult.removedCount} 个字符`,
            5000,
            "info"
          );
        } else {
          showMessage("未发现可清理字符", 4000, "info");
        }
        return;
      }
    }

    const selectedIds = explicitSelectedIds.length
      ? explicitSelectedIds
      : getSelectedBlockIds(protyle);
    if (!selectedIds.length) {
      showMessage("未选中任何内容，请先选中后再操作", 5000, "info");
      return;
    }

    const rows = await getBlockKramdowns(selectedIds);
    const sourceMap = new Map(rows.map((item) => [item.id, item.kramdown || ""]));
    const updates: Array<{ id: string; next: string; removedCount: number }> = [];
    let missingSourceCount = 0;
    for (const id of selectedIds) {
      const source = sourceMap.get(id);
      if (source === undefined) {
        missingSourceCount += 1;
        continue;
      }
      const cleaned = removeSpaceLikeChars(source);
      if (cleaned.removedCount <= 0 || cleaned.next === source) {
        continue;
      }
      updates.push({
        id,
        next: cleaned.next,
        removedCount: cleaned.removedCount,
      });
    }

    if (!updates.length) {
      if (missingSourceCount > 0) {
        showMessage(`读取块源码失败，已跳过 ${missingSourceCount} 个块`, 6000, "error");
        return;
      }
      showMessage("未发现可清理字符", 4000, "info");
      return;
    }

    let success = 0;
    let failed = 0;
    let removedCount = 0;
    for (const item of updates) {
      try {
        await updateBlockMarkdown(item.id, item.next);
        success += 1;
        removedCount += item.removedCount;
      } catch {
        failed += 1;
      }
    }

    if (failed > 0 || missingSourceCount > 0) {
      showMessage(
        `处理完成：成功 ${success} 个块，失败 ${failed} 个块，跳过 ${missingSourceCount} 个块`,
        7000,
        "error"
      );
      return;
    }
    showMessage(`已清理 ${success} 个块，移除 ${removedCount} 个字符`, 5000, "info");
  }

  private async handleToggleSelectedPunctuation(_docId: string, protyle?: ProtyleLike) {
    const explicitSelectedIds = getExplicitlySelectedBlockIds(protyle);
    if (!explicitSelectedIds.length) {
      const partialResult = this.applyPartialSelectionPunctuationToggle(protyle);
      if (partialResult.handled) {
        if (partialResult.changedCount > 0) {
          showMessage(`已互转选中内容标点 ${partialResult.changedCount} 处`, 5000, "info");
        } else {
          showMessage("选中内容未发现可互转标点", 4000, "info");
        }
        return;
      }
    }

    if (explicitSelectedIds.length > 0) {
      const selectedBlockResult = this.applySelectedBlocksPunctuationToggleFromDom(
        protyle,
        explicitSelectedIds
      );
      if (selectedBlockResult) {
        if (selectedBlockResult.changedCount > 0) {
          showMessage(
            `已处理 ${selectedBlockResult.changedBlockCount} 个块，转换 ${selectedBlockResult.changedCount} 处标点`,
            5000,
            "info"
          );
        } else {
          showMessage("选中内容未发现可互转标点", 4000, "info");
        }
        return;
      }
    }

    const selectedIds = explicitSelectedIds.length
      ? explicitSelectedIds
      : getSelectedBlockIds(protyle);
    if (!selectedIds.length) {
      showMessage("未选中任何内容，请先选中后再操作", 5000, "info");
      return;
    }

    const rows = await getBlockKramdowns(selectedIds);
    const sourceMap = new Map(rows.map((item) => [item.id, item.kramdown || ""]));
    const modeSourceParts: string[] = [];
    let missingSourceCount = 0;
    for (const id of selectedIds) {
      const source = sourceMap.get(id);
      if (source === undefined) {
        missingSourceCount += 1;
        continue;
      }
      modeSourceParts.push(source);
    }
    const mode = detectPunctuationToggleMode(modeSourceParts.join("\n"));

    const updates: Array<{ id: string; next: string; changedCount: number }> = [];
    for (const id of selectedIds) {
      const source = sourceMap.get(id);
      if (source === undefined) {
        continue;
      }
      const converted = convertChineseEnglishPunctuation(source, mode);
      if (converted.changedCount <= 0 || converted.next === source) {
        continue;
      }
      updates.push({
        id,
        next: converted.next,
        changedCount: converted.changedCount,
      });
    }

    if (!updates.length) {
      if (missingSourceCount > 0) {
        showMessage(`读取块源码失败，已跳过 ${missingSourceCount} 个块`, 6000, "error");
        return;
      }
      showMessage("选中内容未发现可互转标点", 4000, "info");
      return;
    }

    let success = 0;
    let failed = 0;
    let changedCount = 0;
    for (const item of updates) {
      try {
        await updateBlockMarkdown(item.id, item.next);
        success += 1;
        changedCount += item.changedCount;
      } catch {
        failed += 1;
      }
    }

    if (failed > 0 || missingSourceCount > 0) {
      showMessage(
        `处理完成：成功 ${success} 个块，失败 ${failed} 个块，跳过 ${missingSourceCount} 个块`,
        7000,
        "error"
      );
      return;
    }
    showMessage(`已处理 ${success} 个块，转换 ${changedCount} 处标点`, 5000, "info");
  }

  private applySelectedBlocksSpacingCleanupFromDom(
    protyle: ProtyleLike | undefined,
    selectedIds: string[]
  ): { cleanedBlockCount: number; removedCount: number } | null {
    const root = protyle?.wysiwyg?.element as HTMLElement | undefined;
    if (!root || !selectedIds.length) {
      return null;
    }

    const blockElements: HTMLElement[] = [];
    for (const id of selectedIds) {
      const block = this.findBlockElementById(root, id);
      if (!block) {
        return null;
      }
      blockElements.push(block);
    }

    let cleanedBlockCount = 0;
    let removedCount = 0;
    for (const block of blockElements) {
      const editable =
        (block.querySelector('[contenteditable="true"]') as HTMLElement | null) || block;
      const removedInBlock = this.removeSpaceLikeCharsInTextNodes(editable);
      if (removedInBlock > 0) {
        cleanedBlockCount += 1;
        removedCount += removedInBlock;
        editable.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
    return { cleanedBlockCount, removedCount };
  }

  private applyPartialSelectionSpacingCleanup(
    protyle?: ProtyleLike
  ): { handled: boolean; removedCount: number } {
    if (typeof window === "undefined") {
      return { handled: false, removedCount: 0 };
    }

    const root = protyle?.wysiwyg?.element as HTMLElement | undefined;
    if (!root) {
      return { handled: false, removedCount: 0 };
    }
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return { handled: false, removedCount: 0 };
    }

    const range = selection.getRangeAt(0);
    const startBlockId = this.resolveRangeBoundaryBlockId(root, range.startContainer);
    const endBlockId = this.resolveRangeBoundaryBlockId(root, range.endContainer);
    if (!startBlockId || !endBlockId || startBlockId !== endBlockId) {
      return { handled: false, removedCount: 0 };
    }

    const blockElement = this.findBlockElementById(root, startBlockId);
    if (!blockElement) {
      return { handled: false, removedCount: 0 };
    }

    const selectedText = range.toString();
    const cleaned = removeSpaceLikeChars(selectedText);
    const removedCount = cleaned.removedCount;

    if (removedCount > 0) {
      range.deleteContents();
      range.insertNode(document.createTextNode(cleaned.next));
      const editable =
        (blockElement.querySelector('[contenteditable="true"]') as HTMLElement | null) ||
        blockElement;
      editable.dispatchEvent(new Event("input", { bubbles: true }));
    }
    selection.removeAllRanges();
    return { handled: true, removedCount };
  }

  private applySelectedBlocksPunctuationToggleFromDom(
    protyle: ProtyleLike | undefined,
    selectedIds: string[]
  ): { changedBlockCount: number; changedCount: number } | null {
    const root = protyle?.wysiwyg?.element as HTMLElement | undefined;
    if (!root || !selectedIds.length) {
      return null;
    }

    const blockElements: HTMLElement[] = [];
    for (const id of selectedIds) {
      const block = this.findBlockElementById(root, id);
      if (!block) {
        return null;
      }
      blockElements.push(block);
    }

    const modeSource = blockElements
      .map((block) => {
        const editable =
          (block.querySelector('[contenteditable="true"]') as HTMLElement | null) || block;
        return editable.textContent || "";
      })
      .join("\n");
    const mode = detectPunctuationToggleMode(modeSource);

    let changedBlockCount = 0;
    let changedCount = 0;
    for (const block of blockElements) {
      const editable =
        (block.querySelector('[contenteditable="true"]') as HTMLElement | null) || block;
      const changedInBlock = this.convertPunctuationInTextNodes(editable, mode);
      if (changedInBlock > 0) {
        changedBlockCount += 1;
        changedCount += changedInBlock;
        editable.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
    return { changedBlockCount, changedCount };
  }

  private applyPartialSelectionPunctuationToggle(
    protyle?: ProtyleLike
  ): { handled: boolean; changedCount: number } {
    if (typeof window === "undefined") {
      return { handled: false, changedCount: 0 };
    }

    const root = protyle?.wysiwyg?.element as HTMLElement | undefined;
    if (!root) {
      return { handled: false, changedCount: 0 };
    }
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return { handled: false, changedCount: 0 };
    }

    const range = selection.getRangeAt(0);
    const startBlockId = this.resolveRangeBoundaryBlockId(root, range.startContainer);
    const endBlockId = this.resolveRangeBoundaryBlockId(root, range.endContainer);
    if (!startBlockId || !endBlockId || startBlockId !== endBlockId) {
      return { handled: false, changedCount: 0 };
    }

    const blockElement = this.findBlockElementById(root, startBlockId);
    if (!blockElement) {
      return { handled: false, changedCount: 0 };
    }

    const selectedText = range.toString();
    const mode = detectPunctuationToggleMode(selectedText);
    const converted = convertChineseEnglishPunctuation(selectedText, mode);
    const changedCount = converted.changedCount;

    if (changedCount > 0) {
      range.deleteContents();
      range.insertNode(document.createTextNode(converted.next));
      const editable =
        (blockElement.querySelector('[contenteditable="true"]') as HTMLElement | null) ||
        blockElement;
      editable.dispatchEvent(new Event("input", { bubbles: true }));
    }
    selection.removeAllRanges();
    return { handled: true, changedCount };
  }

  private findBlockElementById(root: HTMLElement, blockId: string): HTMLElement | null {
    const nodes = root.querySelectorAll<HTMLElement>("[data-node-id]");
    for (const node of nodes) {
      const id = node.dataset.nodeId || node.getAttribute("data-node-id") || "";
      if (id === blockId) {
        return node;
      }
    }
    return null;
  }

  private resolveRangeBoundaryBlockId(root: HTMLElement, container: Node): string {
    const baseElement =
      container.nodeType === Node.ELEMENT_NODE
        ? (container as Element)
        : container.parentElement;
    if (!baseElement) {
      return "";
    }
    const blockElement = baseElement.closest?.("[data-node-id]") as HTMLElement | null;
    if (!blockElement || !root.contains(blockElement)) {
      return "";
    }
    return (blockElement.dataset.nodeId || blockElement.getAttribute("data-node-id") || "").trim();
  }

  private removeSpaceLikeCharsInTextNodes(root: HTMLElement): number {
    let removedCount = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current) {
      const textNode = current as Text;
      const source = textNode.nodeValue || "";
      const cleaned = removeSpaceLikeChars(source);
      if (cleaned.removedCount > 0) {
        textNode.nodeValue = cleaned.next;
        removedCount += cleaned.removedCount;
      }
      current = walker.nextNode();
    }
    return removedCount;
  }

  private convertPunctuationInTextNodes(root: HTMLElement, mode: PunctuationToggleMode): number {
    let changedCount = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current) {
      const textNode = current as Text;
      const source = textNode.nodeValue || "";
      const converted = convertChineseEnglishPunctuation(source, mode);
      if (converted.changedCount > 0) {
        textNode.nodeValue = converted.next;
        changedCount += converted.changedCount;
      }
      current = walker.nextNode();
    }
    return changedCount;
  }

  private async handleToggleLinebreaksParagraphs(docId: string, protyle?: ProtyleLike) {
    const blocks = await getChildBlocksByParentId(docId);
    if (!blocks.length) {
      showMessage("当前文档没有可处理的内容", 4000, "info");
      return;
    }

    const selectedIds = getSelectedBlockIds(protyle);
    const selectedSet = new Set(selectedIds);
    if (!selectedIds.length) {
      showMessage("未选中任何内容，请先选中后再操作", 5000, "info");
      return;
    }
    const targetBlocks = blocks.filter((block) => selectedSet.has(block.id));
    const useAllDoc = false;
    if (!targetBlocks.length) {
      showMessage("未在当前文档定位到选中内容，请调整选区后重试", 5000, "error");
      return;
    }

    const hasAnySingleLineBreak = targetBlocks.some(
      (block) => countSingleLineBreaks(normalizeLineEndings(block.markdown || "")) > 0
    );
    const shouldMergeParagraphs =
      !hasAnySingleLineBreak &&
      targetBlocks.length > 1 &&
      targetBlocks.every((block) => isParagraphBlockType(block.type));
    const mode: LinebreakToggleMode = shouldMergeParagraphs
      ? "paragraph-to-line"
      : "linebreak-to-paragraph";

    if (mode === "paragraph-to-line") {
      const first = targetBlocks[0];
      const mergedMarkdown = targetBlocks
        .map((block) => normalizeLineEndings(block.markdown || ""))
        .join("\n");
      const confirmLines = [
        useAllDoc ? "范围：本文档所有内容（未选中内容）" : `范围：选中块 ${targetBlocks.length} 个`,
        "模式：分段转换行",
        `预计更新 1 个块，删除 ${targetBlocks.length - 1} 个块。`,
        "是否继续？",
      ];
      const ok = await this.askConfirmWithVisibleDialog("确认执行换行-分段互转", confirmLines.join("\n"));
      if (!ok) {
        return;
      }
      this.deps.setBusy?.(true);

      let deleted = 0;
      let failed = 0;
      try {
        await updateBlockMarkdown(first.id, mergedMarkdown);
      } catch {
        failed += 1;
      }
      if (failed === 0) {
        const deleteResult = await deleteBlocksByIds(
          targetBlocks.slice(1).map((block) => block.id),
          { concurrency: DELETE_BLOCK_CONCURRENCY }
        );
        deleted = deleteResult.deletedCount;
        failed += deleteResult.failedIds.length;
      }

      if (failed > 0) {
        showMessage(`处理完成：已合并并删除 ${deleted} 个块，失败 ${failed} 个操作`, 7000, "error");
        return;
      }
      showMessage(`已将 ${targetBlocks.length} 个段落块合并为 1 个块`, 5000, "info");
      return;
    }

    const updates = targetBlocks
      .map((block) => {
        const source = normalizeLineEndings(block.markdown || "");
        const replaced = countSingleLineBreaks(source);
        if (replaced <= 0) {
          return null;
        }
        const next = convertSingleLineBreaksToParagraphMarks(source);
        if (next === source) {
          return null;
        }
        return {
          id: block.id,
          next,
          replaced,
        };
      })
      .filter((item): item is { id: string; next: string; replaced: number } => !!item);

    if (!updates.length) {
      showMessage("未发现可转换的单个换行", 4000, "info");
      return;
    }
    const replacedCount = updates.reduce((sum, item) => sum + item.replaced, 0);
    const confirmLines = [
      useAllDoc ? "范围：本文档所有内容（未选中内容）" : `范围：选中块 ${targetBlocks.length} 个`,
      "模式：换行转分段",
      `预计替换单个换行 ${replacedCount} 处，更新 ${updates.length} 个块。`,
      "是否继续？",
    ];
    const ok = await this.askConfirmWithVisibleDialog("确认执行换行-分段互转", confirmLines.join("\n"));
    if (!ok) {
      return;
    }
    this.deps.setBusy?.(true);

    let success = 0;
    let failed = 0;
    for (const item of updates) {
      try {
        await updateBlockMarkdown(item.id, item.next);
        success += 1;
      } catch {
        failed += 1;
      }
    }

    if (failed > 0) {
      showMessage(
        `处理完成：已替换单个换行 ${replacedCount} 处，成功更新 ${success} 个块，失败 ${failed} 个块`,
        7000,
        "error"
      );
      return;
    }
    showMessage(`已替换单个换行 ${replacedCount} 处，共更新 ${success} 个块`, 5000, "info");
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

    const deleteResult = await deleteBlocksByIds(result.deleteIds, {
      concurrency: DELETE_BLOCK_CONCURRENCY,
    });
    const failed = deleteResult.failedIds.length;

    if (failed > 0) {
      showMessage(`已去除 ${deleteResult.deletedCount} 个空段落，失败 ${failed} 个`, 6000, "error");
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

  private async handleToggleHeadingBold(docId: string) {
    const blocks = await getChildBlocksByParentId(docId);
    const preview = buildHeadingBoldTogglePreview(blocks);
    if (preview.totalHeadingCount === 0) {
      showMessage("当前文档没有标题块", 4000, "info");
      return;
    }
    if (preview.updateCount === 0) {
      showMessage("未发现可处理的标题块", 4000, "info");
      return;
    }

    const operationText = preview.mode === "remove-bold"
      ? "取消所有标题块加粗"
      : "加粗所有标题块";
    const ok = await this.askConfirmWithVisibleDialog(
      "确认标题块加粗状态切换",
      [
        `标题总数 ${preview.totalHeadingCount} 个`,
        `含加粗 ${preview.boldHeadingCount} 个`,
        `未加粗 ${preview.plainHeadingCount} 个`,
        `操作：${operationText}`,
        `预计更新 ${preview.updateCount} 个块`,
        "是否继续？",
      ].join("\n")
    );
    if (!ok) {
      return;
    }
    this.deps.setBusy?.(true);

    let success = 0;
    let failed = 0;
    for (const item of preview.updates) {
      try {
        await updateBlockMarkdown(item.id, item.next);
        success += 1;
      } catch {
        failed += 1;
      }
    }

    if (failed > 0) {
      showMessage(
        `标题块处理完成：成功 ${success} 个，失败 ${failed} 个`,
        7000,
        "error"
      );
      return;
    }

    showMessage(
      preview.mode === "remove-bold"
        ? `已取消 ${success} 个标题块的加粗`
        : `已为 ${success} 个标题块加粗`,
      5000,
      "info"
    );
  }

  private async handleMergeSelectedListBlocks(docId: string, protyle?: ProtyleLike) {
    const blocks = await getChildBlocksByParentId(docId);
    if (!blocks.length) {
      showMessage("当前文档没有可处理的内容", 4000, "info");
      return;
    }

    const selectedIds = getSelectedBlockIds(protyle);
    const selectedSet = new Set(selectedIds);
    if (!selectedIds.length) {
      showMessage("未选中任何内容，请先选中后再操作", 5000, "info");
      return;
    }

    const selectedBlocks = blocks.filter((block) => selectedSet.has(block.id));
    if (!selectedBlocks.length) {
      showMessage("未在当前文档定位到选中内容，请调整选区后重试", 5000, "error");
      return;
    }

    const preview = buildMergeSelectedListBlocksPreview(selectedBlocks);
    if (!preview.supportedBlockCount || !preview.updateBlockId || !preview.mergedMarkdown) {
      showMessage("选中内容不包含可合并的段落或列表块", 5000, "info");
      return;
    }
    if (!preview.hasChanges) {
      showMessage("选中内容已是单个列表块，无需处理", 4000, "info");
      return;
    }

    const confirmLines = [
      `范围：选中块 ${preview.selectedBlockCount} 个`,
      `普通段落转列表项 ${preview.paragraphBlockCount} 个`,
      `已有列表/列表项 ${preview.listLikeBlockCount} 个`,
      `预计生成列表项 ${preview.resultItemCount} 个`,
      `预计更新 1 个块，删除 ${preview.deleteBlockIds.length} 个块`,
    ];
    if (preview.skippedBlockCount > 0) {
      confirmLines.push(`跳过不支持块 ${preview.skippedBlockCount} 个`);
    }
    confirmLines.push("是否继续？");

    const ok = await this.askConfirmWithVisibleDialog(
      "确认合并列表块",
      confirmLines.join("\n")
    );
    if (!ok) {
      return;
    }
    this.deps.setBusy?.(true);

    let failed = 0;
    let deleted = 0;
    try {
      await updateBlockMarkdown(preview.updateBlockId, preview.mergedMarkdown);
    } catch {
      failed += 1;
    }

    if (failed === 0) {
      const deleteResult = await deleteBlocksByIds(preview.deleteBlockIds, {
        concurrency: DELETE_BLOCK_CONCURRENCY,
      });
      deleted = deleteResult.deletedCount;
      failed += deleteResult.failedIds.length;
    }

    if (failed > 0) {
      showMessage(`列表合并完成：已删除 ${deleted} 个块，失败 ${failed} 个操作`, 7000, "error");
      return;
    }

    showMessage(`已合并为 1 个列表块，共保留 ${preview.resultItemCount} 个列表项`, 5000, "info");
  }

  private async handleMarkInvalidLinksRefs(docId: string) {
    const blocks = await getChildBlocksByParentId(docId);
    if (!blocks.length) {
      showMessage("当前文档没有可处理的段落", 4000, "info");
      return;
    }

    const candidateIds = new Set<string>();
    for (const block of blocks) {
      const source = block.markdown || "";
      if (!source) {
        continue;
      }
      const ids = extractSiyuanBlockIdsFromMarkdown(source);
      for (const id of ids) {
        candidateIds.add(id);
      }
    }
    if (!candidateIds.size) {
      showMessage("当前文档未发现思源文档链接或引用", 4000, "info");
      return;
    }

    const invalidIds = new Set<string>();
    await Promise.all(
      [...candidateIds].map(async (id) => {
        try {
          const meta = await getDocMetaByID(id);
          if (!meta) {
            invalidIds.add(id);
          }
        } catch {
          invalidIds.add(id);
        }
      })
    );

    if (!invalidIds.size) {
      showMessage("当前文档未发现无效链接或引用", 4000, "info");
      return;
    }

    const report = await applyMarkdownTransformToBlocks({
      blocks,
      isHighRisk: (source) => isHighRiskForMarkdownWrite(source),
      updateBlockMarkdown,
      transform: (source) => {
        const marked = markInvalidSiyuanLinkRefsInMarkdown(source, invalidIds);
        return {
          markdown: marked.markdown,
          changedCount: marked.markedCount,
        };
      },
    });
    const markedCount = report.changedCount;
    const updatedBlockCount = report.updatedBlockCount;
    const failedBlockCount = report.failedBlockCount;
    const skippedRiskyIds = report.skippedRiskyIds;

    if (!updatedBlockCount) {
      if (skippedRiskyIds.length) {
        showMessage("检测到高风险块，未执行标示（可先移除复杂内联后重试）", 5000, "error");
        return;
      }
      showMessage("当前文档未发现无效链接或引用", 4000, "info");
      return;
    }

    if (failedBlockCount > 0) {
      showMessage(
        `已标示 ${markedCount} 处无效链接/引用，共更新 ${updatedBlockCount} 个块，失败 ${failedBlockCount} 个块`,
        7000,
        "error"
      );
      return;
    }
    showMessage(`已标示 ${markedCount} 处无效链接/引用，共更新 ${updatedBlockCount} 个块`, 5000, "info");
  }

  private async handleCleanAiOutput(docId: string) {
    const blocks = await getChildBlocksByParentId(docId);
    if (!blocks.length) {
      showMessage("当前文档没有可处理的段落", 4000, "info");
      return;
    }

    const preview = this.previewAiOutputCleanup(blocks);
    if (!preview.cleanableBlockCount) {
      if (preview.riskyPendingBlockCount > 0) {
        showMessage("检测到高风险块，未执行清理（可先移除复杂内联后重试）", 5000, "error");
        return;
      }
      showMessage("未发现可清理的 AI 输出内容", 4000, "info");
      return;
    }

    const confirmLines = [
      `已找到待清理内容：上标 ${preview.removedSupCount} 处，^^ ${preview.removedCaretCount} 处，互联网链接 ${preview.removedInternetLinkCount} 处。`,
      `预计将更新 ${preview.cleanableBlockCount} 个块，是否继续？`,
    ];
    if (preview.riskyPendingBlockCount > 0) {
      confirmLines.push(`另有 ${preview.riskyPendingBlockCount} 个高风险块包含可清理内容，本次将跳过。`);
    }
    const ok = await this.askConfirmWithVisibleDialog("确认清理AI输出内容", confirmLines.join("\n"));
    if (!ok) {
      return;
    }
    this.deps.setBusy?.(true);

    let removedSupCount = 0;
    let removedCaretCount = 0;
    let removedInternetLinkCount = 0;
    const report = await applyMarkdownTransformToBlocks({
      blocks,
      isHighRisk: (source) => isHighRiskForMarkdownWrite(source),
      updateBlockMarkdown,
      transform: (source) => {
        const cleaned = cleanupAiOutputArtifactsInMarkdown(source);
        return {
          ...cleaned,
          changedCount: cleaned.removedCount,
        };
      },
      onUpdated: (cleaned) => {
        removedSupCount += cleaned.removedSupCount;
        removedCaretCount += cleaned.removedCaretCount;
        removedInternetLinkCount += cleaned.removedInternetLinkCount;
      },
    });
    const updatedBlockCount = report.updatedBlockCount;
    const failedBlockCount = report.failedBlockCount;
    const skippedRiskyIds = report.skippedRiskyIds;

    if (!updatedBlockCount) {
      if (skippedRiskyIds.length) {
        showMessage("检测到高风险块，未执行清理（可先移除复杂内联后重试）", 5000, "error");
        return;
      }
      showMessage("未发现可清理的 AI 输出内容", 4000, "info");
      return;
    }

    const summary = `已清理 AI 输出残留：上标 ${removedSupCount} 处，^^ ${removedCaretCount} 处，互联网链接 ${removedInternetLinkCount} 处，共更新 ${updatedBlockCount} 个块`;
    if (failedBlockCount > 0) {
      showMessage(`${summary}，失败 ${failedBlockCount} 个块`, 7000, "error");
      return;
    }
    showMessage(summary, 5000, "info");
  }

  private async handleCleanClippedListPrefixes(docId: string) {
    const blocks = await getChildBlocksByParentId(docId);
    if (!blocks.length) {
      showMessage("当前文档没有可处理的段落", 4000, "info");
      return;
    }

    let listCleanupBlockCount = 0;
    let bilingualSplitBlockCount = 0;
    for (const block of blocks) {
      const source = block.markdown || "";
      if (!source) {
        continue;
      }
      const listCleanup = removeClippedListPrefixesFromMarkdown(source);
      if (listCleanup.removedCount > 0) {
        listCleanupBlockCount += 1;
      }
      if (isSafeBilingualSplitBlockType(block.type)) {
        const splitResult = splitBilingualParagraphMarkdown(listCleanup.markdown);
        if (splitResult.changed) {
          bilingualSplitBlockCount += 1;
        }
      }
    }

    const cleanableCount = listCleanupBlockCount + bilingualSplitBlockCount;
    if (!cleanableCount) {
      showMessage("未发现可清理的剪藏内容", 4000, "info");
      return;
    }

    const confirmLines: string[] = [];
    if (listCleanupBlockCount > 0) {
      confirmLines.push(`清理重复列表前缀 ${listCleanupBlockCount} 个块`);
    }
    if (bilingualSplitBlockCount > 0) {
      confirmLines.push(`拆分中英双语段落 ${bilingualSplitBlockCount} 个`);
    }
    confirmLines.push("是否继续？");
    const ok = await this.askConfirmWithVisibleDialog(
      "确认清理剪藏内容",
      confirmLines.join("\n")
    );
    if (!ok) {
      return;
    }
    this.deps.setBusy?.(true);

    let updatedBlockCount = 0;
    let splitParagraphCount = 0;
    let failedBlockCount = 0;
    for (const [index, block] of blocks.entries()) {
      const source = block.markdown || "";
      if (!source) {
        continue;
      }
      const listCleanup = removeClippedListPrefixesFromMarkdown(source);
      const splitResult = isSafeBilingualSplitBlockType(block.type)
        ? splitBilingualParagraphMarkdown(listCleanup.markdown)
        : { parts: [listCleanup.markdown], changed: false };
      if (listCleanup.removedCount === 0 && !splitResult.changed) {
        continue;
      }

      try {
        if (splitResult.changed) {
          const trailingBlock = splitResult.parts[1] || "";
          const nextBlockId = blocks[index + 1]?.id || "";
          if (nextBlockId) {
            await insertBlockBefore(trailingBlock, nextBlockId, docId);
          } else {
            await appendBlock(trailingBlock, docId);
          }
          await updateBlockMarkdown(block.id, splitResult.parts[0] || listCleanup.markdown);
          splitParagraphCount += 1;
          updatedBlockCount += 1;
          continue;
        }

        await updateBlockMarkdown(block.id, listCleanup.markdown);
        updatedBlockCount += 1;
      } catch {
        failedBlockCount += 1;
      }
    }

    if (!updatedBlockCount && !splitParagraphCount) {
      showMessage("清理完成，未更新任何块", 4000, "info");
      return;
    }

    const summary = splitParagraphCount > 0
      ? `已清理剪藏内容：更新 ${updatedBlockCount} 个块，拆分 ${splitParagraphCount} 个双语段落`
      : `已清理剪藏内容，共更新 ${updatedBlockCount} 个块`;
    if (failedBlockCount > 0) {
      showMessage(`${summary}，失败 ${failedBlockCount} 个块`, 7000, "error");
      return;
    }
    showMessage(summary, 5000, "info");
  }

  private async handleRemoveStrikethroughMarkedContent(docId: string) {
    const blocks = await getChildBlocksByParentId(docId);
    if (!blocks.length) {
      showMessage("当前文档没有可处理的段落", 4000, "info");
      return;
    }

    const preview = this.previewStrikethroughCleanup(blocks);
    if (!preview.cleanableBlockCount) {
      if (preview.riskyPendingBlockCount > 0) {
        showMessage("检测到高风险块，未执行清理（可先移除复杂内联后重试）", 5000, "error");
        return;
      }
      showMessage("未发现删除线标记内容", 4000, "info");
      return;
    }

    const confirmLines = [
      `已找到删除线标记内容 ${preview.removedCount} 处。`,
      `预计更新 ${preview.cleanableBlockCount} 个块，是否继续？`,
    ];
    if (preview.riskyPendingBlockCount > 0) {
      confirmLines.push(`另有 ${preview.riskyPendingBlockCount} 个高风险块将跳过。`);
    }
    const ok = await this.askConfirmWithVisibleDialog("确认清理预删除内容", confirmLines.join("\n"));
    if (!ok) {
      return;
    }
    this.deps.setBusy?.(true);

    let removedCount = 0;
    const report = await applyMarkdownTransformToBlocks({
      blocks,
      isHighRisk: (source) => isHighRiskForMarkdownWrite(source),
      updateBlockMarkdown,
      transform: (source) => {
        const cleaned = removeStrikethroughMarkedContentFromMarkdown(source);
        return {
          ...cleaned,
          changedCount: cleaned.removedCount,
        };
      },
      onUpdated: (cleaned) => {
        removedCount += cleaned.removedCount;
      },
    });
    const updatedBlockCount = report.updatedBlockCount;
    const failedBlockCount = report.failedBlockCount;
    const skippedRiskyIds = report.skippedRiskyIds;

    if (!updatedBlockCount) {
      if (skippedRiskyIds.length) {
        showMessage("检测到高风险块，未执行清理（可先移除复杂内联后重试）", 5000, "error");
        return;
      }
      showMessage("未发现删除线标记内容", 4000, "info");
      return;
    }

    const summary = `已清理删除线标记内容 ${removedCount} 处，共更新 ${updatedBlockCount} 个块`;
    if (failedBlockCount > 0) {
      showMessage(`${summary}，失败 ${failedBlockCount} 个块`, 7000, "error");
      return;
    }
    showMessage(summary, 5000, "info");
  }

  private previewAiOutputCleanup(
    blocks: Array<{ id: string; markdown?: string }>
  ): AiOutputCleanupPreview {
    const preview: AiOutputCleanupPreview = {
      cleanableBlockCount: 0,
      riskyPendingBlockCount: 0,
      removedSupCount: 0,
      removedCaretCount: 0,
      removedInternetLinkCount: 0,
    };

    for (const block of blocks) {
      const source = block.markdown || "";
      if (!source) {
        continue;
      }
      const cleaned = cleanupAiOutputArtifactsInMarkdown(source);
      const hasChanges = cleaned.removedCount > 0 && cleaned.markdown !== source;
      if (!hasChanges) {
        continue;
      }
      if (isHighRiskForMarkdownWrite(source)) {
        preview.riskyPendingBlockCount += 1;
        continue;
      }
      preview.cleanableBlockCount += 1;
      preview.removedSupCount += cleaned.removedSupCount;
      preview.removedCaretCount += cleaned.removedCaretCount;
      preview.removedInternetLinkCount += cleaned.removedInternetLinkCount;
    }

    return preview;
  }

  private previewStrikethroughCleanup(
    blocks: Array<{ id: string; markdown?: string }>
  ): StrikethroughCleanupPreview {
    const preview: StrikethroughCleanupPreview = {
      cleanableBlockCount: 0,
      riskyPendingBlockCount: 0,
      removedCount: 0,
    };

    for (const block of blocks) {
      const source = block.markdown || "";
      if (!source) {
        continue;
      }
      const cleaned = removeStrikethroughMarkedContentFromMarkdown(source);
      const hasChanges = cleaned.removedCount > 0 && cleaned.markdown !== source;
      if (!hasChanges) {
        continue;
      }
      if (isHighRiskForMarkdownWrite(source)) {
        preview.riskyPendingBlockCount += 1;
        continue;
      }
      preview.cleanableBlockCount += 1;
      preview.removedCount += cleaned.removedCount;
    }

    return preview;
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
    const preferredMode =
      modeResult.mode === "link-to-ref" ? "link-to-ref" : "ref-to-link";

    let previewConvertedCount = 0;
    let previewUpdatableBlockCount = 0;
    let previewRiskyBlockCount = 0;
    for (const block of blocks) {
      const source = block.markdown || "";
      if (!source) {
        continue;
      }
      const converted = convertSiyuanLinksAndRefsInMarkdown(source, preferredMode);
      const hasChanges = converted.convertedCount > 0 && converted.markdown !== source;
      if (!hasChanges) {
        continue;
      }
      if (isHighRiskForMarkdownWrite(source)) {
        previewRiskyBlockCount += 1;
        continue;
      }
      previewUpdatableBlockCount += 1;
      previewConvertedCount += converted.convertedCount;
    }

    if (!previewUpdatableBlockCount) {
      if (previewRiskyBlockCount > 0) {
        showMessage("检测到高风险块，未执行互转（可先移除复杂内联后重试）", 5000, "error");
        return;
      }
      showMessage("当前文档未发现可互转的思源文档链接或引用", 4000, "info");
      return;
    }

    const actionLabel =
      preferredMode === "link-to-ref" ? "文档链接转换为引用" : "引用转换为文档链接";
    const confirmLines = [
      `互转方向：${actionLabel}`,
      `预计转换 ${previewConvertedCount} 处，共更新 ${previewUpdatableBlockCount} 个块。`,
    ];
    if (previewRiskyBlockCount > 0) {
      confirmLines.push(`另有 ${previewRiskyBlockCount} 个高风险块将跳过。`);
    }
    confirmLines.push("是否继续？");
    const ok = await this.askConfirmWithVisibleDialog("确认链接/引用互转", confirmLines.join("\n"));
    if (!ok) {
      return;
    }
    this.deps.setBusy?.(true);

    const report = await applyMarkdownTransformToBlocks({
      blocks,
      isHighRisk: (source) => isHighRiskForMarkdownWrite(source),
      updateBlockMarkdown,
      transform: (source) => {
        const converted = convertSiyuanLinksAndRefsInMarkdown(source, preferredMode);
        return {
          markdown: converted.markdown,
          changedCount: converted.convertedCount,
        };
      },
    });
    const convertedCount = report.changedCount;
    const updatedBlockCount = report.updatedBlockCount;
    const failedBlockCount = report.failedBlockCount;
    const skippedRiskyIds = report.skippedRiskyIds;

    if (!updatedBlockCount) {
      if (skippedRiskyIds.length) {
        showMessage("检测到高风险块，未执行互转（可先移除复杂内联后重试）", 5000, "error");
        return;
      }
      showMessage("当前文档未发现可互转的思源文档链接或引用", 4000, "info");
      return;
    }

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

    const blocks = await getChildBlockRefsByParentId(docId);
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

    const deleteResult = await deleteBlocksByIds(result.deleteIds, {
      concurrency: DELETE_BLOCK_CONCURRENCY,
    });
    const failed = deleteResult.failedIds.length;

    if (failed > 0) {
      showMessage(`已删除 ${deleteResult.deletedCount} 个段落，失败 ${failed} 个`, 6000, "error");
      return;
    }
    showMessage(`已删除 ${result.deleteCount} 个段落`, 5000, "info");
  }
}
