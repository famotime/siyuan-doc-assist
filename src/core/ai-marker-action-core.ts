export function truncateForDisplay(text: string, maxLen: number): string {
  const value = (text || "").replace(/[\r\n]+/gu, " ").trim();
  return value.length > maxLen ? `${value.slice(0, maxLen)}…` : value;
}

export function isParagraphLikeBlockType(type: string): boolean {
  const normalized = (type || "").trim().toLowerCase();
  return (
    normalized === "p" ||
    normalized === "paragraph" ||
    normalized === "nodeparagraph"
  );
}

export function isFullyStruckParagraph(markdown: string): boolean {
  return /^\s*~~[\s\S]+~~\s*$/u.test(markdown || "");
}

function wrapParagraphWithStrikethrough(markdown: string): string {
  const value = markdown || "";
  if (!value || isFullyStruckParagraph(value)) {
    return value;
  }

  const lines = value.split(/\r?\n/);
  const ialLines: string[] = [];
  let contentEndIndex = lines.length - 1;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      continue;
    }
    if (/^\{:/.test(trimmed)) {
      ialLines.unshift(lines[index]);
      contentEndIndex = index - 1;
      continue;
    }
    break;
  }

  const content = lines.slice(0, contentEndIndex + 1).join("\n");
  if (!content) {
    return value;
  }

  const wrapped = `~~${content}~~`;
  return ialLines.length ? `${wrapped}\n${ialLines.join("\n")}` : wrapped;
}

export function applyStrikethroughToIrrelevantSegments(
  markdown: string,
  segments: string[]
): { markdown: string; markedCount: number; detailLabels: string[] } {
  const normalizedSegments = Array.isArray(segments) ?
      segments.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean) :
      [];
  if (!normalizedSegments.length) {
    const wrapped = wrapParagraphWithStrikethrough(markdown);
    return {
      markdown: wrapped,
      markedCount: wrapped !== markdown ? 1 : 0,
      detailLabels: []
    };
  }

  const lines = (markdown || "").split(/\r?\n/);
  const ialLines: string[] = [];
  let contentEndIndex = lines.length - 1;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      continue;
    }
    if (/^\{:/.test(trimmed)) {
      ialLines.unshift(lines[index]);
      contentEndIndex = index - 1;
      continue;
    }
    break;
  }

  let content = lines.slice(0, contentEndIndex + 1).join("\n");
  const contentText = content.trim();
  let markedCount = 0;
  const detailLabels: string[] = [];

  for (const segment of normalizedSegments) {
    if (isWholeMixedParagraphSegment(contentText, segment)) {
      continue;
    }
    const next = replaceAllPlainSegmentsWithStrikethrough(content, segment);
    if (next.count <= 0) {
      continue;
    }
    content = next.markdown;
    markedCount += next.count;
    for (let index = 0; index < next.count; index += 1) {
      detailLabels.push(stripMarkdownMarkersForDisplay(segment));
    }
  }

  const nextMarkdown = ialLines.length ? `${content}\n${ialLines.join("\n")}` : content;
  return {
    markdown: nextMarkdown,
    markedCount,
    detailLabels
  };
}

export function stripMarkdownMarkersForDisplay(markdown: string): string {
  return (markdown || "")
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/__([^_]+)__/gu, "$1")
    .replace(/~~([^~]+)~~/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .trim();
}

function isWholeMixedParagraphSegment(markdown: string, segment: string): boolean {
  const normalizedMarkdown = (markdown || "").trim();
  const normalizedSegment = (segment || "").trim();
  if (!normalizedMarkdown || normalizedMarkdown !== normalizedSegment) {
    return false;
  }
  return countSentenceLikeUnits(normalizedMarkdown) > 1;
}

