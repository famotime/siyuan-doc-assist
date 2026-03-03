import { createDocAssistantLogger } from "@/core/logger-core";

type CleanupResult = {
  markdown: string;
  removedLines: number;
};

export type TrailingWhitespaceCleanupResult = {
  markdown: string;
  changedLines: number;
  removedChars: number;
};

export type TrailingWhitespaceDomCleanupResult = {
  dom: string;
  changedLines: number;
  removedChars: number;
};

export type AiOutputCleanupResult = {
  markdown: string;
  removedSupCount: number;
  removedCaretCount: number;
  removedInternetLinkCount: number;
  removedCount: number;
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

const blankLinesLogger = createDocAssistantLogger("BlankLines");
const deleteFromCurrentLogger = createDocAssistantLogger("DeleteFromCurrent");

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

function decodeHtmlWhitespaceLength(value: string): number {
  if (!value) {
    return 0;
  }
  const entityPattern = /&nbsp;|&#160;|&#xA0;/giu;
  const entityMatches = value.match(entityPattern);
  const entityCount = entityMatches?.length || 0;
  const plain = value.replace(entityPattern, "");
  return entityCount + plain.length;
}

function stripTrailingInternetLinksInLine(
  line: string
): { line: string; removedCount: number } {
  if (!line) {
    return { line: "", removedCount: 0 };
  }

  const markdownLinkPattern =
    /[ \t]*\[[^\]\n]*\]\((https?:\/\/[^)\s]+(?:\s+["'][^"'\n]*["'])?)\)[ \t]*$/iu;
  const autolinkPattern = /[ \t]*<https?:\/\/[^>\s]+>[ \t]*$/iu;
  const bareLinkPattern = /[ \t]*https?:\/\/[^\s<>()]+[ \t]*$/iu;
  const patterns = [markdownLinkPattern, autolinkPattern, bareLinkPattern];

  let next = line;
  let removedCount = 0;
  let removed = false;
  do {
    removed = false;
    for (const pattern of patterns) {
      const match = pattern.exec(next);
      if (!match || match.index < 0) {
        continue;
      }
      next = next.slice(0, match.index);
      removedCount += 1;
      removed = true;
      break;
    }
  } while (removed);

  return {
    line: next,
    removedCount,
  };
}

function cleanupAiOutputLine(line: string): AiOutputCleanupResult {
  const supPattern = /[ \t]*<sup\b[^>\n]*>[\s\S]*?<\/sup>/giu;
  const caretPattern = /[ \t]*\^\^[ \t]*/g;

  let removedSupCount = 0;
  let removedCaretCount = 0;
  const removedSup = line.replace(supPattern, () => {
    removedSupCount += 1;
    return "";
  });
  const removedCaret = removedSup.replace(caretPattern, () => {
    removedCaretCount += 1;
    return "";
  });

  const tableSuffixMatch = removedCaret.match(/^([\s\S]*?)(\s*\|\s*)$/u);
  let removedInternetLinkCount = 0;
  let nextLine = removedCaret;
  if (tableSuffixMatch) {
    const tableBody = tableSuffixMatch[1] || "";
    const tableSuffix = tableSuffixMatch[2] || "";
    const stripped = stripTrailingInternetLinksInLine(tableBody);
    nextLine = `${stripped.line}${tableSuffix}`;
    removedInternetLinkCount += stripped.removedCount;
  } else {
    const stripped = stripTrailingInternetLinksInLine(removedCaret);
    nextLine = stripped.line;
    removedInternetLinkCount += stripped.removedCount;
  }

  const removedCount = removedSupCount + removedCaretCount + removedInternetLinkCount;
  return {
    markdown: nextLine,
    removedSupCount,
    removedCaretCount,
    removedInternetLinkCount,
    removedCount,
  };
}

export function cleanupAiOutputArtifactsInMarkdown(markdown: string): AiOutputCleanupResult {
  const source = markdown || "";
  if (!source) {
    return {
      markdown: "",
      removedSupCount: 0,
      removedCaretCount: 0,
      removedInternetLinkCount: 0,
      removedCount: 0,
    };
  }

  const lines = source.split(/\r?\n/);
  const output: string[] = [];
  let removedSupCount = 0;
  let removedCaretCount = 0;
  let removedInternetLinkCount = 0;

  for (const line of lines) {
    const cleaned = cleanupAiOutputLine(line);
    output.push(cleaned.markdown);
    removedSupCount += cleaned.removedSupCount;
    removedCaretCount += cleaned.removedCaretCount;
    removedInternetLinkCount += cleaned.removedInternetLinkCount;
  }

  const removedCount = removedSupCount + removedCaretCount + removedInternetLinkCount;
  return {
    markdown: output.join("\n"),
    removedSupCount,
    removedCaretCount,
    removedInternetLinkCount,
    removedCount,
  };
}

export function removeTrailingWhitespaceFromDom(dom: string): TrailingWhitespaceDomCleanupResult {
  if (!dom) {
    return {
      dom: "",
      changedLines: 0,
      removedChars: 0,
    };
  }

  const editablePattern = /(<div\b[^>]*\bcontenteditable=(["'])true\2[^>]*>)([\s\S]*?)(<\/div>)/iu;
  const editableMatch = editablePattern.exec(dom);
  if (!editableMatch || editableMatch.index < 0) {
    return {
      dom,
      changedLines: 0,
      removedChars: 0,
    };
  }

  const openTag = editableMatch[1];
  const innerHtml = editableMatch[3] || "";
  const closeTag = editableMatch[4];
  let nextInner = innerHtml;
  let removedChars = 0;
  const trailingWhitespaceTokenPattern = /(?:[^\S\r\n]|&nbsp;|&#160;|&#xA0;)+$/iu;
  const trailingPreSpanPattern =
    /<span\b[^>\n]*\bstyle=(["'])[^"'\n]*white-space\s*:\s*pre\b[^"'\n]*\1[^>\n]*>((?:[^\S\r\n]|&nbsp;|&#160;|&#xA0;)*)<\/span>((?:[^\S\r\n]|&nbsp;|&#160;|&#xA0;)*)$/iu;

  let removedSpan = false;
  do {
    removedSpan = false;
    nextInner = nextInner.replace(
      trailingPreSpanPattern,
      (_match, _quote: string, spanWs: string, tailWs: string) => {
        removedChars += decodeHtmlWhitespaceLength(spanWs || "");
        removedChars += decodeHtmlWhitespaceLength(tailWs || "");
        removedSpan = true;
        return "";
      }
    );
  } while (removedSpan);

  const tailMatch = nextInner.match(trailingWhitespaceTokenPattern);
  if (tailMatch) {
    nextInner = nextInner.slice(0, nextInner.length - tailMatch[0].length);
    removedChars += decodeHtmlWhitespaceLength(tailMatch[0]);
  }

  if (nextInner === innerHtml) {
    return {
      dom,
      changedLines: 0,
      removedChars: 0,
    };
  }

  const head = dom.slice(0, editableMatch.index);
  const tail = dom.slice(editableMatch.index + editableMatch[0].length);
  return {
    dom: `${head}${openTag}${nextInner}${closeTag}${tail}`,
    changedLines: 1,
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
