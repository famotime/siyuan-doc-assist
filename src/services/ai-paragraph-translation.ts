import {
  AiServiceConfig,
  buildAiForwardProxyHeaders,
  DEFAULT_AI_REQUEST_TIMEOUT_SECONDS,
  isAiServiceConfigComplete,
  normalizeAiServiceConfig,
} from "@/core/ai-service-config-core";
import { normalizeAiSummaryText } from "@/core/ai-summary-core";
import { createDocAssistantLogger } from "@/core/logger-core";
import { forwardProxy, ForwardProxyHeader, ForwardProxyResponse } from "@/services/kernel";
import { requestApi } from "@/services/request";
import { escapeSqlLiteral, sqlPaged } from "@/services/kernel-shared";

type ForwardProxyFn = (
  url: string,
  method?: string,
  payload?: any,
  headers?: ForwardProxyHeader[],
  timeout?: number,
  contentType?: string,
) => Promise<ForwardProxyResponse>;

export type TranslateDocParagraphsOptions = {
  config?: unknown;
  docId: string;
  forwardProxy?: ForwardProxyFn;
  onProgress?: (current: number, total: number, blockId: string) => void;
};

export type TranslateDocParagraphsReport = {
  scannedParagraphCount: number;
  translatableParagraphCount: number;
  translatedCount: number;
  failedCount: number;
  insertedCount: number;
};

type SqlDocBlockRow = {
  id: string;
  type: string;
  markdown: string;
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const TRANSLATION_SYSTEM_PROMPT = [
  "你是专业英文到中文翻译助手。",
  "只输出中文翻译，不要添加说明、标题、前言或结论。",
  "保持原文的 Markdown 行内格式和链接语义，保留代码、变量名、URL 和专有名词中不应翻译的部分。",
  "如果输入中包含多句或换行，请保持自然段落结构。",
].join("\n");

const aiParagraphTranslationLogger = createDocAssistantLogger("AiParagraphTranslation");

export async function translateDocParagraphs(
  options: TranslateDocParagraphsOptions,
): Promise<TranslateDocParagraphsReport> {
  const normalizedDocId = (options.docId || "").trim();
  if (!normalizedDocId) {
    return emptyReport();
  }

  const config = normalizeAiServiceConfig(options.config);
  if (!config.enabled) {
    throw new Error("请先在设置中启用 AI 文档功能");
  }
  if (!isAiServiceConfigComplete(config)) {
    throw new Error("AI 服务配置不完整，请补充 Base URL、API Key 和 Model");
  }

  const rows = await sqlPaged<SqlDocBlockRow>(
    `select id, type, markdown
     from blocks
     where root_id='${escapeSqlLiteral(normalizedDocId)}'
       and type='p'
     order by sort asc`,
  );
  const paragraphs = (rows || [])
    .filter((row) => row?.id && row.type === "p" && typeof row.markdown === "string")
    .map((row) => ({ blockId: row.id, markdown: stripBlockAttributes(row.markdown).trim() }))
    .filter((item) => item.markdown);
  const translatableItems = paragraphs.filter((item) => containsEnglishLetter(item.markdown));
  if (!translatableItems.length) {
    return {
      ...emptyReport(),
      scannedParagraphCount: paragraphs.length,
    };
  }

  const proxyFn = options.forwardProxy || forwardProxy;
  const translationPromises = translatableItems.map(async (item, index) => {
    options.onProgress?.(index + 1, translatableItems.length, item.blockId);
    try {
      return await requestParagraphTranslation(proxyFn, config, item.markdown);
    } catch {
      return null;
    }
  });
  const translationResults = await Promise.all(translationPromises);

  let translatedCount = 0;
  let failedCount = 0;
  let insertedCount = 0;

  for (let i = 0; i < translatableItems.length; i += 1) {
    const translation = translationResults[i];
    if (translation === null) {
      failedCount += 1;
      continue;
    }
    if (!translation) {
      continue;
    }

    translatedCount += 1;
    await requestApi("/api/block/insertBlock", {
      dataType: "markdown",
      data: translation,
      nextID: "",
      previousID: translatableItems[i].blockId,
      parentID: "",
    });
    insertedCount += 1;
  }

  return {
    scannedParagraphCount: paragraphs.length,
    translatableParagraphCount: translatableItems.length,
    translatedCount,
    failedCount,
    insertedCount,
  };
}

function emptyReport(): TranslateDocParagraphsReport {
  return {
    scannedParagraphCount: 0,
    translatableParagraphCount: 0,
    translatedCount: 0,
    failedCount: 0,
    insertedCount: 0,
  };
}

function containsEnglishLetter(markdown: string): boolean {
  return /[A-Za-z]/u.test(markdown || "");
}

function stripBlockAttributes(markdown: string): string {
  return (markdown || "")
    .split(/\r?\n/u)
    .filter((line) => !/^\s*\{:.+\}\s*$/u.test(line))
    .join("\n");
}

async function requestParagraphTranslation(
  proxyFn: ForwardProxyFn,
  config: AiServiceConfig,
  sourceMarkdown: string,
): Promise<string> {
  const endpoint = `${config.baseUrl.replace(/\/+$/u, "")}/chat/completions`;
  const messages: ChatMessage[] = [
    { role: "system", content: TRANSLATION_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        "请将下面这一段英文内容翻译为中文。",
        "只输出中文翻译，不要添加说明。",
        "原段落：",
        sourceMarkdown,
      ].join("\n\n"),
    },
  ];
  const body = JSON.stringify({
    model: config.model,
    messages,
    max_tokens: config.maxTokens,
    temperature: Math.min(config.temperature ?? 0.2, 0.3),
  });
  const timeoutMs = Math.max(
    1,
    config.requestTimeoutSeconds || DEFAULT_AI_REQUEST_TIMEOUT_SECONDS,
  ) * 1000;

  aiParagraphTranslationLogger.debug("request", {
    endpoint,
    model: config.model,
    sourceLength: sourceMarkdown.length,
    timeoutMs,
  });

  const response = await proxyFn(
    endpoint,
    "POST",
    body,
    buildAiForwardProxyHeaders(config),
    timeoutMs,
    "application/json",
  );

  aiParagraphTranslationLogger.debug("response", {
    status: response?.status,
    elapsed: response?.elapsed,
    bodyLength: response?.body?.length ?? 0,
  });

  if (!response || response.status < 200 || response.status >= 300) {
    throw new Error(`AI 段落翻译请求失败（${response?.status ?? "未知状态"}）`);
  }

  let payload: any;
  try {
    payload = JSON.parse(response.body || "{}");
  } catch {
    throw new Error("AI 接口返回了无法解析的 JSON");
  }

  return extractTextContent(payload);
}

function extractTextContent(payload: any): string {
  const message = payload?.choices?.[0]?.message;
  const content = message?.content;
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
              : "",
        )
        .join("\n"),
    );
  }
  const reasoning = message?.reasoning_content;
  if (typeof reasoning === "string") {
    return normalizeAiSummaryText(reasoning);
  }
  return "";
}
