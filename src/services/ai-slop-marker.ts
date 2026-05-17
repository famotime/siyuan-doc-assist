import {
  AiServiceConfig,
  DEFAULT_AI_REQUEST_TIMEOUT_SECONDS,
  isAiServiceConfigComplete,
  normalizeAiServiceConfig,
} from "@/core/ai-service-config-core";
import { createDocAssistantLogger } from "@/core/logger-core";
import { forwardProxy, ForwardProxyHeader, ForwardProxyResponse } from "@/services/kernel";
import {
  extractIrrelevantParagraphMarks,
  extractKeyContentParagraphHighlights,
  IrrelevantParagraphMark,
  KeyContentParagraphHighlight,
} from "@/services/ai-slop-marker-parser";
import {
  buildIrrelevantParagraphMessages,
  buildKeyContentParagraphMessages,
  IrrelevantParagraphCandidate,
  IrrelevantSegmentCandidate,
  normalizeParagraphCandidates,
} from "@/services/ai-slop-marker-prompts";

type ForwardProxyFn = (
  url: string,
  method?: string,
  payload?: any,
  headers?: ForwardProxyHeader[],
  timeout?: number,
  contentType?: string
) => Promise<ForwardProxyResponse>;

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

function buildChatCompletionEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/u, "")}/chat/completions`;
}

function resolveRequestTimeoutMs(config: AiServiceConfig): number {
  return Math.max(
    1,
    config.requestTimeoutSeconds || DEFAULT_AI_REQUEST_TIMEOUT_SECONDS
  ) * 1000;
}

const aiSlopLogger = createDocAssistantLogger("AiSlopMarker");
const IRRELEVANT_PARAGRAPH_MAX_OUTPUT_TOKENS = 2048;

async function requestChatCompletion(params: {
  forwardProxy: ForwardProxyFn;
  config: AiServiceConfig;
  body: string;
  failureMessage: string;
}): Promise<any> {
  const endpoint = buildChatCompletionEndpoint(params.config.baseUrl);

  aiSlopLogger.debug("request", {
    endpoint,
    model: params.config.model,
    bodySize: params.body.length,
  });

  const response = await params.forwardProxy(
    endpoint,
    "POST",
    params.body,
    [
      { Authorization: `Bearer ${params.config.apiKey}` },
      { Accept: "application/json" },
    ],
    resolveRequestTimeoutMs(params.config),
    "application/json"
  );

  aiSlopLogger.debug("response", {
    status: response?.status,
    elapsed: response?.elapsed,
    bodyLength: response?.body?.length ?? 0,
    content: (() => {
      try {
        const parsed = JSON.parse(response?.body || "{}");
        const msg = parsed?.choices?.[0]?.message;
        return typeof msg?.content === "string" ? msg.content.slice(0, 200) : String(msg?.content)?.slice(0, 200);
      } catch {
        return "(parse error)";
      }
    })(),
    reasoning: (() => {
      try {
        const parsed = JSON.parse(response?.body || "{}");
        const msg = parsed?.choices?.[0]?.message;
        const r = msg?.reasoning_content;
        return typeof r === "string" ? r.slice(0, 200) : "(none)";
      } catch {
        return "(parse error)";
      }
    })(),
  });

  if (!response || response.status < 200 || response.status >= 300) {
    throw new Error(`${params.failureMessage}（${response?.status ?? "未知状态"}）`);
  }

  try {
    return JSON.parse(response.body || "{}");
  } catch {
    throw new Error("AI 接口返回了无法解析的 JSON");
  }
}

function resolveActiveAiConfig(configInput: unknown): AiServiceConfig {
  const config = normalizeAiServiceConfig(configInput);
  if (!config.enabled) {
    throw new Error("请先在设置中启用 AI 服务");
  }
  if (!isAiServiceConfigComplete(config)) {
    throw new Error("AI 服务配置不完整，请补充 Base URL、API Key 和 Model");
  }
  return config;
}

export function createAiSlopMarkerService(deps: {
  forwardProxy: ForwardProxyFn;
}) {
  return {
    async detectIrrelevantParagraphIds(
      params: DetectIrrelevantParagraphIdsParams
    ): Promise<string[]> {
      const marks = await this.detectIrrelevantParagraphMarks(params);
      return marks.map((item) => item.paragraphId);
    },

    async detectIrrelevantParagraphMarks(
      params: DetectIrrelevantParagraphIdsParams
    ): Promise<IrrelevantParagraphMark[]> {
      const config = resolveActiveAiConfig(params.config);
      const paragraphs = normalizeParagraphCandidates(params.paragraphs);
      if (!paragraphs.length) {
        return [];
      }
      const segments = buildIrrelevantSegmentCandidates(paragraphs);

      const payload = await requestChatCompletion({
        forwardProxy: deps.forwardProxy,
        config,
        body: JSON.stringify({
          model: config.model,
          messages: buildIrrelevantParagraphMessages({
            documentTitle: params.documentTitle,
            paragraphs,
            segments,
          }),
          max_tokens: Math.min(config.maxTokens, IRRELEVANT_PARAGRAPH_MAX_OUTPUT_TOKENS),
          temperature: config.temperature,
          response_format: { type: "json_object" },
        }),
        failureMessage: "AI 口水内容筛选请求失败",
      });

      return extractIrrelevantParagraphMarks(payload, paragraphs, segments);
    },
  };
}

function buildIrrelevantSegmentCandidates(
  paragraphs: IrrelevantParagraphCandidate[]
): IrrelevantSegmentCandidate[] {
  const segments: IrrelevantSegmentCandidate[] = [];
  for (const paragraph of paragraphs) {
    const text = stripTrailingIalLines(paragraph.markdown);
    for (const segmentText of splitParagraphIntoCandidateSegments(text)) {
      segments.push({
        id: `s${segments.length + 1}`,
        paragraphId: paragraph.id,
        text: stripMarkdownMarkersForAiSegment(segmentText),
        sourceText: segmentText,
      });
    }
  }
  return segments;
}

function stripMarkdownMarkersForAiSegment(markdown: string): string {
  return (markdown || "")
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/__([^_]+)__/gu, "$1")
    .replace(/~~([^~]+)~~/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .trim();
}

function stripTrailingIalLines(markdown: string): string {
  const lines = (markdown || "").split(/\r?\n/);
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
  return lines.join("\n").trim();
}

function splitParagraphIntoCandidateSegments(markdown: string): string[] {
  const value = (markdown || "").trim();
  if (!value) {
    return [];
  }

  const matches = value.match(/[^。！？!?；;\n]+[。！？!?；;]?/gu) || [];
  const segments = matches.map((item) => item.trim()).filter(Boolean);
  return segments.length > 0 ? segments : [value];
}

export function createAiKeyContentMarkerService(deps: {
  forwardProxy: ForwardProxyFn;
}) {
  return {
    async detectKeyContentParagraphHighlights(
      params: DetectKeyContentParagraphHighlightsParams
    ): Promise<KeyContentParagraphHighlight[]> {
      const config = resolveActiveAiConfig(params.config);
      const paragraphs = normalizeParagraphCandidates(params.paragraphs);
      if (!paragraphs.length) {
        return [];
      }
      const segments = buildIrrelevantSegmentCandidates(paragraphs);

      const payload = await requestChatCompletion({
        forwardProxy: deps.forwardProxy,
        config,
        body: JSON.stringify({
          model: config.model,
          messages: buildKeyContentParagraphMessages({
            documentTitle: params.documentTitle,
            paragraphs,
            segments,
          }),
          max_tokens: Math.min(config.maxTokens, 700),
          temperature: config.temperature,
          response_format: { type: "json_object" },
        }),
        failureMessage: "AI 关键内容识别请求失败",
      });

      return extractKeyContentParagraphHighlights(payload, paragraphs, segments);
    },
  };
}

const aiSlopMarkerService = createAiSlopMarkerService({ forwardProxy });
const aiKeyContentMarkerService = createAiKeyContentMarkerService({ forwardProxy });

export async function detectIrrelevantParagraphIds(
  params: DetectIrrelevantParagraphIdsParams
): Promise<string[]> {
  return aiSlopMarkerService.detectIrrelevantParagraphIds(params);
}

export async function detectIrrelevantParagraphMarks(
  params: DetectIrrelevantParagraphIdsParams
): Promise<IrrelevantParagraphMark[]> {
  return aiSlopMarkerService.detectIrrelevantParagraphMarks(params);
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
  IrrelevantParagraphMark,
  IrrelevantParagraphCandidate,
  KeyContentParagraphHighlight,
};
