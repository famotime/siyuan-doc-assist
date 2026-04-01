export type ListBlockMergeBlock = {
  id: string;
  type: string;
  markdown: string;
};

export type MergeSelectedListBlocksPreview = {
  selectedBlockCount: number;
  supportedBlockCount: number;
  skippedBlockCount: number;
  paragraphBlockCount: number;
  listLikeBlockCount: number;
  resultItemCount: number;
  updateBlockId: string;
  mergedMarkdown: string;
  deleteBlockIds: string[];
  hasChanges: boolean;
};

const ATTR_LINE_REGEX = /^\s*\{:\s*[^}]+\}\s*$/;
const LIST_MARKER_REGEX = /^(\s*)([-+*]|\d+\.)\s+(.+)$/;

export function isOrderedListBlock(markdown: string): boolean {
  const lines = cleanupMarkdownLines(markdown);
  for (const line of lines) {
    if (line.trim()) {
      return /^\s*\d+\.\s/.test(line);
    }
  }
  return false;
}

function normalizeLineEndings(value: string): string {
  return (value || "").replace(/\r\n/g, "\n");
}

export function isListBlockType(type: string): boolean {
  const normalized = (type || "").trim().toLowerCase();
  return normalized === "l" || normalized === "list" || normalized === "nodelist";
}

export function isListItemBlockType(type: string): boolean {
  const normalized = (type || "").trim().toLowerCase();
  return normalized === "i" || normalized === "listitem" || normalized === "nodelistitem";
}

export function isParagraphBlockType(type: string): boolean {
  const normalized = (type || "").trim().toLowerCase();
  return normalized === "p" || normalized === "paragraph" || normalized === "nodeparagraph";
}

export function isListMergeSupportedBlockType(type: string): boolean {
  return isParagraphBlockType(type) || isListBlockType(type) || isListItemBlockType(type);
}

function cleanupMarkdownLines(markdown: string): string[] {
  return normalizeLineEndings(markdown)
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line) => !ATTR_LINE_REGEX.test(line));
}

function formatListItem(firstLine: string, continuationLines: string[], marker: string): string {
  const first = (firstLine || "").trim();
  if (!first) {
    return "";
  }
  const indentSpace = " ".repeat(marker.length);
  const continuation = continuationLines
    .map((line) => (line || "").trim())
    .filter(Boolean)
    .map((line) => `${indentSpace}${line}`)
    .join("\n");
  return continuation ? `${marker}${first}\n${continuation}` : `${marker}${first}`;
}

function convertPlainBlockToListItem(markdown: string, isOrdered: boolean, state: { index: number }): string[] {
  const lines = cleanupMarkdownLines(markdown).filter((line) => line.trim());
  if (!lines.length) {
    return [];
  }
  const first = lines[0] || "";
  const rest = lines.slice(1);
  const marker = isOrdered ? `${state.index++}. ` : "- ";
  const item = formatListItem(first, rest, marker);
  return item ? [item] : [];
}

function normalizeListLikeBlock(markdown: string, isOrdered: boolean, state: { index: number }): string[] {
  const lines = cleanupMarkdownLines(markdown);
  return lines
    .filter((line) => line.trim())
    .map((line) => {
      const match = line.match(LIST_MARKER_REGEX);
      if (!match) {
        return line;
      }
      const indent = match[1] || "";
      const originalMarker = match[2] || "-";
      const content = (match[3] || "").trim();
      let emitMarker = "";
      if (!indent) {
        emitMarker = isOrdered ? `${state.index++}. ` : "- ";
      } else {
        emitMarker = `${originalMarker} `;
      }
      return content ? `${indent}${emitMarker}${content}` : "";
    })
    .filter(Boolean);
}

function blockToListLines(block: ListBlockMergeBlock, isOrdered: boolean, state: { index: number }): string[] {
  if (isListBlockType(block.type) || isListItemBlockType(block.type)) {
    return normalizeListLikeBlock(block.markdown || "", isOrdered, state);
  }
  return convertPlainBlockToListItem(block.markdown || "", isOrdered, state);
}

function countListItems(lines: string[]): number {
  return lines
    .flatMap((line) => normalizeLineEndings(line).split("\n"))
    .filter((line) => LIST_MARKER_REGEX.test(line))
    .length;
}

export function buildMergeSelectedListBlocksPreview(
  blocks: ListBlockMergeBlock[]
): MergeSelectedListBlocksPreview {
  const selectedBlockCount = blocks.length;
  const supportedBlocks = blocks.filter((block) => isListMergeSupportedBlockType(block.type));

  let isOrdered = false;
  for (const block of supportedBlocks) {
    if (isListBlockType(block.type) || isListItemBlockType(block.type)) {
      if (isOrderedListBlock(block.markdown || "")) {
        isOrdered = true;
      }
      break;
    }
  }

  const state = { index: 1 };
  const mergedLines = supportedBlocks.flatMap((block) => blockToListLines(block, isOrdered, state));
  const updateBlockId = supportedBlocks[0]?.id || "";
  const mergedMarkdown = mergedLines.join("\n");
  const deleteBlockIds = supportedBlocks.slice(1).map((block) => block.id);
  const firstMarkdown = normalizeLineEndings(supportedBlocks[0]?.markdown || "").trim();
  const hasChanges = !!updateBlockId && (!!deleteBlockIds.length || mergedMarkdown !== firstMarkdown);

  return {
    selectedBlockCount,
    supportedBlockCount: supportedBlocks.length,
    skippedBlockCount: selectedBlockCount - supportedBlocks.length,
    paragraphBlockCount: supportedBlocks.filter((block) => isParagraphBlockType(block.type)).length,
    listLikeBlockCount: supportedBlocks.filter(
      (block) => isListBlockType(block.type) || isListItemBlockType(block.type)
    ).length,
    resultItemCount: countListItems(mergedLines),
    updateBlockId,
    mergedMarkdown,
    deleteBlockIds,
    hasChanges,
  };
}
