/**
 * 网页链接转思源文档核心纯逻辑（聚合出口）
 * 负责链接提取与清洗、剪藏文档组装与兄弟路径计算；
 * X 帖子解析见 `x-post-core.ts`，网页 HTML 采集见 `web-article-html-core.ts`，
 * 共享标题清洗与元数据类型见 `web-clip-shared-core.ts`。
 */

export type WebLinkItem = {
  /** 规范化后的完整链接（已去除追踪参数） */
  url: string;
  /** 原始链接 */
  originalUrl: string;
  /** 提取自 Markdown 链接语法的候选标题（如 [标题](url)） */
  fallbackTitle?: string;
};

import type { WebArticleMeta } from "./web-clip-shared-core";

// 聚合导出：保持历史导入路径 `@/core/link-to-doc-core` 的全部符号可用
export {
  sanitizeDocTitle,
  type WebArticleMeta,
} from "./web-clip-shared-core";
export {
  extractXPostId,
  isXPostUrl,
  extractXFirstParagraphTitle,
  parseVxTwitterResponse,
  parseFxTwitterResponse,
  mergeXPostData,
  renderXArticleToMarkdown,
  formatXPostMarkdown,
  type XArticleBlock,
  type XArticleEntity,
  type XArticleData,
  type ParsedXPost,
} from "./x-post-core";
export {
  extractWechatOriginalLink,
  extractWebMetadataFromHtml,
  cleanAndConvertHtmlToMarkdown,
  domNodeToMarkdown,
} from "./web-article-html-core";

/** 常见追踪参数（与参考脚本一致） */
const TRACKING_PARAMS = new Set([
  "from",
  "fbclid",
  "gclid",
  "ref",
  "ref_src",
  "spm",
  "source",
  "wid",
  "timestamp",
  "req_id",
  "req_id_new",
  "share_did",
  "share_uid",
  "share_token",
  "use_new_style",
]);

/** 常见追踪参数前缀 */
const TRACKING_PREFIXES = ["utm_"];

/**
 * 规范化 Web URL：
 * 1. 去除前后空白与末尾标点
 * 2. 过滤常见追踪参数（utm_*, from, spm 等）
 * 3. 规范化协议和主机名
 */
export function normalizeWebUrl(rawUrl: string): string {
  const trimmed = (rawUrl || "").trim().replace(/[).,;?!。，；？！\]]+$/u, "");
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    // 只处理 http 和 https
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return trimmed;
    }

    const filteredParams = new URLSearchParams();
    parsed.searchParams.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (TRACKING_PARAMS.has(lowerKey)) {
        return;
      }
      if (TRACKING_PREFIXES.some((prefix) => lowerKey.startsWith(prefix))) {
        return;
      }
      filteredParams.append(key, value);
    });

    const queryString = filteredParams.toString();
    parsed.search = queryString ? `?${queryString}` : "";
    // 移除 hash 锚点（针对剪藏网页内容，页面锚点通常不需要）
    parsed.hash = "";

    let finalUrl = parsed.toString();
    // 如果不是纯根路径，去除末尾的斜杠
    if (parsed.pathname !== "/" && finalUrl.endsWith("/")) {
      finalUrl = finalUrl.slice(0, -1);
    }
    return finalUrl;
  } catch {
    return trimmed;
  }
}

/**
 * 从 Markdown 文本中提取所有外部网页链接
 * 支持：
 * 1. 标准 Markdown 链接：`[标题](https://...)`
 * 2. 纯文本 URL：`https://...`
 * 3. 保序去重，过滤思源内部链接及本地地址
 */
export function extractWebLinksFromMarkdown(markdown: string): WebLinkItem[] {
  if (!markdown) {
    return [];
  }

  const results: WebLinkItem[] = [];
  const seenUrls = new Set<string>();

  // 1. 优先提取标准 Markdown 链接 `[文本](https://...)`，保留文本作为 fallbackTitle
  const mdLinkRegex = /\[([^\]]+)\]\(((?:https?:\/\/)[^\s<>)\]]+)\)/gi;
  let match: RegExpExecArray | null;

  while ((match = mdLinkRegex.exec(markdown)) !== null) {
    const rawLabel = (match[1] || "").trim();
    const rawUrl = match[2] || "";
    const normalized = normalizeWebUrl(rawUrl);
    if (isValidExternalHttpUrl(normalized) && !seenUrls.has(normalized)) {
      seenUrls.add(normalized);
      results.push({
        url: normalized,
        originalUrl: rawUrl,
        fallbackTitle: rawLabel && !rawLabel.startsWith("http") ? rawLabel : undefined,
      });
    }
  }

  // 2. 提取文本中直接出现的裸 URL
  const rawUrlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
  while ((match = rawUrlRegex.exec(markdown)) !== null) {
    const rawUrl = match[0] || "";
    const normalized = normalizeWebUrl(rawUrl);
    if (isValidExternalHttpUrl(normalized) && !seenUrls.has(normalized)) {
      seenUrls.add(normalized);
      results.push({
        url: normalized,
        originalUrl: rawUrl,
      });
    }
  }

  return results;
}

/**
 * 判断是否为有效的外部 HTTP/HTTPS 链接（排除思源协议及本地回环地址）
 */
function isValidExternalHttpUrl(url: string): boolean {
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    return false;
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * 格式化当前时间为 YYYY-MM-DD HH:mm:ss
 */
function formatCurrentTime(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const date = pad(now.getDate());
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());
  return `${year}-${month}-${date} ${hours}:${minutes}:${seconds}`;
}

/**
 * 按照规范构建剪藏笔记文档（元数据头 + 分割线 + 正文）
 */
export function buildClippedMarkdownDocument(
  meta: WebArticleMeta,
  contentMarkdown: string
): string {
  const metadataLines: string[] = [
    `**原始链接：** [${meta.url}](${meta.url})`,
    `**保存时间：** ${formatCurrentTime()}`,
  ];

  if (meta.author) {
    metadataLines.push(`**作者：** ${meta.author}`);
  }
  if (meta.publishTime) {
    metadataLines.push(`**发布时间：** ${meta.publishTime}`);
  }
  if (meta.description) {
    metadataLines.push(`**描述：** ${meta.description}`);
  }

  return `${metadataLines.join("\n\n")}\n\n---\n\n${contentMarkdown.trim()}`;
}

/**
 * 计算同级兄弟文档的路径
 * 如当前文档为 `/分类/文档A`，其父路径为 `/分类`，则兄弟路径为 `/分类/${siblingTitle}`；
 * 若当前文档位于根目录 `/文档A`，则兄弟路径为 `/${siblingTitle}`。
 */
export function resolveSiblingDocHPath(currentDocHPath: string, siblingTitle: string): string {
  const normalized = (currentDocHPath || "").trim();
  const cleanTitle = (siblingTitle || "").trim().replace(/^\/+|\/+$/g, "");

  if (!normalized || normalized === "/") {
    return `/${cleanTitle}`;
  }

  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) {
    // 当前文档就在根目录下
    return `/${cleanTitle}`;
  }

  // 取除当前文档之外的父路径
  parts.pop();
  return `/${parts.join("/")}/${cleanTitle}`;
}
