import {
  AiServiceConfig,
  DEFAULT_AI_REQUEST_TIMEOUT_SECONDS,
  isAiServiceConfigComplete,
  normalizeAiServiceConfig,
} from "@/core/ai-service-config-core";
import { forwardProxy, ForwardProxyHeader, ForwardProxyResponse } from "@/services/kernel";

type ForwardProxyFn = (
  url: string,
  method?: string,
  payload?: any,
  headers?: ForwardProxyHeader[],
  timeout?: number,
  contentType?: string
) => Promise<ForwardProxyResponse>;

type IrrelevantParagraphCandidate = {
  id: string;
  markdown: string;
};

type KeyContentParagraphHighlight = {
  paragraphId: string;
  highlights: string[];
};

type DetectIrrelevantParagraphIdsParams = {
  config?: unknown;
  documentTitle?: string;
  paragraphs: IrrelevantParagraphCandidate[];
};

type DetectKeyContentParagraphHighlightsParams = {
  config?: unknown;
  documentTitle?: string;
  paragraphs: IrrelevantParagraphCandidate[];
};

export function createAiSlopMarkerService(deps: {
  forwardProxy: ForwardProxyFn;
}) {
  return {
    async detectIrrelevantParagraphIds(
      params: DetectIrrelevantParagraphIdsParams
    ): Promise<string[]> {
      const config = normalizeAiServiceConfig(params.config);
      if (!config.enabled) {
        throw new Error("请先在设置中启用 AI 服务");
      }
      if (!isAiServiceConfigComplete(config)) {
        throw new Error("AI 服务配置不完整，请补充 Base URL、API Key 和 Model");
      }

      const paragraphs = normalizeParagraphCandidates(params.paragraphs);
      if (!paragraphs.length) {
        return [];
      }

      const endpoint = `${config.baseUrl.replace(/\/+$/u, "")}/chat/completions`;
      const body = JSON.stringify({
        model: config.model,
        messages: buildIrrelevantParagraphMessages({
          documentTitle: params.documentTitle,
          paragraphs,
        }),
        max_tokens: 400,
        temperature: 0.1,
      });

      const response = await deps.forwardProxy(
        endpoint,
        "POST",
        body,
        [
          { Authorization: `Bearer ${config.apiKey}` },
          { Accept: "application/json" },
        ],
        Math.max(
          1,
          config.requestTimeoutSeconds || DEFAULT_AI_REQUEST_TIMEOUT_SECONDS
        ) * 1000,
        "application/json"
      );

      if (!response || response.status < 200 || response.status >= 300) {
        throw new Error(`AI 口水内容筛选请求失败（${response?.status ?? "未知状态"}）`);
      }

      let payload: any;
      try {
        payload = JSON.parse(response.body || "{}");
      } catch {
        throw new Error("AI 接口返回了无法解析的 JSON");
      }

      return extractIrrelevantParagraphIds(payload, paragraphs);
    },
  };
}

export function createAiKeyContentMarkerService(deps: {
  forwardProxy: ForwardProxyFn;
}) {
  return {
    async detectKeyContentParagraphHighlights(
      params: DetectKeyContentParagraphHighlightsParams
    ): Promise<KeyContentParagraphHighlight[]> {
      const config = normalizeAiServiceConfig(params.config);
      if (!config.enabled) {
        throw new Error("请先在设置中启用 AI 服务");
      }
      if (!isAiServiceConfigComplete(config)) {
        throw new Error("AI 服务配置不完整，请补充 Base URL、API Key 和 Model");
      }

      const paragraphs = normalizeParagraphCandidates(params.paragraphs);
      if (!paragraphs.length) {
        return [];
      }

      const endpoint = `${config.baseUrl.replace(/\/+$/u, "")}/chat/completions`;
      const body = JSON.stringify({
        model: config.model,
        messages: buildKeyContentParagraphMessages({
          documentTitle: params.documentTitle,
          paragraphs,
        }),
        max_tokens: 700,
        temperature: 0.1,
      });

      const response = await deps.forwardProxy(
        endpoint,
        "POST",
        body,
        [
          { Authorization: `Bearer ${config.apiKey}` },
          { Accept: "application/json" },
        ],
        Math.max(
          1,
          config.requestTimeoutSeconds || DEFAULT_AI_REQUEST_TIMEOUT_SECONDS
        ) * 1000,
        "application/json"
      );

      if (!response || response.status < 200 || response.status >= 300) {
        throw new Error(`AI 关键内容识别请求失败（${response?.status ?? "未知状态"}）`);
      }

      let payload: any;
      try {
        payload = JSON.parse(response.body || "{}");
      } catch {
        throw new Error("AI 接口返回了无法解析的 JSON");
      }

      return extractKeyContentParagraphHighlights(payload, paragraphs);
    },
  };
}

