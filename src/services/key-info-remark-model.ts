import { cleanInlineText } from "@/services/key-info-model";

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
      memo: cleanInlineText(pairMatch[2] || "")
    };
  }
  return { marked: cleaned, memo: "" };
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
