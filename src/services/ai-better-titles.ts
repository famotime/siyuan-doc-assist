import {
  DEFAULT_AI_REQUEST_TIMEOUT_SECONDS,
  isAiServiceConfigComplete,
  normalizeAiServiceConfig,
} from "@/core/ai-service-config-core";
import {
  BetterTitlesResult,
  buildBetterTitlesMessages,
  parseBetterTitlesResponse,
} from "@/core/ai-better-titles-core";
import { createDocAssistantLogger } from "@/core/logger-core";
import { forwardProxy, ForwardProxyHeader, ForwardProxyResponse } from "@/services/kernel";

type ForwardProxyFn = (
  url: string,
  method?: string,
  payload?: any,
  headers?: ForwardProxyHeader[],
  timeout?: number,
  contentType?: string
) => Promise<ForwardProxyResponse>;

export type GenerateBetterTitlesParams = {
  config?: unknown;
  documentTitle?: string;
  content: string;
  forwardProxy?: ForwardProxyFn;
};

const logger = createDocAssistantLogger("AiBetterTitles");

function stripThinkingProcess(text: string): string {
  if (!text) {
    return "";
  }
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .trim();
}

function extractContentFromPayload(payload: any): string {
  const message = payload?.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === "string" && content.trim()) {
    return stripThinkingProcess(content.trim());
  }
  if (Array.isArray(content)) {
    const joined = content
      .map((item) =>
        typeof item?.text === "string"
          ? item.text
          : typeof item === "string"
            ? item
            : ""
      )
      .join("\n")
      .trim();
    if (joined) {
      return stripThinkingProcess(joined);
    }
  }

  const reasoning = message?.reasoning_content;
  if (typeof reasoning === "string" && reasoning.trim()) {
    return stripThinkingProcess(reasoning.trim());
  }
  return "";
}

export async function generateBetterTitles(
  params: GenerateBetterTitlesParams
): Promise<BetterTitlesResult> {
  const config = normalizeAiServiceConfig(params.config);
  if (!config.enabled) {
    throw new Error("请先在设置中启用 AI 文档功能");
  }
  if (!isAiServiceConfigComplete(config)) {
    throw new Error("AI 服务配置不完整，请补充 Base URL、API Key 和 Model");
  }

  const messages = buildBetterTitlesMessages({
    documentTitle: params.documentTitle,
    content: params.content,
  });

  const endpoint = `${config.baseUrl.replace(/\/+$/u, "")}/chat/completions`;
  const body = JSON.stringify({
    model: config.model,
    messages,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
  });

  logger.debug("request", {
    endpoint,
    model: config.model,
    contentLength: params.content.length,
    hasDocTitle: !!params.documentTitle,
  });

  const proxy = params.forwardProxy || forwardProxy;
  const response = await proxy(
    endpoint,
    "POST",
    body,
    [
      { Authorization: `Bearer ${config.apiKey}` },
      { Accept: "application/json" },
    ],
    Math.max(1, config.requestTimeoutSeconds || DEFAULT_AI_REQUEST_TIMEOUT_SECONDS) * 1000,
    "application/json"
  );

  logger.debug("response", {
    status: response?.status,
    elapsed: response?.elapsed,
    bodyLength: response?.body?.length ?? 0,
  });

  if (!response || response.status < 200 || response.status >= 300) {
    throw new Error(`AI 请求失败（状态码：${response?.status ?? "未知"}）`);
  }

  let payload: any;
  try {
    payload = JSON.parse(response.body || "{}");
  } catch {
    throw new Error("AI 接口返回了无法解析的响应数据");
  }

  const rawText = extractContentFromPayload(payload);
  if (!rawText) {
    throw new Error("AI 未返回可用的标题内容");
  }

  const result = parseBetterTitlesResponse(rawText);
  if (!result.catchy.length && !result.summary.length) {
    throw new Error("未能从 AI 响应中解析出有效的候选标题");
  }

  return result;
}
