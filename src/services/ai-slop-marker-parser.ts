import { createDocAssistantLogger } from "@/core/logger-core";
import {
  IrrelevantParagraphCandidate,
  IrrelevantSegmentCandidate,
} from "@/services/ai-slop-marker-prompts";

const parserLogger = createDocAssistantLogger("AiSlopMarker");

export type KeyContentParagraphHighlight = {
  paragraphId: string;
  highlights: string[];
};

export type IrrelevantParagraphMark = {
  paragraphId: string;
  segments: string[];
};

export function extractIrrelevantParagraphIds(
  payload: any,
  paragraphs: IrrelevantParagraphCandidate[]
): string[] {
  return extractIrrelevantParagraphMarks(payload, paragraphs).map((item) => item.paragraphId);
}

export function extractIrrelevantParagraphMarks(
  payload: any,
  paragraphs: IrrelevantParagraphCandidate[],
  segmentCandidates: IrrelevantSegmentCandidate[] = []
): IrrelevantParagraphMark[] {
  const content = extractMessageContent(payload);
  if (!content) {
    throw new Error("AI 未返回可用的段落筛选结果（响应内容为空）");
  }

  parserLogger.debug("extracted content", { length: content.length, preview: content.slice(0, 300) });

  const paragraphMap = new Map(paragraphs.map((item) => [item.id, item]));
  const allowedIds = new Set(paragraphMap.keys());
  const parsed = parseJsonObject(content, "段落筛选");
  const segmentIdMarks = resolveSegmentIdMarks(parsed, segmentCandidates);
  if (segmentIdMarks.length > 0) {
    return segmentIdMarks;
  }

  const entries = resolveIrrelevantParagraphEntries(parsed);
  if (entries.length > 0) {
    const marks: IrrelevantParagraphMark[] = [];
    for (const entry of entries) {
      const paragraphId = typeof entry?.paragraphId === "string"
        ? entry.paragraphId.trim()
        : typeof entry?.id === "string"
          ? entry.id.trim()
          : "";
      const paragraph = paragraphId ? paragraphMap.get(paragraphId) : undefined;
      if (!paragraph) {
        continue;
      }

      const rawSegments = resolveEntrySegments(entry);
      const segments: string[] = [];
      for (const value of rawSegments) {
        const segment = typeof value === "string" ? value.trim() : "";
        if (!segment || segments.includes(segment) || !paragraph.markdown.includes(segment)) {
          continue;
        }
        segments.push(segment);
      }
      if (segments.length > 0) {
        marks.push({ paragraphId, segments });
      }
    }
    return marks;
  }

  const ids = Array.isArray(parsed?.paragraphIds) ? parsed.paragraphIds : [];
  const deduped: IrrelevantParagraphMark[] = [];
  for (const value of ids) {
    const id = typeof value === "string" ? value.trim() : "";
    if (!id || !allowedIds.has(id) || deduped.some((item) => item.paragraphId === id)) {
      continue;
    }
    deduped.push({ paragraphId: id, segments: [] });
  }
  return deduped;
}

function resolveSegmentIdMarks(
  parsed: any,
  segmentCandidates: IrrelevantSegmentCandidate[]
): IrrelevantParagraphMark[] {
  if (!Array.isArray(segmentCandidates) || !segmentCandidates.length) {
    return [];
  }
  const ids = Array.isArray(parsed?.segmentIds)
    ? parsed.segmentIds
    : Array.isArray(parsed?.segments)
      ? parsed.segments
      : [];
  if (!ids.length) {
    return [];
  }

  const segmentMap = new Map(segmentCandidates.map((item) => [item.id, item]));
  const grouped = new Map<string, string[]>();
  for (const value of ids) {
    const id = typeof value === "string" ? value.trim() : "";
    const segment = id ? segmentMap.get(id) : undefined;
    if (!segment) {
      continue;
    }
    const current = grouped.get(segment.paragraphId) || [];
    const sourceText = segment.sourceText || segment.text;
    if (!current.includes(sourceText)) {
      current.push(sourceText);
    }
    grouped.set(segment.paragraphId, current);
  }

  return Array.from(grouped.entries()).map(([paragraphId, segments]) => ({
    paragraphId,
    segments,
  }));
}

