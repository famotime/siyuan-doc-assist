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
