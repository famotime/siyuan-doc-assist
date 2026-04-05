import {
  AiServiceConfig,
  DEFAULT_AI_REQUEST_TIMEOUT_SECONDS,
  isAiServiceConfigComplete,
  normalizeAiServiceConfig,
} from "@/core/ai-service-config-core";
import { forwardProxy, ForwardProxyHeader, ForwardProxyResponse } from "@/services/kernel";
import {
  extractIrrelevantParagraphIds,
  extractKeyContentParagraphHighlights,
  KeyContentParagraphHighlight,
} from "@/services/ai-slop-marker-parser";
import {
  buildIrrelevantParagraphMessages,
  buildKeyContentParagraphMessages,
  IrrelevantParagraphCandidate,
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

async function requestChatCompletion(params: {
  forwardProxy: ForwardProxyFn;
  config: AiServiceConfig;
  body: string;
  failureMessage: string;
}): Promise<any> {
  const response = await params.forwardProxy(
    buildChatCompletionEndpoint(params.config.baseUrl),
    "POST",
    params.body,
    [
      { Authorization: `Bearer ${params.config.apiKey}` },
      { Accept: "application/json" },
    ],
    resolveRequestTimeoutMs(params.config),
    "application/json"
  );

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
      const config = resolveActiveAiConfig(params.config);
      const paragraphs = normalizeParagraphCandidates(params.paragraphs);
      if (!paragraphs.length) {
        return [];
      }

      const payload = await requestChatCompletion({
        forwardProxy: deps.forwardProxy,
        config,
        body: JSON.stringify({
          model: config.model,
          messages: buildIrrelevantParagraphMessages({
            documentTitle: params.documentTitle,
            paragraphs,
          }),
          max_tokens: 400,
          temperature: 0.1,
        }),
        failureMessage: "AI 口水内容筛选请求失败",
      });

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
      const config = resolveActiveAiConfig(params.config);
      const paragraphs = normalizeParagraphCandidates(params.paragraphs);
      if (!paragraphs.length) {
        return [];
      }

      const payload = await requestChatCompletion({
        forwardProxy: deps.forwardProxy,
        config,
        body: JSON.stringify({
          model: config.model,
          messages: buildKeyContentParagraphMessages({
            documentTitle: params.documentTitle,
            paragraphs,
          }),
          max_tokens: 700,
          temperature: 0.1,
        }),
        failureMessage: "AI 关键内容识别请求失败",
      });

      return extractKeyContentParagraphHighlights(payload, paragraphs);
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
