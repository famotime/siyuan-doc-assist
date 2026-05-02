import {
  AiServiceConfig,
  DEFAULT_AI_REQUEST_TIMEOUT_SECONDS,
  isAiServiceConfigComplete,
  normalizeAiServiceConfig,
} from "@/core/ai-service-config-core";
import { normalizeAiSummaryText } from "@/core/ai-summary-core";
import { collectLocalImageAssetPathsFromMarkdown } from "@/core/image-webp-core";
import { createDocAssistantLogger } from "@/core/logger-core";
import { forwardProxy, ForwardProxyHeader, ForwardProxyResponse } from "@/services/kernel";
import { getFileBlob } from "@/services/kernel";
import { escapeSqlLiteral, sqlPaged } from "@/services/kernel-shared";

type ForwardProxyFn = (
  url: string,
  method?: string,
  payload?: any,
  headers?: ForwardProxyHeader[],
  timeout?: number,
  contentType?: string,
) => Promise<ForwardProxyResponse>;

export type RecognizeDocImagesOptions = {
  config?: unknown;
  docId: string;
  forwardProxy?: ForwardProxyFn;
  onProgress?: (current: number, total: number, assetPath: string) => void;
};

export type RecognizeDocImagesReport = {
  scannedBlockCount: number;
  scannedImageCount: number;
  recognizedCount: number;
  failedCount: number;
  insertedCount: number;
};

type SqlDocBlockRow = {
  id: string;
  markdown: string;
};

const VISION_SYSTEM_PROMPT
  = "Image text recognition assistant. Output all text from the image verbatim. If no text, reply [NO_TEXT].";

const aiOcrLogger = createDocAssistantLogger("AiImageOCR");

export async function recognizeDocImages(
  options: RecognizeDocImagesOptions,
): Promise<RecognizeDocImagesReport> {
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

  const proxyFn = options.forwardProxy || forwardProxy;

  const rows = await sqlPaged<SqlDocBlockRow>(
    `select id, markdown
     from blocks
     where root_id='${escapeSqlLiteral(normalizedDocId)}'
       and type != 'd'
     order by sort asc`,
  );
  const blocks = (rows || []).filter((row) => row?.id && typeof row.markdown === "string");
  if (!blocks.length) {
    return emptyReport();
  }

  const imageItems = collectImageItems(blocks);
  if (!imageItems.length) {
    return emptyReport();
  }

  const { requestApi: reqApi } = await import("@/services/request");

  // Phase 1: concurrent OCR requests (order doesn't matter yet)
  const ocrPromises = imageItems.map(async (item, index) => {
    options.onProgress?.(index + 1, imageItems.length, item.assetPath);
    try {
      const imageBase64 = await readAssetAsBase64(item.assetPath);
      return await requestVisionOcr(proxyFn, config, imageBase64);
    } catch {
      return null;
    }
  });
  const ocrResults = await Promise.all(ocrPromises);

  // Phase 2: sequential insertion in original image order
  let recognizedCount = 0;
  let failedCount = 0;
  let insertedCount = 0;

  for (let i = 0; i < imageItems.length; i += 1) {
    const ocrText = ocrResults[i];
    if (ocrText === null) {
      failedCount += 1;
      continue;
    }
    if (!ocrText || ocrText === "[NO_TEXT]") {
      continue;
    }

    recognizedCount += 1;
    const quoteMarkdown = buildOcrQuoteMarkdown(ocrText);
    const freshBlocks = await queryDocBlocks(normalizedDocId);
    const nextId = findNextSiblingId(freshBlocks, imageItems[i].blockId);
    if (nextId) {
      await reqApi("/api/block/insertBlock", {
        dataType: "markdown",
        data: quoteMarkdown,
        nextID: nextId,
        previousID: "",
        parentID: normalizedDocId,
      });
    } else {
      await reqApi("/api/block/appendBlock", {
        dataType: "markdown",
        data: quoteMarkdown,
        parentID: normalizedDocId,
      });
    }
    insertedCount += 1;
  }

  return {
    scannedBlockCount: blocks.length,
    scannedImageCount: imageItems.length,
    recognizedCount,
    failedCount,
    insertedCount,
  };
}

function emptyReport(): RecognizeDocImagesReport {
  return {
    scannedBlockCount: 0,
    scannedImageCount: 0,
    recognizedCount: 0,
    failedCount: 0,
    insertedCount: 0,
  };
}

type ImageItem = {
  assetPath: string;
  blockId: string;
};

function collectImageItems(blocks: SqlDocBlockRow[]): ImageItem[] {
  const items: ImageItem[] = [];
  for (const block of blocks) {
    const markdown = block.markdown || "";
    const assetPaths = collectLocalImageAssetPathsFromMarkdown(markdown);
    for (const assetPath of assetPaths) {
      items.push({ assetPath, blockId: block.id });
    }
  }
  return items;
}

async function readAssetAsBase64(assetPath: string): Promise<string> {
  const normalized = assetPath.startsWith("/") ? assetPath : `/${assetPath}`;
  const workspacePath = `/data${normalized}`;
  const blob = await getFileBlob(workspacePath);
  return blobToBase64(blob);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === "string") {
        const commaIndex = result.indexOf(",");
        resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
      } else {
        reject(new Error("无法读取图片数据"));
      }
    };
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(blob);
  });
}

async function requestVisionOcr(
  proxyFn: ForwardProxyFn,
  config: AiServiceConfig,
  imageBase64: string,
): Promise<string> {
  const endpoint = `${config.baseUrl.replace(/\/+$/u, "")}/chat/completions`;
  const body = JSON.stringify({
    model: config.model,
    messages: [
      { role: "system", content: VISION_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "请识别这张图片中的文字内容" },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        ],
      },
    ],
    max_tokens: 4096,
    temperature: 0.1,
  });

  const timeoutMs = Math.max(
    1,
    config.requestTimeoutSeconds || DEFAULT_AI_REQUEST_TIMEOUT_SECONDS,
  ) * 1000;

  aiOcrLogger.debug("vision request", {
    endpoint,
    model: config.model,
    imageBase64Length: imageBase64.length,
    timeoutMs,
  });

  const response: ForwardProxyResponse = await proxyFn(
    endpoint,
    "POST",
    body,
    [
      { Authorization: `Bearer ${config.apiKey}` },
      { Accept: "application/json" },
    ],
    timeoutMs,
    "application/json",
  );

  aiOcrLogger.debug("vision response", {
    status: response?.status,
    elapsed: response?.elapsed,
    bodyLength: response?.body?.length ?? 0,
  });

  if (!response || response.status < 200 || response.status >= 300) {
    throw new Error(`AI 图片识别请求失败（${response?.status ?? "未知状态"}）`);
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
              : "",
        )
        .join("\n"),
    );
  }
  return "";
}

async function queryDocBlocks(docId: string): Promise<SqlDocBlockRow[]> {
  const rows = await sqlPaged<SqlDocBlockRow>(
    `select id, markdown
     from blocks
     where root_id='${escapeSqlLiteral(docId)}'
       and type != 'd'
     order by sort asc`,
  );
  return (rows || []).filter((row) => row?.id && typeof row.markdown === "string");
}

function findNextSiblingId(blocks: SqlDocBlockRow[], blockId: string): string | undefined {
  for (let i = 0; i < blocks.length - 1; i += 1) {
    if (blocks[i].id === blockId) {
      return blocks[i + 1].id;
    }
  }
  return undefined;
}

function buildOcrQuoteMarkdown(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
}
