import { KeyInfoType } from "@/core/key-info-core";
import { maskRanges, replaceLinksWithVisibleText, stripLinks } from "@/services/key-info-text-normalize";

export { resolveSpanFormatType } from "@/services/key-info-span-format";
export { extractInlineMemoHint, formatRemarkText, parseInlineMemoFromText, parseRemarkText } from "@/services/key-info-remark-model";

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
    .map((item) => normalizeTagTextValue(item))
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

export function normalizeTagTextValue(value: string): string {
  let text = cleanInlineText(value);
  text = text.replace(/^[#＃]+/, "");
  text = text.replace(/[)\].,;:!?，。！？、#＃]+$/g, "");
  return cleanInlineText(text);
}

export function containsLinkTargetSyntax(source: string): boolean {
  return /<a\b|!?\[[^\]]*\]\([^)]+\)|\bhref\s*=|\bdata-href\s*=|zotero:\/\//i.test(
    source || ""
  );
}

export function normalizeInlineVisibleText(source: string): string {
  let next = replaceLinksWithVisibleText(source || "");
  next = next.replace(/\r?\n/g, " ");
  next = next.replace(/`([^`]+)`/g, "$1");
  next = next.replace(/(\*\*|__)([\s\S]+?)\1/g, "$2");
  next = next.replace(/(\*|_)([\s\S]+?)\1/g, "$2");
  next = next.replace(/==([\s\S]+?)==/g, "$1");
  next = next.replace(/%%([\s\S]+?)%%/g, "$1");
  next = next.replace(/<mark\b[^>]*>([\s\S]+?)<\/mark>/gi, "$1");
  next = next.replace(/<strong\b[^>]*>([\s\S]+?)<\/strong>/gi, "$1");
  next = next.replace(/<b\b[^>]*>([\s\S]+?)<\/b>/gi, "$1");
  next = next.replace(/<em\b[^>]*>([\s\S]+?)<\/em>/gi, "$1");
  next = next.replace(/<i\b[^>]*>([\s\S]+?)<\/i>/gi, "$1");
  next = next.replace(/<u\b[^>]*>([\s\S]+?)<\/u>/gi, "$1");
  next = next.replace(/<ins\b[^>]*>([\s\S]+?)<\/ins>/gi, "$1");
  next = next.replace(/<span\b[^>]+data-type=["'](?:u|underline)["'][^>]*>([\s\S]+?)<\/span>/gi, "$1");
  next = next.replace(/<span\b[^>]*>([\s\S]+?)<\/span>/gi, "$1");
  next = next.replace(/<[^>]+>/g, " ");
  return cleanInlineText(next);
}

export function normalizeInlineDisplayText(text: string, raw = ""): string {
  if (containsLinkTargetSyntax(raw)) {
    const normalizedFromRaw = normalizeInlineVisibleText(raw);
    if (normalizedFromRaw) {
      return normalizedFromRaw;
    }
  }
  return normalizeInlineVisibleText(text || raw);
}

const LIST_PREFIX_PATTERN = /^\s*([-+*]|\d+\.)\s+/;
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

export function buildInlineRaw(type: KeyInfoType, text: string): string {
  if (type === "bold") {
    return `**${text}**`;
  }
  if (type === "italic") {
    return `*${text}*`;
  }
  if (type === "underline") {
    return `<u>${text}</u>`;
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

function normalizeBlockRefText(source: string): string {
  let next = source || "";
  const blockRefWithAliasPattern =
    /\(\(\s*\d{14}-[a-z0-9]{7,}\s+(?:"([^"]+)"|'([^']+)')\s*\)\)/gi;
  next = next.replace(blockRefWithAliasPattern, (_all, doubleQuoted, singleQuoted) => {
    return cleanInlineText(doubleQuoted || singleQuoted || "");
  });
  const blockRefOnlyIdPattern = /\(\(\s*\d{14}-[a-z0-9]{7,}\s*\)\)/gi;
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
      .replace(/^<span\b[^>]+data-type=["']mark["'][^>]*>([\s\S]*?)<\/span>$/gi, "$1")
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

export function chunkArray<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}
