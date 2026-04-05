import { showMessage } from "siyuan";
import { buildMergeSelectedListBlocksPreview } from "@/core/list-block-merge-core";
import { createDocAssistantLogger } from "@/core/logger-core";
import { applyBlockStyle, BlockStyle } from "@/core/markdown-style-core";
import {
  convertChineseEnglishPunctuation,
  detectPunctuationToggleMode,
  PunctuationToggleMode,
} from "@/core/punctuation-toggle-core";
import { deleteBlocksByIds, getBlockKramdowns, getChildBlocksByParentId, updateBlockMarkdown } from "@/services/kernel";
import {
  getExplicitlySelectedBlockIds,
  getSelectedBlockIds,
} from "@/plugin/action-runner-context";
import { PartialActionHandlerMap } from "@/plugin/action-runner-dispatcher";
import { ProtyleLike } from "@/plugin/doc-context";

type CreateSelectionActionHandlersDeps = {
  askConfirmWithVisibleDialog: (title: string, text: string) => Promise<boolean>;
  setBusy?: (busy: boolean) => void;
};

type StyleFailureKind = "source-missing" | "update-failed";

type StyleFailureDetail = {
  id: string;
  kind: StyleFailureKind;
  reason: string;
};

type LinebreakToggleMode = "linebreak-to-paragraph" | "paragraph-to-line";

const styleLogger = createDocAssistantLogger("Style");
const INLINE_SPACE_LIKE_PATTERN = /[ \t\u00A0\u1680\u2000-\u200D\u202F\u205F\u3000\uFEFF]/gu;
const DELETE_BLOCK_CONCURRENCY = 6;

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

function removeSpaceLikeChars(value: string): { next: string; removedCount: number } {
  let removedCount = 0;
  const next = (value || "").replace(INLINE_SPACE_LIKE_PATTERN, () => {
    removedCount += 1;
    return "";
  });
  return { next, removedCount };
}

function findBlockElementById(root: HTMLElement, blockId: string): HTMLElement | null {
  const nodes = root.querySelectorAll<HTMLElement>("[data-node-id]");
  for (const node of nodes) {
    const id = node.dataset.nodeId || node.getAttribute("data-node-id") || "";
    if (id === blockId) {
      return node;
    }
  }
  return null;
}

