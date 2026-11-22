import {
  AiServiceConfig,
  buildAiForwardProxyHeaders,
  DEFAULT_AI_REQUEST_TIMEOUT_SECONDS,
  isAiServiceConfigComplete,
  normalizeAiServiceConfig
} from "@/core/ai-service-config-core";
import { normalizeAiSummaryText } from "@/core/ai-summary-core";
import { DEFAULT_MAP_CONCURRENCY, mapWithConcurrency } from "@/core/map-with-concurrency";
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
  contentType?: string
) => Promise<ForwardProxyResponse>;

export type TranslateDocParagraphsOptions = {
  config?: unknown;
  docId: string;
  forwardProxy?: ForwardProxyFn;
  onProgress?: (current: number, total: number, blockId: string) => void;
  /** 并发请求数上限，缺省 {@link DEFAULT_MAP_CONCURRENCY}（审计遗留项 2.4） */
  concurrency?: number;
};

export type TranslateDocParagraphsReport = {
  scannedParagraphCount: number;
  translatableParagraphCount: number;
  skippedCount: number;
  translatedCount: number;
  failedCount: number;
  insertedCount: number;
};

export const TRANSLATION_BLOCK_ATTR = "custom-doc-assist-trans";

type SqlDocBlockRow = {
  id: string;
  type: string;
  subtype?: string;
  markdown: string;
  ial?: string;
};

type TranslatableBlockCandidate = {
  blockId: string;
  type: "p" | "h";
  headingLevel: number;
  sourceText: string;
  hasTransAttr: boolean;
};

type TranslatableBlockItem = {
  blockId: string;
  type: "p" | "h";
  headingLevel: number;
  sourceText: string;
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const TRANSLATION_SYSTEM_PROMPT = [
  "你是专业英文到中文翻译助手。",
  "只输出中文翻译，不要添加说明、标题、前言或结论。",
  "保持原文的 Markdown 行内格式和链接语义，保留代码、变量名、URL 和专有名词中不应翻译的部分。",
  "如果输入中包含多句或换行，请保持自然段落结构。"
].join("\n");

const aiParagraphTranslationLogger = createDocAssistantLogger("AiParagraphTranslation");

export async function translateDocParagraphs(
  options: TranslateDocParagraphsOptions
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
    `select id, type, subtype, markdown, ial
     from blocks
     where root_id='${escapeSqlLiteral(normalizedDocId)}'
       and type in ('p', 'h')
     order by sort asc`
  );
  const scannedBlocks = (rows || [])
    .filter(
      (row) =>
        row?.id &&
        (row.type === "p" || row.type === "h") &&
        typeof row.markdown === "string"
    )
    .map((row): TranslatableBlockCandidate | null => {
      const cleanMd = stripBlockAttributes(row.markdown).trim();
      if (!cleanMd) {
        return null;
      }
      const hasTransAttr = hasTranslationAttribute(row.ial, row.markdown);
      if (row.type === "h") {
        const headingLevel = getHeadingLevel(cleanMd, row.subtype);
        const headingText = extractHeadingContent(cleanMd);
        if (!headingText) {
          return null;
        }
        return {
          blockId: row.id,
          type: "h",
          headingLevel,
          sourceText: headingText,
          hasTransAttr
        };
      }
      return {
        blockId: row.id,
        type: "p",
        headingLevel: 0,
        sourceText: cleanMd,
        hasTransAttr
      };
    })
    .filter((item): item is TranslatableBlockCandidate => item !== null);

  const translatableItems: TranslatableBlockItem[] = [];
  let skippedCount = 0;
  const pairedTranslationBlockIds = new Set<string>();

  for (let i = 0; i < scannedBlocks.length; i += 1) {
    const current = scannedBlocks[i];

    // 如果当前块本身带有已翻译属性，或者在前序已被识别为上一英文块的译文块，则跳过
    if (current.hasTransAttr || pairedTranslationBlockIds.has(current.blockId)) {
      continue;
    }

    // 若当前块不包含英文字母，无需翻译，跳过
    if (!containsEnglishLetter(current.sourceText)) {
      continue;
    }

    // 检查紧随其后的下一个块是否为译文块（断点续译跳过）
    const next = scannedBlocks[i + 1];
    if (next && isProbableTranslationBlock(current, next)) {
      skippedCount += 1;
      pairedTranslationBlockIds.add(next.blockId);
      continue;
    }

    translatableItems.push({
      blockId: current.blockId,
      type: current.type,
      headingLevel: current.headingLevel,
      sourceText: current.sourceText
    });
  }

  if (!translatableItems.length) {
    return {
      ...emptyReport(),
      scannedParagraphCount: scannedBlocks.length,
      skippedCount
    };
  }

  const proxyFn = options.forwardProxy || forwardProxy;
  // Bounded concurrency; results stay in input order for the insert loop below.
  // Progress reflects completed requests instead of request starts.
  let completedRequests = 0;
  const translationResults = await mapWithConcurrency(
    translatableItems,
    options.concurrency ?? DEFAULT_MAP_CONCURRENCY,
    async (item) => {
      try {
        return await requestParagraphTranslation(proxyFn, config, item.sourceText);
      } catch {
        return null;
      } finally {
        completedRequests += 1;
        options.onProgress?.(completedRequests, translatableItems.length, item.blockId);
      }
    }
  );

  let translatedCount = 0;
  let failedCount = 0;
  let insertedCount = 0;

  for (let i = 0; i < translatableItems.length; i += 1) {
    const item = translatableItems[i];
    const translation = translationResults[i];
    if (translation === null) {
      failedCount += 1;
      continue;
    }
    if (!translation) {
      continue;
    }

    translatedCount += 1;
    const insertData = item.type === "h" ?
        formatHeadingTranslation(translation, item.headingLevel) :
        formatParagraphTranslation(translation);

    try {
      await requestApi("/api/block/insertBlock", {
        dataType: "markdown",
        data: insertData,
        nextID: "",
        previousID: item.blockId,
        parentID: ""
      });
      insertedCount += 1;
    } catch (error) {
      failedCount += 1;
      aiParagraphTranslationLogger.warn("insert translation failed", {
        blockId: item.blockId,
        error
      });
    }
  }

  return {
    scannedParagraphCount: scannedBlocks.length,
    translatableParagraphCount: translatableItems.length,
    skippedCount,
    translatedCount,
    failedCount,
    insertedCount
  };
}

