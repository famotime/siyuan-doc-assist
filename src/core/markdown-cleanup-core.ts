type CleanupResult = {
  markdown: string;
  removedLines: number;
};

export type TrailingWhitespaceCleanupResult = {
  markdown: string;
  changedLines: number;
  removedChars: number;
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

export type HeadingBlankParagraphInsertResult = {
  insertBeforeIds: string[];
  insertCount: number;
};

export type DeleteFromCurrentBlockResult = {
  deleteIds: string[];
  deleteCount: number;
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

function isHeadingBlock(block: ParagraphBlockMeta): boolean {
  if (block.type === "h") {
    return true;
  }
  const markdown = (block.markdown || "").trimStart();
  return /^#{1,6}\s+\S/.test(markdown);
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

export function removeTrailingWhitespaceFromMarkdown(
  markdown: string
): TrailingWhitespaceCleanupResult {
  if (!markdown) {
    return {
      markdown: "",
      changedLines: 0,
      removedChars: 0,
    };
  }

  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  let changedLines = 0;
  let removedChars = 0;
  const trailingWhitespaceSpanIalPattern =
    /<span\b[^>\n]*\bstyle=(["'])[^"'\n]*white-space\s*:\s*pre\b[^"'\n]*\1[^>\n]*>((?:[^\S\r\n]|\\t|\\u0009|\\x09)*)<\/span>\s*\{:[^}\n]*white-space\s*:\s*pre\b[^}\n]*\}(?=(?:[^\S\r\n]*\{:[^}\n]*\})*[^\S\r\n]*$)/giu;
  const trailingWhitespaceIalPattern =
    /((?:[^\S\r\n]|\\t|\\u0009|\\x09)*)\{:[^}\n]*white-space\s*:\s*pre\b[^}\n]*\}(?=(?:[^\S\r\n]*\{:[^}\n]*\})*[^\S\r\n]*$)/giu;
  const trailingHorizontalWhitespacePattern = /[^\S\r\n]+$/u;
  const decodeEscapedWhitespaceLength = (value: string): number => {
    if (!value) {
      return 0;
    }
    let rest = value;
    let decoded = 0;
    const escapedPatterns = [/\\u0009/gi, /\\x09/gi, /\\t/g];
    for (const pattern of escapedPatterns) {
      const matches = rest.match(pattern);
      if (!matches?.length) {
        continue;
      }
      decoded += matches.length;
      rest = rest.replace(pattern, "");
    }
    decoded += rest.length;
    return decoded;
  };

  for (const line of lines) {
    let nextLine = line;
    let removedInLine = 0;

    // Some kernels serialize trailing whitespace as:
    // <span data-type="text" style="white-space:pre">...</span>{: style="white-space:pre"}
    // Remove the full span+IAL segment at line end.
    let removedSpanIal = false;
    do {
      removedSpanIal = false;
      nextLine = nextLine.replace(
        trailingWhitespaceSpanIalPattern,
        (_match, _quote: string, ws: string) => {
          removedInLine += decodeEscapedWhitespaceLength(ws || "");
          removedSpanIal = true;
          return "";
        }
      );
    } while (removedSpanIal);

    const beforeInlineIal = nextLine;
    nextLine = nextLine.replace(
      trailingWhitespaceIalPattern,
      (_match, ws: string) => {
        removedInLine += decodeEscapedWhitespaceLength(ws || "");
        return "";
      }
    );
    if (nextLine !== beforeInlineIal) {
      // Multiple trailing spans can be represented as adjacent IAL segments.
      // Run once more to ensure any newly-adjacent matches are removed.
      nextLine = nextLine.replace(
        trailingWhitespaceIalPattern,
        (_match, ws: string) => {
          removedInLine += decodeEscapedWhitespaceLength(ws || "");
          return "";
        }
      );
    }

    const tailMatch = nextLine.match(trailingHorizontalWhitespacePattern);
    if (tailMatch) {
      nextLine = nextLine.slice(0, nextLine.length - tailMatch[0].length);
      removedInLine += tailMatch[0].length;
    }

    output.push(nextLine);
    if (nextLine !== line) {
      changedLines += 1;
      removedChars += removedInLine;
    }
  }

  return {
    markdown: output.join("\n"),
    changedLines,
    removedChars,
  };
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

  console.info("[DocAssistant][BlankLines] headings missing blank paragraph", {
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
  console.info("[DocAssistant][DeleteFromCurrent] matched blocks", {
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
