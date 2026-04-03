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

export function isBlankLine(line: string): boolean {
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
    return decoded + rest.length;
  };

  for (const line of lines) {
    let removedInLine = 0;
    let nextLine = line;

    const beforeInlineIal = nextLine;
    nextLine = nextLine.replace(
      trailingWhitespaceSpanIalPattern,
      (_match, _quote: string, ws: string) => {
        removedInLine += decodeEscapedWhitespaceLength(ws || "");
        return "";
      }
    );
    nextLine = nextLine.replace(
      trailingWhitespaceIalPattern,
      (_match, ws: string) => {
        removedInLine += decodeEscapedWhitespaceLength(ws || "");
        return "";
      }
    );
    if (nextLine !== beforeInlineIal) {
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

export type ClippedListPrefixCleanupResult = {
  markdown: string;
  removedCount: number;
};

export type StrikethroughCleanupResult = {
  markdown: string;
  removedCount: number;
};

export type BilingualParagraphSplitResult = {
  parts: string[];
  changed: boolean;
};

type LanguageLabel = "en" | "zh" | "neutral";

type SentenceChunkMeta = {
  text: string;
  label: LanguageLabel;
  latinCount: number;
  hanCount: number;
};

const MARKDOWN_LINK_PATTERN = /!?\[([^\]]*)\]\([^)]+\)/g;
const INLINE_MARKUP_PATTERN = /[*_~#>]+/g;
const HTML_TAG_PATTERN = /<[^>]+>/g;
const LATIN_LETTER_PATTERN = /[A-Za-z]/g;
const HAN_CHAR_PATTERN = /\p{Script=Han}/gu;
const BILINGUAL_SKIP_PATTERN = /`|https?:\/\/|www\./iu;
const SENTENCE_END_CHARS = new Set([".", "!", "?", ";", "。", "！", "？", "；"]);
const SENTENCE_TAIL_PATTERN = /["'”’)\]】）\s]/u;
const STRIKETHROUGH_SPAN_DATA_TYPE_PATTERN = /\bdata-type=(["'])([^"']*)\1/iu;

function hasStrikethroughDataType(openTag: string): boolean {
  const match = STRIKETHROUGH_SPAN_DATA_TYPE_PATTERN.exec(openTag || "");
  if (!match) {
    return false;
  }
  return (match[2] || "")
    .split(/\s+/)
    .map((part) => part.trim().toLowerCase())
    .includes("s");
}

function removeStrikethroughContentFromLine(
  line: string
): { line: string; removedCount: number } {
  if (!line) {
    return { line: "", removedCount: 0 };
  }

  let next = "";
  let removedCount = 0;
  let i = 0;
  let codeFenceTicks = 0;

  while (i < line.length) {
    if (line[i] === "`") {
      let tickCount = 1;
      while (i + tickCount < line.length && line[i + tickCount] === "`") {
        tickCount += 1;
      }
      if (codeFenceTicks === 0) {
        codeFenceTicks = tickCount;
      } else if (codeFenceTicks === tickCount) {
        codeFenceTicks = 0;
      }
      next += line.slice(i, i + tickCount);
      i += tickCount;
      continue;
    }

    if (codeFenceTicks === 0 && line.startsWith("~~", i)) {
      const end = line.indexOf("~~", i + 2);
      if (end >= 0) {
        removedCount += 1;
        i = end + 2;
        continue;
      }
    }

    if (codeFenceTicks === 0 && line.startsWith("<span", i)) {
      const openEnd = line.indexOf(">", i);
      if (openEnd > i) {
        const openTag = line.slice(i, openEnd + 1);
        if (hasStrikethroughDataType(openTag)) {
          const closeIndex = line.indexOf("</span>", openEnd + 1);
          if (closeIndex >= 0) {
            removedCount += 1;
            i = closeIndex + "</span>".length;
            continue;
          }
        }
      }
    }

    if (codeFenceTicks === 0 && /^<(s|del)\b/i.test(line.slice(i))) {
      const openEnd = line.indexOf(">", i);
      if (openEnd > i) {
        const closeTagMatch = /^<(s|del)\b/i.exec(line.slice(i));
        const closeTag = closeTagMatch?.[1]?.toLowerCase() === "del" ? "</del>" : "</s>";
        const closeIndex = line.indexOf(closeTag, openEnd + 1);
        if (closeIndex >= 0) {
          removedCount += 1;
          i = closeIndex + closeTag.length;
          continue;
        }
      }
    }

    next += line[i];
    i += 1;
  }

  return { line: next, removedCount };
}