function resolveIrrelevantParagraphEntries(parsed: any): any[] {
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

function resolveEntrySegments(entry: any): unknown[] {
  const candidates = [
    entry?.segments,
    entry?.snippets,
    entry?.phrases,
    entry?.texts,
    entry?.sentences,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  if (typeof entry?.segment === "string") {
    return [entry.segment];
  }
  if (typeof entry?.snippet === "string") {
    return [entry.snippet];
  }
  if (typeof entry?.text === "string") {
    return [entry.text];
  }

  return [];
}

export function extractKeyContentParagraphHighlights(
  payload: any,
  paragraphs: IrrelevantParagraphCandidate[],
  segmentCandidates: IrrelevantSegmentCandidate[] = []
): KeyContentParagraphHighlight[] {
  const content = extractMessageContent(payload);
  if (!content) {
    throw new Error("AI 未返回可用的关键内容识别结果");
  }

  parserLogger.debug("extracted content", { length: content.length, preview: content.slice(0, 300) });

  const allowedIds = new Set(paragraphs.map((item) => item.id));
  const parsed = parseJsonObject(content, "关键内容");
  const segmentHighlights = resolveSegmentIdHighlights(parsed, segmentCandidates);
  if (segmentHighlights.length > 0) {
    return segmentHighlights;
  }

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

function resolveSegmentIdHighlights(
  parsed: any,
  segmentCandidates: IrrelevantSegmentCandidate[]
): KeyContentParagraphHighlight[] {
  if (!Array.isArray(segmentCandidates) || !segmentCandidates.length) {
    return [];
  }
  const ids = Array.isArray(parsed?.segmentIds)
    ? parsed.segmentIds
    : Array.isArray(parsed?.highlightSegmentIds)
      ? parsed.highlightSegmentIds
      : [];
  if (!ids.length) {
    return [];
  }

  const segmentMap = new Map(segmentCandidates.map((item) => [item.id, item]));
  const grouped = new Map<string, string[]>();
  for (const value of ids) {
    const id = typeof value === "string" ? value.trim() : "";
    const segment = id ? segmentMap.get(id) : undefined;
    if (!segment) {
      continue;
    }
    const current = grouped.get(segment.paragraphId) || [];
    const sourceText = segment.sourceText || segment.text;
    if (!current.includes(sourceText)) {
      current.push(sourceText);
    }
    grouped.set(segment.paragraphId, current);
  }

  return Array.from(grouped.entries()).map(([paragraphId, highlights]) => ({
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
  const message = payload?.choices?.[0]?.message;
  // 优先取 content，若为空则回退到 reasoning_content（部分国产推理模型会将输出放在此字段）
  const raw = extractFirstNonEmptyString([
    message?.content,
    message?.reasoning_content,
  ]);

  let content: string;
  if (typeof raw === "string") {
    content = raw;
  } else if (Array.isArray(raw)) {
    content = raw
      .map((item) =>
        typeof item?.text === "string"
          ? item.text
          : typeof item === "string"
            ? item
            : ""
      )
      .join("\n");
  } else {
    return "";
  }

  // 部分模型会在 content 中包裹推理块标签，需要去除
  content = content
    .replace(/<think>[\s\S]*?<\/think>/gu, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gu, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gu, "")
    .trim();

  // 如果去除推理块后内容为空，尝试直接从原始内容中提取 JSON 对象
  if (!content && typeof raw === "string") {
    const jsonMatch = raw.match(/\{[\s\S]*\}/u);
    if (jsonMatch) {
      content = jsonMatch[0];
    }
  }

  return content.trim();
}

function extractFirstNonEmptyString(values: unknown[]): unknown {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }
  }
  return values[0];
}

function parseJsonObject(content: string, label = "结果"): any {
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
    const preview = normalized.length > 150
      ? `${normalized.slice(0, 150)}…`
      : normalized;
    if (looksLikeTruncatedJson(normalized)) {
      throw new Error(`AI 返回的${label}不是有效 JSON，可能被模型截断，请调高 AI 最大输出 Tokens 后重试：${preview}`);
    }
    throw new Error(`AI 返回的${label}不是有效 JSON：${preview}`);
  }
}

function looksLikeTruncatedJson(content: string): boolean {
  const value = (content || "").trim();
  if (!value.startsWith("{") && !value.startsWith("[")) {
    return false;
  }
  return !(value.endsWith("}") || value.endsWith("]"));
}
