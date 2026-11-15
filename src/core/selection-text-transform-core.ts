import { convertChineseEnglishPunctuation, detectPunctuationToggleMode, PunctuationToggleMode } from "@/core/punctuation-toggle-core";

export type LinebreakToggleMode = "linebreak-to-paragraph" | "paragraph-to-line";

export function normalizeLineEndings(value: string): string {
  return (value || "").replace(/\r\n/g, "\n");
}

export function countSingleLineBreaks(value: string): number {
  const normalized = normalizeLineEndings(value);
  const matches = normalized.match(/(?<!\n)\n(?!\n)/g);
  return matches?.length || 0;
}

export function convertSingleLineBreaksToParagraphMarks(value: string): string {
  const normalized = normalizeLineEndings(value);
  return normalized.replace(/(?<!\n)\n(?!\n)/g, "\n\n");
}

export function isParagraphBlockType(type: string): boolean {
  const normalized = (type || "").trim().toLowerCase();
  return (
    normalized === "p" ||
    normalized === "paragraph" ||
    normalized === "nodeparagraph" ||
    normalized === "i" ||
    normalized === "listitem" ||
    normalized === "nodelistitem" ||
    normalized === "l" ||
    normalized === "list" ||
    normalized === "nodelist"
  );
}

export const INLINE_SPACE_LIKE_PATTERN = /[ \t\u00A0\u1680\u2000-\u200D\u202F\u205F\u3000\uFEFF]/gu;

export function removeSpaceLikeChars(value: string): { next: string; removedCount: number } {
  let removedCount = 0;
  const next = (value || "").replace(INLINE_SPACE_LIKE_PATTERN, () => {
    removedCount += 1;
    return "";
  });
  return { next, removedCount };
}

export function buildLinebreakToggleMode(
  blocks: Array<{ type: string; markdown?: string }>
): LinebreakToggleMode {
  const hasAnySingleLineBreak = blocks.some(
    (block) => countSingleLineBreaks(normalizeLineEndings(block.markdown || "")) > 0
  );
  return !hasAnySingleLineBreak && blocks.length > 1 && blocks.every((block) => isParagraphBlockType(block.type)) ?
    "paragraph-to-line" :
    "linebreak-to-paragraph";
}

export function buildPunctuationUpdates(
  selectedIds: string[],
  sourceMap: Map<string, string>
): {
  mode: PunctuationToggleMode;
  updates: Array<{ id: string; next: string; changedCount: number }>;
  missingSourceCount: number;
} {
  const modeSourceParts: string[] = [];
  let missingSourceCount = 0;
  for (const id of selectedIds) {
    const source = sourceMap.get(id);
    if (source === undefined) {
      missingSourceCount += 1;
      continue;
    }
    modeSourceParts.push(source);
  }
  const mode = detectPunctuationToggleMode(modeSourceParts.join("\n"));
  const updates: Array<{ id: string; next: string; changedCount: number }> = [];
  for (const id of selectedIds) {
    const source = sourceMap.get(id);
    if (source === undefined) {
      continue;
    }
    const converted = convertChineseEnglishPunctuation(source, mode);
    if (converted.changedCount <= 0 || converted.next === source) {
      continue;
    }
    updates.push({ id, next: converted.next, changedCount: converted.changedCount });
  }
  return { mode, updates, missingSourceCount };
}