function normalizeParagraphCandidates(
  paragraphs: IrrelevantParagraphCandidate[]
): IrrelevantParagraphCandidate[] {
  if (!Array.isArray(paragraphs)) {
    return [];
  }
  return paragraphs
    .map((item) => ({
      id: typeof item?.id === "string" ? item.id.trim() : "",
      markdown: typeof item?.markdown === "string" ? item.markdown.trim() : "",
    }))
    .filter((item) => item.id && item.markdown);
}

function buildIrrelevantParagraphMessages(params: {
  documentTitle?: string;
  paragraphs: IrrelevantParagraphCandidate[];
}) {
  return [
    {
      role: "system",
      content: [
        "你是思源笔记的文档清理助手。",
        "请按段落颗粒度识别明显可以弱化或预删除的口水内容，例如栏目说明、空洞套话、重复导航、文末公众号/社群广告、与正文无关的推广提醒。",
        "仅在内容明显无关紧要时才标记；只要有一点不确定，就保留。",
        "不要标记标题、正文论点、事实信息、步骤、数据、结论、引用、示例。",
        "只输出 JSON，不要解释，不要 Markdown 代码块。",
        "输出格式必须是：{\"paragraphIds\":[\"p1\",\"p2\"]}",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        params.documentTitle ? `文档标题：${params.documentTitle}` : "",
        "请从下面段落中挑出应添加删除线的段落 id：",
        JSON.stringify(params.paragraphs),
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

function buildKeyContentParagraphMessages(params: {
  documentTitle?: string;
  paragraphs: IrrelevantParagraphCandidate[];
}) {
  return [
    {
      role: "system",
      content: [
        "你是思源笔记的文档重点标注助手。",
        "请从每个段落中识别最值得加粗强调的关键内容片段，例如关键概念、结论、主张、步骤名称、核心判断、重要术语。",
        "只标记段落中的局部短语，不要返回整段，不要改写原文。",
        "没有明确关键内容时返回空数组。",
        "不要输出 JSON 之外的任何解释，不要 Markdown 代码块。",
        "输出格式必须是：{\"paragraphs\":[{\"paragraphId\":\"p1\",\"highlights\":[\"关键短语1\",\"关键短语2\"]}]}",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        params.documentTitle ? `文档标题：${params.documentTitle}` : "",
        "请从下面段落中识别适合局部加粗的关键内容片段：",
        JSON.stringify(params.paragraphs),
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

function extractIrrelevantParagraphIds(
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

function extractKeyContentParagraphHighlights(
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

  if (
    typeof parsed?.paragraphId === "string" ||
    typeof parsed?.id === "string"
  ) {
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

const aiSlopMarkerService = createAiSlopMarkerService({ forwardProxy });
const aiKeyContentMarkerService = createAiKeyContentMarkerService({ forwardProxy });

export async function detectIrrelevantParagraphIds(
  params: DetectIrrelevantParagraphIdsParams
): Promise<string[]> {
  return aiSlopMarkerService.detectIrrelevantParagraphIds(params);
}

export async function detectKeyContentParagraphHighlights(
  params: DetectKeyContentParagraphHighlightsParams
): Promise<KeyContentParagraphHighlight[]> {
  return aiKeyContentMarkerService.detectKeyContentParagraphHighlights(params);
}

export type {
  AiServiceConfig,
  DetectIrrelevantParagraphIdsParams,
  DetectKeyContentParagraphHighlightsParams,
  IrrelevantParagraphCandidate,
  KeyContentParagraphHighlight,
};
