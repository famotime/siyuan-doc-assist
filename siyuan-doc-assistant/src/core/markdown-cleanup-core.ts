type CleanupResult = {
  markdown: string;
  removedLines: number;
};

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

function isBlankLine(line: string): boolean {
  if (!line) {
    return true;
  }
  const normalized = line
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;|&#xA0;/gi, "")
    .replace(/[\p{Cf}\p{Z}]/gu, "")
    .replace(/\s+/g, "");
  return normalized.length === 0;
}

function isBlankParagraph(block: ParagraphBlockMeta): boolean {
  if (block.type !== "p") {
    return false;
  }
  if (block.resolved === false) {
    return false;
  }
  return isBlankLine(block.content || "") && isBlankLine(block.markdown || "");
}

function isFenceLine(line: string): { marker: string; length: number } | null {
  const match = line.match(/^\s*(`{3,}|~{3,})/);
  if (!match) {
    return null;
  }
  return { marker: match[1], length: match[1].length };
}

export function removeExtraBlankLinesFromMarkdown(markdown: string): CleanupResult {
  if (!markdown) {
    return { markdown: "", removedLines: 0 };
  }

  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  let removedLines = 0;
  let inFence = false;
  let fenceChar = "";
  let fenceLen = 0;
  let previousBlank = false;

  for (const line of lines) {
    const fence = isFenceLine(line);
    if (fence) {
      const markerChar = fence.marker[0];
      if (!inFence) {
        inFence = true;
        fenceChar = markerChar;
        fenceLen = fence.length;
      } else if (markerChar === fenceChar && fence.length >= fenceLen) {
        inFence = false;
        fenceChar = "";
        fenceLen = 0;
      }
      output.push(line);
      previousBlank = false;
      continue;
    }

    if (inFence) {
      output.push(line);
      continue;
    }

    const isBlank = isBlankLine(line);
    if (isBlank) {
      if (previousBlank) {
        removedLines += 1;
        continue;
      }
      output.push("");
      previousBlank = true;
      continue;
    }

    output.push(line);
    previousBlank = false;
  }

  return { markdown: output.join("\n"), removedLines };
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

  console.info("[DocAssistant][BlankLines] blank paragraphs", {
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
