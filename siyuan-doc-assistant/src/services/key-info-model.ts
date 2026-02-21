import { KeyInfoType } from "@/core/key-info-core";

export type SqlKeyInfoRow = {
  id: string;
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
  if (type === "tag") {
    return `#${text}`;
  }
  return text;
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
  if (hasToken("mark") || hasToken("textmark") || hasToken("text")) {
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
