import { KeyInfoType } from "@/core/key-info-core";

export type SqlKeyInfoRow = {
  id: string;
  parent_id?: string;
  sort: number | string;
  type?: string;
  subtype?: string;
  content?: string;
  markdown: string;
  memo: string;
  tag: string;
};

export type SqlSpanRow = {
  id: string;
  block_id: string;
  root_id: string;
  content: string;
  markdown: string;
  type: string;
  ial?: string;
  start_offset?: number | string;
  start?: number | string;
  offset?: number | string;
  pos?: number | string;
  position?: number | string;
  block_sort?: number | string | null;
};

export type KeyInfoDocResult = {
  docId: string;
  docTitle: string;
  items: Array<{
    id: string;
    type: KeyInfoType;
    text: string;
    raw: string;
    offset: number;
    blockId?: string;
    blockSort: number;
    order: number;
    listItem?: boolean;
    listPrefix?: string;
  }>;
};

export function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

export function normalizeTitle(value: string): string {
  return (value || "").replace(/\s+/g, "").trim().toLowerCase();
}

export function splitTags(raw: string): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .map((item) => item.replace(/^#+/, ""))
    .filter(Boolean);
}

export function normalizeSort(value: number | string, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function cleanInlineText(text: string): string {
  return (text || "").replace(/\u200B/g, "").replace(/\s+/g, " ").trim();
}

const LIST_PREFIX_PATTERN = /^\s*((?:[-+*])|(?:\d+\.))\s+/;
const LIST_DECORATED_TEXT_PATTERN = /^\s*(?:[-+]\s*|\*\s+|\d+\.\s*)/;

export function extractListPrefix(text: string): string | undefined {
  const match = (text || "").match(LIST_PREFIX_PATTERN);
  if (!match) {
    return undefined;
  }
  return `${match[1]} `;
}

export function normalizeListDecoratedText(text: string): string {
  return cleanInlineText((text || "").replace(LIST_DECORATED_TEXT_PATTERN, ""));
}

export function tokenizeType(value: string): string[] {
  return (value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function parseInlineMemoFromText(
  text: string,
  memoHint?: string
): { marked: string; memo: string } {
  const cleaned = cleanInlineText(text);
  const memo = (memoHint || "").trim();
  if (memo) {
    return { marked: cleaned, memo };
  }
  let match = cleaned.match(/^(.+?)（(.+?)）$/);
  if (match) {
    return { marked: match[1].trim(), memo: match[2].trim() };
  }
  match = cleaned.match(/^(.+?)\((.+?)\)$/);
  if (match) {
    return { marked: match[1].trim(), memo: match[2].trim() };
  }
  return { marked: cleaned, memo: "" };
}

export function formatRemarkText(marked: string, memo = ""): string {
  const normalizedMarked = cleanInlineText(marked);
  const normalizedMemo = cleanInlineText(memo);
  if (!normalizedMemo) {
    return normalizedMarked;
  }
  if (!normalizedMarked) {
    return normalizedMemo;
  }
  return `${normalizedMarked}（${normalizedMemo}）`;
}

export function parseRemarkText(value: string): { marked: string; memo: string } {
  const cleaned = cleanInlineText(value);
  if (!cleaned) {
    return { marked: "", memo: "" };
  }
  const pairMatch = cleaned.match(/^(.+?)\s*[（(]\s*(.+?)\s*[）)]$/);
  if (pairMatch) {
    return {
      marked: cleanInlineText(pairMatch[1] || ""),
      memo: cleanInlineText(pairMatch[2] || ""),
    };
  }
  return { marked: cleaned, memo: "" };
}

export function buildInlineRaw(type: KeyInfoType, text: string): string {
  if (type === "bold") {
    return `**${text}**`;
  }
  if (type === "italic") {
    return `*${text}*`;
  }
  if (type === "highlight") {
    return `==${text}==`;
  }
  if (type === "code") {
    return `\`${text}\``;
  }
  if (type === "tag") {
    return `#${text}`;
  }
  return text;
}

type TextRange = [number, number];

function maskRanges(text: string, ranges: TextRange[]): string {
  if (!ranges.length) {
    return text;
  }
  const chars = text.split("");
  ranges.forEach(([start, end]) => {
    for (let i = start; i < end && i < chars.length; i += 1) {
      chars[i] = " ";
    }
  });
  return chars.join("");
}

function collectMarkdownInlineCode(source: string): { ranges: TextRange[]; segments: string[] } {
  const ranges: TextRange[] = [];
  const segments: string[] = [];
  let i = 0;
  while (i < source.length) {
    if (source[i] !== "`") {
      i += 1;
      continue;
    }
    let tickLen = 1;
    while (i + tickLen < source.length && source[i + tickLen] === "`") {
      tickLen += 1;
    }
    let j = i + tickLen;
    let found = -1;
    while (j < source.length) {
      if (source[j] !== "`") {
        j += 1;
        continue;
      }
      let run = 1;
      while (j + run < source.length && source[j + run] === "`") {
        run += 1;
      }
      if (run === tickLen) {
        found = j;
        break;
      }
      j += run;
    }
    if (found !== -1) {
      ranges.push([i, found + tickLen]);
      const code = cleanInlineText(source.slice(i + tickLen, found));
      if (code) {
        segments.push(code);
      }
      i = found + tickLen;
      continue;
    }
    i += tickLen;
  }
  return { ranges, segments };
}

function collectHtmlCode(source: string): { ranges: TextRange[]; segments: string[] } {
  const ranges: TextRange[] = [];
  const segments: string[] = [];
  const pattern = /<code\b[^>]*>([\s\S]*?)<\/code>/gi;
  let match = pattern.exec(source);
  while (match) {
    ranges.push([match.index, match.index + match[0].length]);
    const code = cleanInlineText((match[1] || "").replace(/<[^>]+>/g, " "));
    if (code) {
      segments.push(code);
    }
    match = pattern.exec(source);
  }
  return { ranges, segments };
}

function stripLinks(source: string): string {
  let next = source;
  next = next.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, " ");
  next = next.replace(/!?\[[^\]]*?\]\([^)]+\)/g, " ");
  next = next.replace(/\[\[[^\]]+\]\]/g, " ");
  next = next.replace(/<https?:\/\/[^>]+>/gi, " ");
  return next;
}

