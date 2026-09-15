import { createDocAssistantLogger } from "@/core/logger-core";
import { isBlankLine } from "@/core/markdown-cleanup-text-core";

export type ParagraphBlockMeta = {
  id: string;
  type: string;
  content?: string;
  markdown?: string;
  resolved?: boolean;
};

export type BlankParagraphCleanupResult = {
  deleteIds: string[];
  keptBlankIds: string[];
  removedCount: number;
};

export type HeadingBlankParagraphInsertResult = {
  insertBeforeIds: string[];
  insertCount: number;
};

export type DeleteFromCurrentBlockResult = {
  deleteIds: string[];
  deleteCount: number;
};

export type SelectBlockRangeResult = {
  selectedIds: string[];
  selectedCount: number;
};

export type ClippedListContinuationMerge = {
  markerBlockId: string;
  contentBlockId: string;
  mergedMarkdown: string;
};

export type ClippedListContinuationMergeResult = {
  merges: ClippedListContinuationMerge[];
  mergeCount: number;
};

const blankLinesLogger = createDocAssistantLogger("BlankLines");
const deleteFromCurrentLogger = createDocAssistantLogger("DeleteFromCurrent");
const clippedListLogger = createDocAssistantLogger("ClippedList");
const CLIPPED_BULLET_MARKERS = new Set([
  "•",
  "·",
  "○",
  "◦",
  "▪",
  "▸",
  "➢",
  "➤",
  "►",
  "◆",
  "◇",
  "✓",
  "✔",
  "★",
  "☆",
  "→",
  "⁃",
  "‣",
  "⦿",
  "⦾",
  "◉",
  "●",
]);

function isParagraphLikeBlock(block: ParagraphBlockMeta): boolean {
  const normalized = (block.type || "").trim().toLowerCase();
  return normalized === "p" || normalized === "paragraph" || normalized === "nodeparagraph";
}

function isBlankParagraph(block: ParagraphBlockMeta): boolean {
  if (!isParagraphLikeBlock(block)) {
    return false;
  }
  if (block.resolved === false) {
    return false;
  }
  return isBlankLine(block.content || "") && isBlankLine(block.markdown || "");
}

function isHeadingBlock(block: ParagraphBlockMeta): boolean {
  if (block.type === "h") {
    return true;
  }
  const markdown = (block.markdown || "").trimStart();
  return /^#{1,6}\s+\S/.test(markdown);
}

export function findExtraBlankParagraphIds(
  blocks: ParagraphBlockMeta[]
): BlankParagraphCleanupResult {
  const deleteIds: string[] = [];
  const keptBlankIds: string[] = [];

  for (const block of blocks) {
    const blank = isBlankParagraph(block);
    if (blank) {
      deleteIds.push(block.id);
      continue;
    }
  }

  blankLinesLogger.debug("blank paragraphs", {
    totalBlocks: blocks.length,
    blankCount: deleteIds.length,
    sample: deleteIds.slice(0, 8),
  });

  return {
    deleteIds,
    keptBlankIds,
    removedCount: deleteIds.length,
  };
}

export function findHeadingMissingBlankParagraphBeforeIds(
  blocks: ParagraphBlockMeta[]
): HeadingBlankParagraphInsertResult {
  const insertBeforeIds: string[] = [];

  for (let i = 0; i < blocks.length; i += 1) {
    const current = blocks[i];
    if (!isHeadingBlock(current)) {
      continue;
    }
    if (i === 0) {
      continue;
    }
    const previous = i > 0 ? blocks[i - 1] : undefined;
    if (previous && isBlankParagraph(previous)) {
      continue;
    }
    insertBeforeIds.push(current.id);
  }

  blankLinesLogger.debug("headings missing blank paragraph", {
    totalBlocks: blocks.length,
    headingCount: blocks.filter((block) => isHeadingBlock(block)).length,
    insertCount: insertBeforeIds.length,
    sample: insertBeforeIds.slice(0, 8),
  });

  return {
    insertBeforeIds,
    insertCount: insertBeforeIds.length,
  };
}

