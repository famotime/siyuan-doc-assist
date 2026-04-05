import {
  AiServiceConfig,
  DEFAULT_AI_REQUEST_TIMEOUT_SECONDS,
  isAiServiceConfigComplete,
  normalizeAiServiceConfig,
} from "@/core/ai-service-config-core";
import { normalizeAiSummaryText } from "@/core/ai-summary-core";
import { forwardProxy, ForwardProxyHeader, ForwardProxyResponse } from "@/services/kernel";
import { NetworkLensDocumentSummary } from "@/services/network-lens-ai-index";

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
  documentId?: string;
  documentTitle?: string;
  documentUpdatedAt?: string;
  documentMarkdown: string;
  loadFreshDocumentSummary?: (params: {
    documentId: string;
    documentUpdatedAt: string;
  }) => Promise<NetworkLensDocumentSummary | null>;
};

type GenerateDocumentConceptMapParams = {
  config?: unknown;
  documentTitle?: string;
  documentMarkdown: string;
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function createAiSummaryService(deps: {
  forwardProxy: ForwardProxyFn;
  loadFreshDocumentSummary?: (params: {
    documentId: string;
    documentUpdatedAt: string;
  }) => Promise<NetworkLensDocumentSummary | null>;
}) {
  return {
    async generateDocumentSummary(params: GenerateDocumentSummaryParams): Promise<string> {
      const indexedSummary = await loadFreshDocumentSummary(deps, params);
      if (indexedSummary) {
        return indexedSummary.summaryShort;
      }

      return requestChatCompletionText(deps.forwardProxy, {
        config: params.config,
        disabledMessage: "请先在设置中启用 AI 文档摘要",
        failureMessage: "AI 摘要请求失败",
        emptyMessage: "AI 未返回可用的文档摘要",
        maxTokens: 240,
        temperature: 0.2,
        messages: buildSummaryMessages({
          documentTitle: params.documentTitle,
          documentMarkdown: params.documentMarkdown,
        }),
      });
    },

    async generateDocumentConceptMap(
      params: GenerateDocumentConceptMapParams
    ): Promise<string> {
      return requestChatCompletionText(deps.forwardProxy, {
        config: params.config,
        disabledMessage: "请先在设置中启用 AI 文档功能",
        failureMessage: "AI 概念地图请求失败",
        emptyMessage: "AI 未返回可用的概念地图",
        maxTokens: 2200,
        temperature: 0.2,
        messages: buildConceptMapMessages({
          documentTitle: params.documentTitle,
          documentMarkdown: params.documentMarkdown,
        }),
      });
    },
  };
}

async function loadFreshDocumentSummary(
  deps: {
    loadFreshDocumentSummary?: (params: {
      documentId: string;
      documentUpdatedAt: string;
    }) => Promise<NetworkLensDocumentSummary | null>;
  },
  params: GenerateDocumentSummaryParams
): Promise<NetworkLensDocumentSummary | null> {
  const loader = params.loadFreshDocumentSummary || deps.loadFreshDocumentSummary;
  if (!loader || !params.documentId || !params.documentUpdatedAt) {
    return null;
  }

  try {
    return await loader({
      documentId: params.documentId,
      documentUpdatedAt: params.documentUpdatedAt,
    });
  } catch {
    return null;
  }
}

async function requestChatCompletionText(
  forwardProxyFn: ForwardProxyFn,
  params: {
    config?: unknown;
    disabledMessage: string;
    failureMessage: string;
    emptyMessage: string;
    maxTokens: number;
    temperature: number;
    messages: ChatMessage[];
  }
): Promise<string> {
  const config = normalizeAiServiceConfig(params.config);
  if (!config.enabled) {
    throw new Error(params.disabledMessage);
  }
  if (!isAiServiceConfigComplete(config)) {
    throw new Error("AI 服务配置不完整，请补充 Base URL、API Key 和 Model");
  }

  const endpoint = `${config.baseUrl.replace(/\/+$/u, "")}/chat/completions`;
  const body = JSON.stringify({
    model: config.model,
    messages: params.messages,
    max_tokens: params.maxTokens,
    temperature: params.temperature,
  });

  const response = await forwardProxyFn(
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
    throw new Error(`${params.failureMessage}（${response?.status ?? "未知状态"}）`);
  }

  let payload: any;
  try {
    payload = JSON.parse(response.body || "{}");
  } catch {
    throw new Error("AI 接口返回了无法解析的 JSON");
  }

  const text = extractTextContent(payload);
  if (!text) {
    throw new Error(params.emptyMessage);
  }
  return text;
}

function buildSummaryMessages(params: {
  documentTitle?: string;
  documentMarkdown: string;
}): ChatMessage[] {
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

function buildConceptMapMessages(params: {
  documentTitle?: string;
  documentMarkdown: string;
}): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "你是思源笔记的概念地图助手。请基于文档内容识别并聚焦最突出的核心主题，生成该主题的概念地图。输出必须是层次化的 Markdown 列表，所有内容均为列表项和列表项说明，没有标题和普通正文段落。整体结构需遵循“总-分-细节”层次，最多5层。同级概念按重要性或逻辑顺序排列。每个列表项都要包含一个简短的概念或关键点（不超过15字）以及详细说明（20-100字）。说明需提炼总结，避免直接摘录大段原文。要求非常详尽地列出层次化概念要点，不要遗漏。",
    },
    {
      role: "user",
      content: [
        "基于当前资料库文档，识别并聚焦最突出的核心主题，生成该主题的概念地图。",
        "输出形式为层次化的 markdown 列表，每个列表项包含一个简短的概念或关键点（不超过15字）以及详细说明（20-100字）。",
        "所有内容均为列表项和列表项说明，没有标题和普通正文段落，整体结构需遵循'总-分-细节'层次（最多5层）。",
        params.documentTitle ? `文档标题：${params.documentTitle}` : "",
        "文档正文：",
        params.documentMarkdown || "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

function extractTextContent(payload: any): string {
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

export async function generateDocumentSummary(
  params: GenerateDocumentSummaryParams
): Promise<string> {
  return createAiSummaryService({
    forwardProxy,
    loadFreshDocumentSummary: params.loadFreshDocumentSummary,
  }).generateDocumentSummary(params);
}

export async function generateDocumentConceptMap(
  params: GenerateDocumentConceptMapParams
): Promise<string> {
  return createAiSummaryService({
    forwardProxy,
  }).generateDocumentConceptMap(params);
}

export type { AiServiceConfig };