function normalizeBlockRefText(source: string): string {
  let next = source || "";
  const blockRefWithAliasPattern =
    /\(\(\s*[0-9]{14}-[a-z0-9]{7,}\s+(?:"([^"]+)"|'([^']+)')\s*\)\)/gi;
  next = next.replace(blockRefWithAliasPattern, (_all, doubleQuoted, singleQuoted) => {
    return cleanInlineText(doubleQuoted || singleQuoted || "");
  });
  const blockRefOnlyIdPattern = /\(\(\s*[0-9]{14}-[a-z0-9]{7,}\s*\)\)/gi;
  next = next.replace(blockRefOnlyIdPattern, " ");
  return next;
}

function unwrapHighlightRaw(source: string): string {
  let next = (source || "").trim();
  let prev = "";
  while (next && next !== prev) {
    prev = next;
    next = next.replace(/^==([\s\S]*?)==$/g, "$1").trim();
    next = next.replace(/^<mark\b[^>]*>([\s\S]*?)<\/mark>$/gi, "$1").trim();
    next = next
      .replace(/^<span\b[^>]*data-type=["']mark["'][^>]*>([\s\S]*?)<\/span>$/gi, "$1")
      .trim();
  }
  return next;
}

function dedupePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  items.forEach((item) => {
    if (!item || seen.has(item)) {
      return;
    }
    seen.add(item);
    result.push(item);
  });
  return result;
}

export function extractHighlightInlineCodeTexts(raw: string, fallbackText = ""): string[] {
  const source = unwrapHighlightRaw(raw || fallbackText || "");
  if (!source) {
    return [];
  }
  const markdownCodes = collectMarkdownInlineCode(source).segments;
  const htmlCodes = collectHtmlCode(source).segments;
  return dedupePreserveOrder([...markdownCodes, ...htmlCodes]);
}

export function normalizeHighlightTextWithoutLinksAndCode(raw: string, fallbackText = ""): string {
  const source = unwrapHighlightRaw(raw || fallbackText || "");
  if (!source) {
    return "";
  }
  const markdownCodeRanges = collectMarkdownInlineCode(source).ranges;
  let next = maskRanges(source, markdownCodeRanges);
  const htmlCodeRanges = collectHtmlCode(next).ranges;
  next = maskRanges(next, htmlCodeRanges);
  next = stripLinks(next);
  next = normalizeBlockRefText(next);
  next = next.replace(/==/g, " ");
  next = next.replace(/<[^>]+>/g, " ");
  return cleanInlineText(next);
}

export function resolveSpanFormatType(spanType: string, ial?: string): KeyInfoType | null {
  const normalized = [spanType, ial].filter(Boolean).join(" ").toLowerCase();
  const tokens = tokenizeType(normalized);
  const hasToken = (token: string) => tokens.includes(token);
  const hasInlineMemo =
    normalized.includes("inline-memo") ||
    (hasToken("inline") && hasToken("memo"));
  if (hasInlineMemo) {
    return "remark";
  }
  if (hasToken("tag")) {
    return "tag";
  }
  if (hasToken("strong")) {
    return "bold";
  }
  if (hasToken("em")) {
    return "italic";
  }
  const hasHighlightToken = hasToken("mark") || hasToken("textmark") || hasToken("text");
  const hasSuperOrSubscriptToken =
    hasToken("sup") || hasToken("superscript") || hasToken("sub") || hasToken("subscript");
  if (hasHighlightToken && hasSuperOrSubscriptToken) {
    return null;
  }
  if (hasHighlightToken) {
    return "highlight";
  }
  return null;
}

export function extractInlineMemoHint(ial?: string): string {
  if (!ial) {
    return "";
  }
  const match = ial.match(
    /(?:inline-memo|memo|data-inline-memo-content|data-memo-content|data-memo)=["']([^"']+)["']/i
  );
  return match ? match[1] : "";
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}