export function findDeleteFromCurrentBlockIds(
  blocks: ParagraphBlockMeta[],
  currentBlockId: string
): DeleteFromCurrentBlockResult {
  if (!currentBlockId) {
    return { deleteIds: [], deleteCount: 0 };
  }

  const startIndex = blocks.findIndex((block) => block.id === currentBlockId);
  if (startIndex < 0) {
    return { deleteIds: [], deleteCount: 0 };
  }

  const deleteIds = blocks.slice(startIndex).map((block) => block.id);
  deleteFromCurrentLogger.debug("matched blocks", {
    totalBlocks: blocks.length,
    currentBlockId,
    startIndex,
    deleteCount: deleteIds.length,
    sample: deleteIds.slice(0, 8),
  });
  return {
    deleteIds,
    deleteCount: deleteIds.length,
  };
}

const OPENING_SEPARATOR_WINDOW = 10;
const SEPARATOR_MARKDOWN = "---";

export function findDeleteFromStartToCurrentBlockIds(
  blocks: Pick<ParagraphBlockMeta, "id" | "markdown">[],
  currentBlockId: string
): DeleteFromCurrentBlockResult {
  if (!currentBlockId) {
    return { deleteIds: [], deleteCount: 0 };
  }

  const currentIndex = blocks.findIndex((block) => block.id === currentBlockId);
  if (currentIndex < 0) {
    return { deleteIds: [], deleteCount: 0 };
  }

  const windowBlocks = blocks.slice(0, OPENING_SEPARATOR_WINDOW);
  let separatorIndex = -1;
  for (let i = windowBlocks.length - 1; i >= 0; i -= 1) {
    if ((windowBlocks[i].markdown || "").trim() === SEPARATOR_MARKDOWN) {
      separatorIndex = i;
      break;
    }
  }

  const deleteStart = separatorIndex >= 0 ? separatorIndex + 1 : 0;
  if (deleteStart > currentIndex) {
    return { deleteIds: [], deleteCount: 0 };
  }

  const deleteIds = blocks.slice(deleteStart, currentIndex + 1).map((b) => b.id);
  deleteFromCurrentLogger.debug("findDeleteFromStartToCurrentBlockIds", {
    totalBlocks: blocks.length,
    currentBlockId,
    currentIndex,
    separatorIndex,
    deleteStart,
    deleteCount: deleteIds.length,
    sample: deleteIds.slice(0, 8),
  });
  return {
    deleteIds,
    deleteCount: deleteIds.length,
  };
}

export function findSelectFromStartToCurrentBlockIds(
  blocks: Pick<ParagraphBlockMeta, "id">[],
  currentBlockId: string
): SelectBlockRangeResult {
  if (!currentBlockId) {
    return { selectedIds: [], selectedCount: 0 };
  }

  const currentIndex = blocks.findIndex((block) => block.id === currentBlockId);
  if (currentIndex < 0) {
    return { selectedIds: [], selectedCount: 0 };
  }

  const selectedIds = blocks.slice(0, currentIndex + 1).map((block) => block.id);
  return {
    selectedIds,
    selectedCount: selectedIds.length,
  };
}

export function findSelectFromCurrentToEndBlockIds(
  blocks: Pick<ParagraphBlockMeta, "id">[],
  currentBlockId: string
): SelectBlockRangeResult {
  if (!currentBlockId) {
    return { selectedIds: [], selectedCount: 0 };
  }

  const startIndex = blocks.findIndex((block) => block.id === currentBlockId);
  if (startIndex < 0) {
    return { selectedIds: [], selectedCount: 0 };
  }

  const selectedIds = blocks.slice(startIndex).map((block) => block.id);
  return {
    selectedIds,
    selectedCount: selectedIds.length,
  };
}

