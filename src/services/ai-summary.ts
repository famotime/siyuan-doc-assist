import {
  AiServiceConfig,
  DEFAULT_AI_REQUEST_TIMEOUT_SECONDS,
  isAiServiceConfigComplete,
  normalizeAiServiceConfig,
} from "@/core/ai-service-config-core";
import { normalizeAiSummaryText } from "@/core/ai-summary-core";
import { forwardProxy, ForwardProxyHeader, ForwardProxyResponse } from "@/services/kernel";

type ForwardProxyFn = (
  url: string,
  method?: string,
  payload?: any,
  headers?: ForwardProxyHeader[],
  timeout?: number,
  contentType?: string
) => Promise<ForwardProxyResponse>;

type GenerateDocumentSummaryParams = {
  config?: unknown;
  documentTitle?: string;
  documentMarkdown: string;
};

export function createAiSummaryService(deps: {
  forwardProxy: ForwardProxyFn;
}) {
  return {
    async generateDocumentSummary(params: GenerateDocumentSummaryParams): Promise<string> {
      const config = normalizeAiServiceConfig(params.config);
      if (!config.enabled) {
        throw new Error("请先在设置中启用 AI 文档摘要");
      }
      if (!isAiServiceConfigComplete(config)) {
        throw new Error("AI 服务配置不完整，请补充 Base URL、API Key 和 Model");
      }

      const endpoint = `${config.baseUrl.replace(/\/+$/u, "")}/chat/completions`;
      const body = JSON.stringify({
        model: config.model,
        messages: buildSummaryMessages({
          documentTitle: params.documentTitle,
          documentMarkdown: params.documentMarkdown,
        }),
        max_tokens: 240,
        temperature: 0.2,
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
        throw new Error(`AI 摘要请求失败（${response?.status ?? "未知状态"}）`);
      }

      let payload: any;
      try {
        payload = JSON.parse(response.body || "{}");
      } catch {
        throw new Error("AI 接口返回了无法解析的 JSON");
      }

      const summary = extractSummaryText(payload);
      if (!summary) {
        throw new Error("AI 未返回可用的文档摘要");
      }
      return summary;
    },
  };
}

function buildSummaryMessages(params: {
  documentTitle?: string;
  documentMarkdown: string;
}) {
  return [
    {
      role: "system",
      content:
        "你是思源笔记的文档摘要助手。请基于文档正文生成简洁中文摘要，只输出纯文本摘要，不要加标题、列表、代码块或解释。",
    },
    {
      role: "user",
      content: [
        params.documentTitle ? `文档标题：${params.documentTitle}` : "",
        "文档正文：",
        params.documentMarkdown || "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

function extractSummaryText(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return normalizeAiSummaryText(content);
  }
  if (Array.isArray(content)) {
    return normalizeAiSummaryText(
      content
        .map((item) =>
          typeof item?.text === "string"
            ? item.text
            : typeof item === "string"
              ? item
              : ""
        )
        .join("\n")
    );
  }
  return "";
}

const aiSummaryService = createAiSummaryService({ forwardProxy });

export async function generateDocumentSummary(
  params: GenerateDocumentSummaryParams
): Promise<string> {
  return aiSummaryService.generateDocumentSummary(params);
}

export type { AiServiceConfig };