function countSentenceLikeUnits(value: string): number {
  const compact = (value || "")
    .replace(/~~/gu, "")
    .replace(/`[^`]*`/gu, "")
    .trim();
  if (!compact) {
    return 0;
  }
  const matches = compact.match(/[。！？!?；;]+/gu);
  if (matches?.length) {
    return matches.length;
  }
  return compact.split(/\s{2,}|\n+/u).filter(Boolean).length;
}

function replaceAllPlainSegmentsWithStrikethrough(
  markdown: string,
  segment: string
): { markdown: string; count: number } {
  if (!markdown || !segment) {
    return { markdown, count: 0 };
  }

  let next = "";
  let cursor = 0;
  let count = 0;
  while (cursor < markdown.length) {
    const index = markdown.indexOf(segment, cursor);
    if (index < 0) {
      next += markdown.slice(cursor);
      break;
    }
    if (isInsideStrikethrough(markdown, index)) {
      next += markdown.slice(cursor, index + segment.length);
      cursor = index + segment.length;
      continue;
    }
    next += `${markdown.slice(cursor, index)}~~${segment}~~`;
    cursor = index + segment.length;
    count += 1;
  }

  return { markdown: next, count };
}

function isInsideStrikethrough(markdown: string, index: number): boolean {
  const before = markdown.slice(0, index).match(/~~/gu)?.length || 0;
  return before % 2 === 1;
}

export function toConfirmDetailText(markdown: string): string {
  const value = markdown || "";
  if (!value) {
    return "";
  }

  const lines = value.split(/\r?\n/);
  while (lines.length > 0) {
    const trimmed = lines[lines.length - 1].trim();
    if (!trimmed) {
      lines.pop();
      continue;
    }
    if (/^\{:/.test(trimmed)) {
      lines.pop();
      continue;
    }
    break;
  }

  return stripMarkdownMarkersForDisplay(
    lines.join("\n").trim().replace(/^~~([\s\S]+)~~$/u, "$1").trim()
  );
}

export function resolveBlocksAfterOpeningSeparator<
  T extends { markdown?: string }
>(blocks: T[]): T[] {
  const separatorIndex = blocks
    .slice(0, 10)
    .findIndex((item) => (item.markdown || "").trim() === "---");
  if (separatorIndex < 0) {
    return blocks;
  }
  return blocks.slice(separatorIndex + 1);
}

export function applyBoldToParagraphHighlights(markdown: string, highlights: string[]): string {
  const value = markdown || "";
  const normalizedHighlights = Array.isArray(highlights) ?
      highlights.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean) :
      [];
  if (!value || !normalizedHighlights.length) {
    return value;
  }

  const lines = value.split(/\r?\n/);
  const ialLines: string[] = [];
  let contentEndIndex = lines.length - 1;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      continue;
    }
    if (/^\{:/.test(trimmed)) {
      ialLines.unshift(lines[index]);
      contentEndIndex = index - 1;
      continue;
    }
    break;
  }

  const content = lines.slice(0, contentEndIndex + 1).join("\n");
  const ranges = collectBoldHighlightRanges(content, normalizedHighlights);
  if (!content || !ranges.length) {
    return value;
  }

  let nextContent = content;
  const sortedRanges = [...ranges].sort((left, right) => right.start - left.start);
  for (const range of sortedRanges) {
    nextContent =
      `${nextContent.slice(0, range.start)}**${nextContent.slice(range.start, range.end)}**${nextContent.slice(range.end)}`;
  }

  return ialLines.length ? `${nextContent}\n${ialLines.join("\n")}` : nextContent;
}

type TextRange = {
  start: number;
  end: number;
};

function collectBoldHighlightRanges(content: string, highlights: string[]): TextRange[] {
  if (!content.trim()) {
    return [];
  }

  const existingBoldRanges = collectExistingBoldTextRanges(content);
  const wholeContent = content.trim();
  const candidates: TextRange[] = [];

  for (const highlight of [...new Set(highlights)].sort((left, right) => right.length - left.length)) {
    const highlightRanges = findHighlightRangesInContent(content, highlight);
    for (const range of highlightRanges) {
      const matched = content.slice(range.start, range.end);
      if (
        matched.trim() &&
        matched.trim() !== wholeContent &&
        !hasRangeOverlap(existingBoldRanges, range.start, range.end)
      ) {
        candidates.push(range);
      }
    }
  }

  const selected: TextRange[] = [];
  const sortedCandidates = candidates.sort((left, right) => {
    const lengthDelta = (right.end - right.start) - (left.end - left.start);
    if (lengthDelta !== 0) {
      return lengthDelta;
    }
    return left.start - right.start;
  });

  for (const candidate of sortedCandidates) {
    if (hasRangeOverlap(existingBoldRanges, candidate.start, candidate.end)) {
      continue;
    }
    if (hasRangeOverlap(selected, candidate.start, candidate.end)) {
      continue;
    }
    selected.push(candidate);
  }

  return selected.sort((left, right) => left.start - right.start);
}

function collectExistingBoldTextRanges(content: string): TextRange[] {
  const ranges: TextRange[] = [];
  const pattern = /(?<!\\)\*\*([\s\S]+?)(?<!\\)\*\*/gu;
  let match = pattern.exec(content);
  while (match) {
    const fullMatch = match[0] || "";
    if (fullMatch.length >= 4) {
      ranges.push({
        start: match.index + 2,
        end: match.index + fullMatch.length - 2
      });
    }
    match = pattern.exec(content);
  }
  return ranges;
}

function hasRangeOverlap(ranges: TextRange[], start: number, end: number): boolean {
  return ranges.some((range) => start < range.end && end > range.start);
}

function findHighlightRangesInContent(content: string, highlight: string): TextRange[] {
  const exactMatches = findExactHighlightRanges(content, highlight);
  if (exactMatches.length > 0) {
    return exactMatches;
  }

  return findLooseHighlightRanges(content, highlight);
}

function findExactHighlightRanges(content: string, highlight: string): TextRange[] {
  const ranges: TextRange[] = [];
  let fromIndex = 0;
  while (fromIndex < content.length) {
    const start = content.indexOf(highlight, fromIndex);
    if (start < 0) {
      break;
    }
    ranges.push({ start, end: start + highlight.length });
    fromIndex = start + Math.max(1, highlight.length);
  }
  return ranges;
}

function findLooseHighlightRanges(content: string, highlight: string): TextRange[] {
  const ranges: TextRange[] = [];
  const normalizedContent = normalizeSearchableText(content);
  const normalizedHighlight = normalizeSearchableText(highlight);
  if (!normalizedHighlight.text) {
    return ranges;
  }

  let fromIndex = 0;
  while (fromIndex < normalizedContent.text.length) {
    const start = normalizedContent.text.indexOf(normalizedHighlight.text, fromIndex);
    if (start < 0) {
      break;
    }
    const startOriginal = normalizedContent.indexMap[start];
    const endOriginalInclusive = normalizedContent.indexMap[
      start + normalizedHighlight.text.length - 1
    ];
    if (startOriginal !== undefined && endOriginalInclusive !== undefined) {
      ranges.push({
        start: startOriginal,
        end: endOriginalInclusive + 1
      });
    }
    fromIndex = start + Math.max(1, normalizedHighlight.text.length);
  }

  return ranges;
}

function normalizeSearchableText(value: string): { text: string; indexMap: number[] } {
  const textParts: string[] = [];
  const indexMap: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (!char || shouldIgnoreForLooseSearch(value, index)) {
      continue;
    }
    textParts.push(char);
    indexMap.push(index);
  }
  return {
    text: textParts.join(""),
    indexMap
  };
}

function shouldIgnoreForLooseSearch(value: string, index: number): boolean {
  const char = value[index];
  if (!char) {
    return true;
  }
  if (/\s/u.test(char)) {
    return true;
  }
  if (
    char === "*" &&
    ((index > 0 && value[index - 1] === "*") || (index + 1 < value.length && value[index + 1] === "*"))
  ) {
    return true;
  }
  return false;
}