function parseClippedListMarker(markdown: string): string | null {
  const normalized = (markdown || "").replace(/\r\n/g, "\n").trim();
  if (!normalized || normalized.includes("\n")) {
    return null;
  }
  if (CLIPPED_BULLET_MARKERS.has(normalized)) {
    return "-";
  }
  const unorderedMatch = normalized.match(/^([-*+])$/);
  if (unorderedMatch) {
    return unorderedMatch[1];
  }
  const orderedMatch = normalized.match(/^(\d+[.)])$/);
  if (orderedMatch) {
    return orderedMatch[1];
  }
  return null;
}

export function findClippedListContinuationMerges(
  blocks: ParagraphBlockMeta[]
): ClippedListContinuationMergeResult {
  const merges: ClippedListContinuationMerge[] = [];
  const consumedContentIds = new Set<string>();

  for (let i = 0; i < blocks.length - 1; i += 1) {
    const current = blocks[i];
    const next = blocks[i + 1];
    if (!isParagraphLikeBlock(next)) {
      continue;
    }
    if (current.resolved === false || next.resolved === false) {
      continue;
    }
    if (consumedContentIds.has(current.id) || consumedContentIds.has(next.id)) {
      continue;
    }

    const marker = parseClippedListMarker(current.markdown || current.content || "");
    if (!marker) {
      continue;
    }

    const nextMarkdown = (next.markdown || "").replace(/\r\n/g, "\n").trim();
    if (!nextMarkdown || nextMarkdown.includes("\n")) {
      continue;
    }

    merges.push({
      markerBlockId: current.id,
      contentBlockId: next.id,
      mergedMarkdown: `${marker} ${nextMarkdown}`,
    });
    consumedContentIds.add(next.id);
  }

  clippedListLogger.debug("continuation merges", {
    totalBlocks: blocks.length,
    mergeCount: merges.length,
    sample: merges.slice(0, 8),
  });

  return {
    merges,
    mergeCount: merges.length,
  };
}

export type ClippedBlockquoteMerge = {
  targetBlockId: string;
  mergedMarkdown: string;
  deleteBlockIds: string[];
};

export type ClippedBlockquoteMergeResult = {
  merges: ClippedBlockquoteMerge[];
  mergeCount: number;
  deleteBlockIds: string[];
};

export type EmptyCodeBlockCleanupResult = {
  deleteIds: string[];
  removedCount: number;
};

export function isBlockquoteBlockType(type: string): boolean {
  const normalized = (type || "").trim().toLowerCase();
  return (
    normalized === "b" ||
    normalized === "blockquote" ||
    normalized === "nodeblockquote"
  );
}

export function isBlockquoteBlock(block: ParagraphBlockMeta): boolean {
  if (block.resolved === false) {
    return false;
  }
  if (isBlockquoteBlockType(block.type)) {
    return true;
  }
  const markdown = (block.markdown || "").trimStart();
  return /^\s*>/.test(markdown);
}

function extractQuoteLines(markdown: string): string[] {
  const lines = (markdown || "").replace(/\r\n/g, "\n").split("\n");
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      result.push(">");
    } else if (trimmed.startsWith(">")) {
      result.push(trimmed);
    } else {
      result.push(`> ${trimmed}`);
    }
  }
  while (result.length > 0 && result[0] === ">") {
    result.shift();
  }
  while (result.length > 0 && result[result.length - 1] === ">") {
    result.pop();
  }
  return result;
}