function emptyReport(): TranslateDocParagraphsReport {
  return {
    scannedParagraphCount: 0,
    translatableParagraphCount: 0,
    skippedCount: 0,
    translatedCount: 0,
    failedCount: 0,
    insertedCount: 0
  };
}

function containsEnglishLetter(markdown: string): boolean {
  return /[A-Za-z]/u.test(markdown || "");
}

function stripBlockAttributes(markdown: string): string {
  return (markdown || "")
    .split(/\r?\n/u)
    .filter((line) => !/^\s*\{:[^}]*\}\s*$/u.test(line))
    .map((line) => line.replace(/\s*\{:[^}]*\}\s*/gu, ""))
    .join("\n");
}

function getHeadingLevel(markdown: string, subtype?: string): number {
  const match = (markdown || "").match(/^(#{1,6})\s+/u);
  if (match) {
    return match[1].length;
  }
  const subMatch = (subtype || "").match(/^h([1-6])$/i);
  if (subMatch) {
    return Number(subMatch[1]);
  }
  return 1;
}

function extractHeadingContent(markdown: string): string {
  return (markdown || "").replace(/^#{1,6}\s+/u, "").trim();
}

function formatParagraphTranslation(translation: string): string {
  const cleaned = translation.trim();
  return `${cleaned}\n{: ${TRANSLATION_BLOCK_ATTR}="true"}`;
}

function formatHeadingTranslation(translation: string, level: number): string {
  const cleaned = translation
    .replace(/^#{1,6}\s*/u, "")
    .replace(/\r?\n+/gu, " ")
    .trim();
  const safeLevel = Math.max(1, Math.min(6, level));
  return `${"#".repeat(safeLevel)} ${cleaned}\n{: ${TRANSLATION_BLOCK_ATTR}="true"}`;
}

function hasTranslationAttribute(ial?: string, markdown?: string): boolean {
  if (ial && /custom-doc-assist-trans(?:=["']true["'])?/i.test(ial)) {
    return true;
  }
  if (
    markdown &&
    /\{:[^}]*custom-doc-assist-trans[^}]*\}/i.test(markdown)
  ) {
    return true;
  }
  return false;
}

function hasChineseCharacters(text: string): boolean {
  return /[\u4E00-\u9FA5]/u.test(text || "");
}

function isProbableTranslationBlock(
  source: TranslatableBlockCandidate,
  target: TranslatableBlockCandidate
): boolean {
  // 1. 优先检测专属自定义块属性
  if (target.hasTransAttr) {
    return true;
  }
  // 2. 兜底判定：块类型/层级必须一致
  if (source.type !== target.type) {
    return false;
  }
  if (source.type === "h" && source.headingLevel !== target.headingLevel) {
    return false;
  }
  // 3. 语言特征：必须包含中文且非纯英文
  return hasChineseCharacters(target.sourceText);
}

async function requestParagraphTranslation(
  proxyFn: ForwardProxyFn,
  config: AiServiceConfig,
  sourceMarkdown: string
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
        sourceMarkdown
      ].join("\n\n")
    }
  ];
  const body = JSON.stringify({
    model: config.model,
    messages,
    max_tokens: config.maxTokens,
    temperature: Math.min(config.temperature ?? 0.2, 0.3)
  });
  const timeoutMs = Math.max(
    1,
    config.requestTimeoutSeconds || DEFAULT_AI_REQUEST_TIMEOUT_SECONDS
  ) * 1000;

  aiParagraphTranslationLogger.debug("request", {
    endpoint,
    model: config.model,
    sourceLength: sourceMarkdown.length,
    timeoutMs
  });

  const response = await proxyFn(
    endpoint,
    "POST",
    body,
    buildAiForwardProxyHeaders(config),
    timeoutMs,
    "application/json"
  );

  aiParagraphTranslationLogger.debug("response", {
    status: response?.status,
    elapsed: response?.elapsed,
    bodyLength: response?.body?.length ?? 0
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
          typeof item?.text === "string" ?
            item.text :
            typeof item === "string" ?
              item :
              ""
        )
        .join("\n")
    );
  }
  const reasoning = message?.reasoning_content;
  if (typeof reasoning === "string") {
    return normalizeAiSummaryText(reasoning);
  }
  return "";
}
