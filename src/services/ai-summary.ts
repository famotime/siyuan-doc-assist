import {
  AiServiceConfig,
  DEFAULT_AI_REQUEST_TIMEOUT_SECONDS,
  isAiServiceConfigComplete,
  normalizeAiServiceConfig,
} from "@/core/ai-service-config-core";
import { normalizeAiSummaryText } from "@/core/ai-summary-core";
import { createDocAssistantLogger } from "@/core/logger-core";
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
  relatedDocuments?: Array<{ title: string; markdown: string }>;
};

type GenerateCanvasOutlineParams = {
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
        messages: buildConceptMapMessages({
          documentTitle: params.documentTitle,
          documentMarkdown: params.documentMarkdown,
          relatedDocuments: params.relatedDocuments,
        }),
      });
    },

    async generateCanvasOutline(
      params: GenerateCanvasOutlineParams
    ): Promise<string> {
      return requestChatCompletionText(deps.forwardProxy, {
        config: params.config,
        disabledMessage: "请先在设置中启用 AI 文档功能",
        failureMessage: "AI 画布大纲请求失败",
        emptyMessage: "AI 未返回可用的画布大纲",
        messages: buildCanvasOutlineMessages({
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

const aiSummaryLogger = createDocAssistantLogger("AiSummary");

async function requestChatCompletionText(
  forwardProxyFn: ForwardProxyFn,
  params: {
    config?: unknown;
    disabledMessage: string;
    failureMessage: string;
    emptyMessage: string;
    maxTokens?: number;
    temperature?: number;
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
    max_tokens: params.maxTokens ?? config.maxTokens,
    temperature: params.temperature ?? config.temperature,
  });

  aiSummaryLogger.debug("request", {
    endpoint,
    model: config.model,
    messageCount: params.messages.length,
    maxTokens: params.maxTokens,
    userContentLength: params.messages.find((m) => m.role === "user")?.content?.length ?? 0,
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

  const responseBodyPreview = (response?.body ?? "").slice(0, 500);
  aiSummaryLogger.debug("response", {
    status: response?.status,
    elapsed: response?.elapsed,
    bodyLength: response?.body?.length ?? 0,
    bodyPreview: responseBodyPreview,
  });

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
    aiSummaryLogger.warn("empty extraction", {
      hasChoices: Array.isArray(payload?.choices),
      choiceCount: payload?.choices?.length ?? 0,
      contentType: typeof payload?.choices?.[0]?.message?.content,
      contentPreview: JSON.stringify(payload?.choices?.[0]?.message?.content)?.slice(0, 200),
      finishReason: payload?.choices?.[0]?.finish_reason,
    });
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
  relatedDocuments?: Array<{ title: string; markdown: string }>;
}): ChatMessage[] {
  const hasRelated = !!params.relatedDocuments && params.relatedDocuments.length > 0;
  const relatedSection = hasRelated
    ? "\n\n=== 关联文档 ===\n\n"
      + params.relatedDocuments!
        .map((doc) => `--- 文档：${doc.title} ---\n${doc.markdown}`)
        .join("\n\n")
    : "";

  return [
    {
      role: "system",
      content:
        "你是思源笔记的概念地图助手。请基于文档内容识别并聚焦最突出的核心主题，生成该主题的概念地图。输出必须是层次化的 Markdown 列表，所有内容均为列表项和列表项说明，没有标题和普通正文段落。整体结构需遵循“总-分-细节”层次，最多5层。同级概念按重要性或逻辑顺序排列。每个列表项都要包含一个简短的概念或关键点（不超过15字）以及详细说明（20-100字）。说明需提炼总结，避免直接摘录大段原文。要求非常详尽地列出层次化概念要点，不要遗漏。"
        + (hasRelated
          ? "如果有相关文档内容，请一并纳入分析，综合提炼跨文档的层次化概念关系。当前文档是核心，相关文档提供补充视角。"
          : ""),
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
        relatedSection || "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

function extractTextContent(payload: any): string {
  const message = payload?.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === "string" && content.trim()) {
    return stripThinkingProcess(normalizeAiSummaryText(content));
  }
  if (Array.isArray(content)) {
    const joined = normalizeAiSummaryText(
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
    if (joined) {
      return stripThinkingProcess(joined);
    }
  }

  const reasoning = message?.reasoning_content;
  if (typeof reasoning === "string" && reasoning.trim()) {
    return stripThinkingProcess(normalizeAiSummaryText(reasoning));
  }
  return "";
}

function stripThinkingProcess(text: string): string {
  if (!text) {
    return "";
  }
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .trim();
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

function buildCanvasOutlineMessages(params: {
  documentTitle?: string;
  documentMarkdown: string;
}): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "你是思源笔记的画布大纲生成助手。请基于用户提供的内容，总结提炼出核心主题以及分支概念，生成一份用于制作可视化 Canvas 画布的大纲。\n"
        + "大纲必须使用标准的 Markdown 标题层级格式（使用 #, ##, ### 等表达概念间的从属和发散关系，最多4层）。\n"
        + "每一个标题下方，都可以跟上 1-2 句（不超过100字）的简短描述或正文。\n"
        + "只输出上述标准的 Markdown 文本，不要带有任何包围的说明、反引号（除代码块外）或引言。",
    },
    {
      role: "user",
      content: [
        "基于以下内容，提炼并生成概念大纲，准备用于生成 Canvas 画布：",
        params.documentTitle ? `文档标题：${params.documentTitle}` : "",
        "输入正文：",
        params.documentMarkdown || "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

export async function generateCanvasOutline(
  params: GenerateCanvasOutlineParams
): Promise<string> {
  return createAiSummaryService({
    forwardProxy,
  }).generateCanvasOutline(params);
}

export type GenerateDocumentTagSuggestionsParams = {
  config?: unknown;
  documentTitle?: string;
  documentMarkdown: string;
};

export async function generateDocumentTagSuggestions(
  params: GenerateDocumentTagSuggestionsParams
): Promise<string[]> {
  const config = normalizeAiServiceConfig(params.config);
  if (!config.enabled || !isAiServiceConfigComplete(config)) {
    console.log("[DocAssistant][AiRelated][Fallback] generateDocumentTagSuggestions 校验未通过:", {
      enabled: config.enabled,
      hasBaseUrl: Boolean(config.baseUrl),
      hasApiKey: Boolean(config.apiKey),
      hasModel: Boolean(config.model),
    });
    return [];
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "你是专业的文档标签提取助手。请基于文档标题和正文，提炼出 3-5 个最准确、简短的主题标签（每个标签 2-8 个字）。"
        + "必须仅输出 JSON 字符串数组格式，例如 [\"标签1\", \"标签2\", \"标签3\"]，不要包含 Markdown 标记、代码块或任何解释文字。",
    },
    {
      role: "user",
      content: [
        params.documentTitle ? `文档标题：${params.documentTitle}` : "",
        "文档正文：",
        params.documentMarkdown ? params.documentMarkdown.slice(0, 2000) : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];

  try {
    const text = await requestChatCompletionText(forwardProxy, {
      config,
      disabledMessage: "AI 未启用",
      failureMessage: "AI 标签推荐失败",
      emptyMessage: "AI 未返回标签",
      maxTokens: config.maxTokens,
      temperature: 0.3,
      messages,
    });
    const parsed = parseTagsFromAiResponse(text);
    console.log("[DocAssistant][AiRelated][Fallback] AI 标签推荐请求成功，解析结果:", parsed);
    return parsed;
  } catch (error) {
    console.warn("[DocAssistant][AiRelated][Fallback] AI 标签推荐请求失败，异常信息:", error);
    return [];
  }
}

export function parseTagsFromAiResponse(text: string): string[] {
  if (!text || typeof text !== "string" || !text.trim()) {
    return [];
  }

  const raw = text.trim();

  // 策略 1：解析标准 JSON 数组或包含在 Markdown 代码块中的 JSON 数组
  try {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start >= 0 && end > start) {
      const jsonStr = raw.slice(start, end + 1);
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        const items = parsed
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => sanitizeTagItem(item))
          .filter((tag) => !isMetaThinkingNoise(tag));
        if (items.length) {
          return Array.from(new Set(items));
        }
      }
    }
  } catch {
    // 忽略 JSON 解析失败，继续走文本解构
  }

  // 策略 2：按行解析 (支持 "1. 卡车司机：核心叙事", "- 自由与代价", "• 阶层固化" 等有序/无序列表)
  const lines = raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsedFromLines: string[] = [];
  for (const line of lines) {
    const cleanedLine = line
      .replace(/^[\d.、\-*•#]+\s*/u, "")
      .replace(/^标签\d*[:：]\s*/u, "")
      .replace(/["'“”‘’《》【】\[\]]/gu, " ")
      .trim();

    if (!cleanedLine) {
      continue;
    }

    const mainTerm = cleanedLine.split(/[:：—\-]/u)[0]?.trim() || cleanedLine;
    const subTerms = mainTerm.split(/[,，、;]/u).map((s) => sanitizeTagItem(s)).filter(Boolean);
    for (const sub of subTerms) {
      if (!isMetaThinkingNoise(sub)) {
        parsedFromLines.push(sub);
      }
    }
  }

  if (parsedFromLines.length) {
    return Array.from(new Set(parsedFromLines)).slice(0, 5);
  }

  // 策略 3：按顿号/逗号/井号分隔符切分 (如 "卡车司机、自由与代价、阶层固化")
  const splitItems = raw
    .split(/[,，、;\s#]+/u)
    .map((item) => sanitizeTagItem(item))
    .filter((tag) => !isMetaThinkingNoise(tag));

  return Array.from(new Set(splitItems)).slice(0, 5);
}

const META_THINKING_PATTERNS = [
  /^用户/u,
  /^思考/u,
  /^分析/u,
  /^需要/u,
  /^根据/u,
  /^首先/u,
  /^总结/u,
  /^提示/u,
  /^以下是/u,
  /^标签推荐/u,
  /思考过程/u,
  /提取[\d\-\s]*个/u,
  /主题标签/u,
  /核心主题/u,
  /核心.*点/u,
  /讨论/u,
  /调整/u,
  /等下/u,
  /试试/u,
];

function isMetaThinkingNoise(tag: string): boolean {
  if (!tag || tag.length < 2 || tag.length > 15) {
    return true;
  }
  if (/[。！？\?!]/u.test(tag)) {
    return true;
  }
  for (const pattern of META_THINKING_PATTERNS) {
    if (pattern.test(tag)) {
      return true;
    }
  }
  return false;
}

function sanitizeTagItem(item: string): string {
  return item
    .replace(/^#+\s*/u, "")
    .replace(/["'“”‘’《》【】\[\]]/gu, "")
    .trim();
}

export type { AiServiceConfig };