export function findConsecutiveBlockquoteMerges(
  blocks: ParagraphBlockMeta[]
): ClippedBlockquoteMergeResult {
  const merges: ClippedBlockquoteMerge[] = [];
  const allDeleteBlockIds: string[] = [];

  let i = 0;
  while (i < blocks.length) {
    const current = blocks[i];
    if (!isBlockquoteBlock(current)) {
      i += 1;
      continue;
    }

    const groupQuoteBlocks: ParagraphBlockMeta[] = [current];
    const groupBlankBlocksBeforeLastQuote: ParagraphBlockMeta[] = [];
    let pendingBlanks: ParagraphBlockMeta[] = [];

    let j = i + 1;
    while (j < blocks.length) {
      const next = blocks[j];
      if (next.resolved === false) {
        break;
      }
      if (isBlockquoteBlock(next)) {
        groupBlankBlocksBeforeLastQuote.push(...pendingBlanks);
        pendingBlanks = [];
        groupQuoteBlocks.push(next);
        j += 1;
      } else if (isBlankParagraph(next) || (/^\s*$/.test(next.markdown || "") && !isBlockquoteBlockType(next.type))) {
        pendingBlanks.push(next);
        j += 1;
      } else {
        break;
      }
    }

    if (groupQuoteBlocks.length >= 2) {
      const targetBlock = groupQuoteBlocks[0];
      const deleteQuoteIds = groupQuoteBlocks.slice(1).map((b) => b.id);
      const deleteBlankIds = groupBlankBlocksBeforeLastQuote.map((b) => b.id);
      const deleteIds = [...deleteBlankIds, ...deleteQuoteIds];

      const mergedLines: string[] = [];
      for (let k = 0; k < groupQuoteBlocks.length; k += 1) {
        const qLines = extractQuoteLines(groupQuoteBlocks[k].markdown || groupQuoteBlocks[k].content || "");
        if (qLines.length > 0) {
          if (mergedLines.length > 0) {
            mergedLines.push(">");
          }
          mergedLines.push(...qLines);
        }
      }

      const mergedMarkdown = mergedLines.join("\n");
      merges.push({
        targetBlockId: targetBlock.id,
        mergedMarkdown,
        deleteBlockIds: deleteIds,
      });
      allDeleteBlockIds.push(...deleteIds);
    }

    i = j;
  }

  clippedListLogger.debug("blockquote merges", {
    totalBlocks: blocks.length,
    mergeCount: merges.length,
    deleteCount: allDeleteBlockIds.length,
    sample: merges.slice(0, 8),
  });

  return {
    merges,
    mergeCount: merges.length,
    deleteBlockIds: allDeleteBlockIds,
  };
}

export function isCodeBlockType(type: string): boolean {
  const normalized = (type || "").trim().toLowerCase();
  return (
    normalized === "c" ||
    normalized === "code" ||
    normalized === "codeblock" ||
    normalized === "nodecodeblock"
  );
}

export function isEmptyCodeBlock(block: ParagraphBlockMeta): boolean {
  if (block.resolved === false) {
    return false;
  }
  const type = (block.type || "").trim().toLowerCase();
  const markdown = (block.markdown || "").trim();
  const content = (block.content || "").trim();

  const isCodeType = isCodeBlockType(type);

  if (isCodeType) {
    if (!content && (!markdown || markdown === "```" || /^```\w*\s*\n?\s*```$/.test(markdown))) {
      return true;
    }
    const fencedMatch = markdown.match(/^```[^\n]*\n?([\s\S]*?)\n?```$/);
    if (fencedMatch) {
      const codeInside = fencedMatch[1];
      if (!codeInside.trim()) {
        return true;
      }
    } else if (!markdown && !content) {
      return true;
    }
    return false;
  }

  if (/^```[^\n]*\n?\s*```$/.test(markdown)) {
    return true;
  }

  return false;
}

export function findEmptyCodeBlockIds(
  blocks: ParagraphBlockMeta[]
): EmptyCodeBlockCleanupResult {
  const deleteIds: string[] = [];

  for (const block of blocks) {
    if (isEmptyCodeBlock(block)) {
      deleteIds.push(block.id);
    }
  }

  return {
    deleteIds,
    removedCount: deleteIds.length,
  };
}