export function removeStrikethroughMarkedContentFromMarkdown(
  markdown: string
): StrikethroughCleanupResult {
  if (!markdown) {
    return {
      markdown: "",
      removedCount: 0,
    };
  }

  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  let removedCount = 0;
  let inFence = false;
  let fenceChar = "";
  let fenceLen = 0;

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
      continue;
    }

    if (inFence) {
      output.push(line);
      continue;
    }

    const cleaned = removeStrikethroughContentFromLine(line);
    output.push(cleaned.line);
    removedCount += cleaned.removedCount;
  }

  return {
    markdown: output.join("\n"),
    removedCount,
  };
}

function countMatches(value: string, pattern: RegExp): number {
  const matches = value.match(pattern);
  return matches?.length || 0;
}

function stripMarkdownForLanguageDetection(value: string): string {
  return (value || "")
    .replace(MARKDOWN_LINK_PATTERN, "$1")
    .replace(HTML_TAG_PATTERN, " ")
    .replace(INLINE_MARKUP_PATTERN, "");
}

function splitSentenceChunks(value: string): string[] {
  if (!value) {
    return [];
  }

  const chunks: string[] = [];
  let current = "";

  for (let i = 0; i < value.length; i += 1) {
    current += value[i];
    if (!SENTENCE_END_CHARS.has(value[i])) {
      continue;
    }
    while (i + 1 < value.length && SENTENCE_TAIL_PATTERN.test(value[i + 1])) {
      current += value[i + 1];
      i += 1;
    }
    chunks.push(current);
    current = "";
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.filter((chunk) => chunk.trim().length > 0);
}

function classifySentenceChunk(value: string): SentenceChunkMeta {
  const normalized = stripMarkdownForLanguageDetection(value);
  const latinCount = countMatches(normalized, LATIN_LETTER_PATTERN);
  const hanCount = countMatches(normalized, HAN_CHAR_PATTERN);

  if (latinCount >= 12 && latinCount >= hanCount * 2) {
    return { text: value, label: "en", latinCount, hanCount };
  }
  if (hanCount >= 6 && hanCount >= latinCount * 2) {
    return { text: value, label: "zh", latinCount, hanCount };
  }
  return { text: value, label: "neutral", latinCount, hanCount };
}

export function splitBilingualParagraphMarkdown(
  markdown: string
): BilingualParagraphSplitResult {
  const normalized = (markdown || "").replace(/\r\n/g, "\n").trim();
  if (!normalized || normalized.includes("\n") || BILINGUAL_SKIP_PATTERN.test(normalized)) {
    return { parts: [markdown || ""], changed: false };
  }

  const stripped = stripMarkdownForLanguageDetection(normalized);
  const totalLatin = countMatches(stripped, LATIN_LETTER_PATTERN);
  const totalHan = countMatches(stripped, HAN_CHAR_PATTERN);
  if (totalLatin < 20 || totalHan < 8) {
    return { parts: [markdown], changed: false };
  }

  const chunks = splitSentenceChunks(normalized);
  if (chunks.length < 2) {
    return { parts: [markdown], changed: false };
  }

  const metas = chunks.map((chunk) => classifySentenceChunk(chunk));
  const dominantChunks = metas
    .map((meta, index) => ({ ...meta, index }))
    .filter((meta) => meta.label !== "neutral");
  if (dominantChunks.length < 2) {
    return { parts: [markdown], changed: false };
  }

  let splitAt = -1;
  let switchCount = 0;
  for (let i = 1; i < dominantChunks.length; i += 1) {
    if (dominantChunks[i - 1].label === dominantChunks[i].label) {
      continue;
    }
    switchCount += 1;
    splitAt = dominantChunks[i].index;
  }
  if (switchCount !== 1 || splitAt <= 0 || splitAt >= chunks.length) {
    return { parts: [markdown], changed: false };
  }

  const first = chunks.slice(0, splitAt).join("").trim();
  const second = chunks.slice(splitAt).join("").trim();
  if (!first || !second) {
    return { parts: [markdown], changed: false };
  }

  const firstMeta = classifySentenceChunk(first);
  const secondMeta = classifySentenceChunk(second);
  if (
    firstMeta.label === "neutral" ||
    secondMeta.label === "neutral" ||
    firstMeta.label === secondMeta.label
  ) {
    return { parts: [markdown], changed: false };
  }

  return { parts: [first, second], changed: true };
}

// Bullet characters commonly inserted as duplicates by web clippers
// (used inline in the regex below)
/**
 * Remove redundant list prefixes inserted by web clippers:
 * 1. Unordered: `- {: ...}• text` → `- {: ...}text`
 * 2. Ordered nested: outer empty wrapper + inner numbered sub-item
 *    flattened to a single numbered item at the outer level.
 */
export function removeClippedListPrefixesFromMarkdown(
  markdown: string
): ClippedListPrefixCleanupResult {
  if (!markdown) {
    return { markdown: "", removedCount: 0 };
  }

  let removedCount = 0;
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  const bulletChars = "[•·○◦▪▸➢➤►◆◇✓✔★☆→⁃‣⦿⦾◉●]";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // SQL markdown for clipped unordered lists is flattened to `- • text`.
    const flatUnorderedMatch = line.match(
      new RegExp(`^(\\s*(?:[-*+]))\\s+(${bulletChars})\\s*(.*)$`)
    );
    if (flatUnorderedMatch) {
      out.push(`${flatUnorderedMatch[1]} ${flatUnorderedMatch[3]}`);
      removedCount += 1;
      i += 1;
      continue;
    }

    // ── Case 1: unordered bullet duplicate ────────────────────────────────
    // Pattern: `(indent)(- )(IAL)(bullet_char)(optional_space)(rest)`
    const unorderedMatch = line.match(
      new RegExp(`^(\\s*(?:[-*+]) \\{:[^}]*\\})\\s*(${bulletChars})\\s*(.*)$`)
    );
    if (unorderedMatch) {
      out.push(`${unorderedMatch[1]}${unorderedMatch[3]}`);
      removedCount += 1;
      i += 1;
      continue;
    }

    // SQL markdown for clipped ordered lists is flattened to `1. 1. text`.
    const flatOrderedMatch = line.match(/^(\s*)(\d+)([.)])\s+(\d+)([.)])\s+(.*)$/);
    if (flatOrderedMatch && flatOrderedMatch[2] === flatOrderedMatch[4]) {
      out.push(
        `${flatOrderedMatch[1]}${flatOrderedMatch[2]}${flatOrderedMatch[3]} ${flatOrderedMatch[6]}`
      );
      removedCount += 1;
      i += 1;
      continue;
    }

    // ── Case 2: ordered list — empty outer item wrapping a numbered sub-item
    // Outer: `(indent)(N. )(IAL)` with no trailing content
    // Next lines: `(indent+3)(N. )(IAL)(content)` then `(indent+6)(IAL)` then `(indent+3)(IAL)`
    const orderedOuterMatch = line.match(/^(\s*)(\d+)[.)]{1} \{:[^}]*\}\s*$/);
    if (orderedOuterMatch) {
      const baseIndent = orderedOuterMatch[1];
      const outerNum = orderedOuterMatch[2];
      const innerIndent = baseIndent + "   ";

      // Peek ahead: next non-attr line should be the inner item
      let j = i + 1;
      // skip blank/attr lines between outer item and its children
      while (j < lines.length && lines[j].trim() === "") {
        j += 1;
      }
      const innerItemLine = j < lines.length ? lines[j] : "";
      const innerMatch = innerItemLine.match(
        new RegExp(`^${innerIndent.replace(/\s/g, "\\s")}(\\d+)[.)]{1} (\\{:[^}]*\\})(.*)$`)
      );

      if (innerMatch && innerMatch[1] === outerNum) {
        // This is the clipped pattern: flatten by replacing outer with inner content
        // Collect inner item's continuation lines and trailing IALs
        const innerIal = innerMatch[2];
        const innerContent = innerMatch[3];
        const flatLine = `${baseIndent}${outerNum}. ${innerIal}${innerContent}`;
        out.push(flatLine);
        removedCount += 1;
        i = j + 1; // skip outer header line + inner item line

        const deeperIndent = innerIndent + "   ";
        // Copy continuation lines of the inner item (dedented by 3 spaces).
        // Stop before the outer item's trailing IAL (at innerIndent but not deeperIndent).
        while (i < lines.length) {
          const contLine = lines[i];
          if (!contLine.startsWith(innerIndent)) break;
          // The outer item's own IAL sits at innerIndent but not deeperIndent — skip it
          if (!contLine.startsWith(deeperIndent) && /^\s*\{:[^}]*\}\s*$/.test(contLine)) {
            i += 1; // consume the outer item IAL without emitting it
            break;
          }
          out.push(baseIndent + contLine.slice(innerIndent.length));
          i += 1;
        }
        continue;
      }
    }

    out.push(line);
    i += 1;
  }

  return { markdown: out.join("\n"), removedCount };
}