function resolveRangeBoundaryBlockId(root: HTMLElement, container: Node): string {
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

function removeSpaceLikeCharsInTextNodes(root: HTMLElement): number {
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

function convertPunctuationInTextNodes(root: HTMLElement, mode: PunctuationToggleMode): number {
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

function summarizeStyleFailures(failures: StyleFailureDetail[]): string {
  if (!failures.length) {
    return "";
  }
  return failures
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
}

function applySelectedBlocksSpacingCleanupFromDom(
  protyle: ProtyleLike | undefined,
  selectedIds: string[]
): { cleanedBlockCount: number; removedCount: number } | null {
  const root = protyle?.wysiwyg?.element as HTMLElement | undefined;
  if (!root || !selectedIds.length) {
    return null;
  }

  const blockElements: HTMLElement[] = [];
  for (const id of selectedIds) {
    const block = findBlockElementById(root, id);
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
    const removedInBlock = removeSpaceLikeCharsInTextNodes(editable);
    if (removedInBlock > 0) {
      cleanedBlockCount += 1;
      removedCount += removedInBlock;
      editable.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  return { cleanedBlockCount, removedCount };
}

function applyPartialSelectionSpacingCleanup(
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
  const startBlockId = resolveRangeBoundaryBlockId(root, range.startContainer);
  const endBlockId = resolveRangeBoundaryBlockId(root, range.endContainer);
  if (!startBlockId || !endBlockId || startBlockId !== endBlockId) {
    return { handled: false, removedCount: 0 };
  }

  const blockElement = findBlockElementById(root, startBlockId);
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

function applySelectedBlocksPunctuationToggleFromDom(
  protyle: ProtyleLike | undefined,
  selectedIds: string[]
): { changedBlockCount: number; changedCount: number } | null {
  const root = protyle?.wysiwyg?.element as HTMLElement | undefined;
  if (!root || !selectedIds.length) {
    return null;
  }

  const blockElements: HTMLElement[] = [];
  for (const id of selectedIds) {
    const block = findBlockElementById(root, id);
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
    const changedInBlock = convertPunctuationInTextNodes(editable, mode);
    if (changedInBlock > 0) {
      changedBlockCount += 1;
      changedCount += changedInBlock;
      editable.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  return { changedBlockCount, changedCount };
}

function applyPartialSelectionPunctuationToggle(
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
  const startBlockId = resolveRangeBoundaryBlockId(root, range.startContainer);
  const endBlockId = resolveRangeBoundaryBlockId(root, range.endContainer);
  if (!startBlockId || !endBlockId || startBlockId !== endBlockId) {
    return { handled: false, changedCount: 0 };
  }

  const blockElement = findBlockElementById(root, startBlockId);
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

export function createSelectionActionHandlers(
  deps: CreateSelectionActionHandlersDeps
): PartialActionHandlerMap {
  const handleStyleSelectedBlocks = async (
    docId: string,
    protyle: ProtyleLike | undefined,
    style: BlockStyle
  ) => {
    const selectedIds = getSelectedBlockIds(protyle);
    if (!selectedIds.length) {
      showMessage("未选中任何块，请先选中块", 5000, "info");
      return;
    }

    const kramdowns = await getBlockKramdowns(selectedIds);
    const kramdownMap = new Map(kramdowns.map((item) => [item.id, item.kramdown || ""]));

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
      const ok = await deps.askConfirmWithVisibleDialog("确认批量样式处理", confirmLines.join("\n"));
      if (!ok) {
        return;
      }
      deps.setBusy?.(true);
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
      const sample = summarizeStyleFailures(failures);
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
  };

  const handleRemoveSelectedSpacing = async (_docId: string, protyle?: ProtyleLike) => {
    const explicitSelectedIds = getExplicitlySelectedBlockIds(protyle);
    if (!explicitSelectedIds.length) {
      const partialResult = applyPartialSelectionSpacingCleanup(protyle);
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
      const selectedBlockResult = applySelectedBlocksSpacingCleanupFromDom(protyle, explicitSelectedIds);
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
  };

  const handleToggleSelectedPunctuation = async (_docId: string, protyle?: ProtyleLike) => {
    const explicitSelectedIds = getExplicitlySelectedBlockIds(protyle);
    if (!explicitSelectedIds.length) {
      const partialResult = applyPartialSelectionPunctuationToggle(protyle);
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
      const selectedBlockResult = applySelectedBlocksPunctuationToggleFromDom(protyle, explicitSelectedIds);
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
  };

  const handleToggleLinebreaksParagraphs = async (docId: string, protyle?: ProtyleLike) => {
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
      const ok = await deps.askConfirmWithVisibleDialog("确认执行换行-分段互转", confirmLines.join("\n"));
      if (!ok) {
        return;
      }
      deps.setBusy?.(true);

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
    const ok = await deps.askConfirmWithVisibleDialog("确认执行换行-分段互转", confirmLines.join("\n"));
    if (!ok) {
      return;
    }
    deps.setBusy?.(true);

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
  };

  const handleMergeSelectedListBlocks = async (docId: string, protyle?: ProtyleLike) => {
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

    const ok = await deps.askConfirmWithVisibleDialog("确认合并列表块", confirmLines.join("\n"));
    if (!ok) {
      return;
    }
    deps.setBusy?.(true);

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
  };

  return {
    "bold-selected-blocks": async (docId, protyle) =>
      handleStyleSelectedBlocks(docId, protyle, "bold"),
    "highlight-selected-blocks": async (docId, protyle) =>
      handleStyleSelectedBlocks(docId, protyle, "highlight"),
    "remove-selected-spacing": handleRemoveSelectedSpacing,
    "toggle-selected-punctuation": handleToggleSelectedPunctuation,
    "toggle-linebreaks-paragraphs": handleToggleLinebreaksParagraphs,
    "merge-selected-list-blocks": handleMergeSelectedListBlocks,
  };
}
