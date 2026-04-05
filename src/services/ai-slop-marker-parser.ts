import { IrrelevantParagraphCandidate } from "@/services/ai-slop-marker-prompts";

export type KeyContentParagraphHighlight = {
  paragraphId: string;
  highlights: string[];
};

export function extractIrrelevantParagraphIds(
  payload: any,
  paragraphs: IrrelevantParagraphCandidate[]
): string[] {
  const content = extractMessageContent(payload);
  if (!content) {
    throw new Error("AI 未返回可用的段落筛选结果");
  }

  const allowedIds = new Set(paragraphs.map((item) => item.id));
  const parsed = parseJsonObject(content);
  const ids = Array.isArray(parsed?.paragraphIds) ? parsed.paragraphIds : [];
  const deduped: string[] = [];
  for (const value of ids) {
    const id = typeof value === "string" ? value.trim() : "";
    if (!id || !allowedIds.has(id) || deduped.includes(id)) {
      continue;
    }
    deduped.push(id);
  }
  return deduped;
}

export function extractKeyContentParagraphHighlights(
  payload: any,
  paragraphs: IrrelevantParagraphCandidate[]
): KeyContentParagraphHighlight[] {
  const content = extractMessageContent(payload);
  if (!content) {
    throw new Error("AI 未返回可用的关键内容识别结果");
  }

  const allowedIds = new Set(paragraphs.map((item) => item.id));
  const parsed = parseJsonObject(content);
  const entries = resolveKeyContentEntries(parsed);
  const merged = new Map<string, string[]>();

  for (const entry of entries) {
    const paragraphId = typeof entry?.paragraphId === "string"
      ? entry.paragraphId.trim()
      : typeof entry?.id === "string"
        ? entry.id.trim()
        : "";
    if (!paragraphId || !allowedIds.has(paragraphId)) {
      continue;
    }

    const highlights = resolveEntryHighlights(entry);
    const normalized = highlights
      .map((value: unknown) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean);
    if (!normalized.length) {
      continue;
    }

    const current = merged.get(paragraphId) || [];
    for (const highlight of normalized) {
      if (!current.includes(highlight)) {
        current.push(highlight);
      }
    }
    if (current.length > 0) {
      merged.set(paragraphId, current);
    }
  }

  return Array.from(merged.entries()).map(([paragraphId, highlights]) => ({
    paragraphId,
    highlights,
  }));
}

function resolveKeyContentEntries(parsed: any): any[] {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (!parsed || typeof parsed !== "object") {
    return [];
  }

  const candidates = [
    parsed?.paragraphs,
    parsed?.items,
    parsed?.results,
    parsed?.entries,
    parsed?.data,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  if (typeof parsed?.paragraphId === "string" || typeof parsed?.id === "string") {
    return [parsed];
  }

  return [];
}

function resolveEntryHighlights(entry: any): unknown[] {
  const candidates = [
    entry?.highlights,
    entry?.phrases,
    entry?.keywords,
    entry?.segments,
    entry?.snippets,
    entry?.texts,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  if (typeof entry?.highlight === "string") {
    return [entry.highlight];
  }
  if (typeof entry?.phrase === "string") {
    return [entry.phrase];
  }
  if (typeof entry?.keyword === "string") {
    return [entry.keyword];
  }
  if (typeof entry?.text === "string") {
    return [entry.text];
  }

  return [];
}

function extractMessageContent(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((item) =>
        typeof item?.text === "string"
          ? item.text
          : typeof item === "string"
            ? item
            : ""
      )
      .join("\n")
      .trim();
  }
  return "";
}

function parseJsonObject(content: string): any {
  const trimmed = (content || "").trim();
  const normalized = trimmed
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  const jsonText =
    start >= 0 && end >= start ? normalized.slice(start, end + 1) : normalized;

  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error("AI 返回的段落筛选结果不是有效 JSON");
  }
}
