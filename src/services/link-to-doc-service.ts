/**
 * 网页链接转思源文档服务层
 * 负责通过思源网络代理获取网页、并发提取标题、执行网页内容剪藏并创建同级笔记文档
 */

import {
  buildClippedMarkdownDocument,
  cleanAndConvertHtmlToMarkdown,
  extractWebMetadataFromHtml,
  extractWechatOriginalLink,
  extractXFirstParagraphTitle,
  extractXPostId,
  formatXPostMarkdown,
  isXPostUrl,
  mergeXPostData,
  parseFxTwitterResponse,
  parseVxTwitterResponse,
  renderXArticleToMarkdown,
  resolveSiblingDocHPath,
  sanitizeDocTitle,
  type WebArticleMeta,
  type WebLinkItem,
} from "@/core/link-to-doc-core";
import {
  createDocWithMd,
  forwardProxy,
  getDocMetaByID,
  type ForwardProxyHeader,
} from "@/services/kernel";

export type WebLinkItemWithTitle = WebLinkItem & {
  title: string;
  hasFetchedTitle: boolean;
};

export type ClipProgressCallback = (current: number, total: number, title: string) => void;

export type ClipBatchResult = {
  total: number;
  successCount: number;
  failedCount: number;
  createdDocIds: string[];
  errors: Array<{ url: string; error: string }>;
};

const BROWSER_HEADERS: ForwardProxyHeader[] = [
  {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
  {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  },
  {
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  },
];

/**
 * 获取网页 HTML 内容（通过思源内核 forwardProxy 代理以避免跨域限制）
 * 支持自动识别飞书页面中内嵌的微信原文链接并跟随
 */
export async function fetchPageHtml(url: string, timeout = 15000): Promise<string> {
  const response = await forwardProxy(url, "GET", {}, BROWSER_HEADERS, timeout);
  if (!response || response.status < 200 || response.status >= 400) {
    throw new Error(`获取网页失败，状态码: ${response?.status ?? "未知"}`);
  }

  const html = response.body || "";

  // 飞书链接特殊处理：如果检测到微信公众号原文链接，自动重定向抓取真实原文
  if (url.includes("feishu.cn")) {
    const originalWechatLink = extractWechatOriginalLink(html);
    if (originalWechatLink && originalWechatLink !== url) {
      const wechatResponse = await forwardProxy(
        originalWechatLink,
        "GET",
        {},
        BROWSER_HEADERS,
        timeout
      );
      if (wechatResponse && wechatResponse.status >= 200 && wechatResponse.status < 400) {
        return wechatResponse.body || "";
      }
    }
  }

  return html;
}

/**
 * 尝试通过公共结构化 API（VxTwitter/FxTwitter/FixVx）获取 X 帖子内容与首段标题
 * 并发请求并智能合并，优先获取完整长推文（Note Tweet）与高质量图片/文章结构，避免 180 字符截断
 */
export async function fetchXPostData(
  url: string,
  timeout = 12000
): Promise<{ title: string; fullMarkdown: string } | null> {
  const postId = extractXPostId(url);
  if (!postId) {
    return null;
  }

  const vxUrl = `https://api.vxtwitter.com/status/${postId}`;
  const fxUrl = `https://api.fxtwitter.com/status/${postId}`;

  // 并发请求 VxTwitter 与 FxTwitter
  const [vxSettled, fxSettled] = await Promise.allSettled([
    forwardProxy(vxUrl, "GET", {}, BROWSER_HEADERS, timeout),
    forwardProxy(fxUrl, "GET", {}, BROWSER_HEADERS, timeout),
  ]);

  let parsedVx = null;
  if (vxSettled.status === "fulfilled" && vxSettled.value?.status === 200 && vxSettled.value.body) {
    try {
      const data = JSON.parse(vxSettled.value.body);
      parsedVx = parseVxTwitterResponse(data);
    } catch {
      // 忽略解析错误
    }
  }

  let parsedFx = null;
  if (fxSettled.status === "fulfilled" && fxSettled.value?.status === 200 && fxSettled.value.body) {
    try {
      const data = JSON.parse(fxSettled.value.body);
      parsedFx = parseFxTwitterResponse(data);
    } catch {
      // 忽略解析错误
    }
  }

  // 若均未成功，尝试使用 fixvx 备用接口兜底
  if (!parsedVx && !parsedFx) {
    try {
      const fixvxUrl = `https://api.fixvx.com/status/${postId}`;
      const fixvxRes = await forwardProxy(fixvxUrl, "GET", {}, BROWSER_HEADERS, timeout);
      if (fixvxRes?.status === 200 && fixvxRes.body) {
        const data = JSON.parse(fixvxRes.body);
        parsedVx = parseVxTwitterResponse(data);
      }
    } catch {
      // 忽略备用接口错误
    }
  }

  const merged = mergeXPostData(parsedVx, parsedFx);
  if (!merged || (!merged.text && !merged.article)) {
    return null;
  }

  let title = "";
  let contentMarkdown = "";

  if (merged.article && merged.article.content?.blocks?.length) {
    title = sanitizeDocTitle(merged.article.title || extractXFirstParagraphTitle(merged.text, url), url);
    contentMarkdown = renderXArticleToMarkdown(merged.article, merged.text);
  } else {
    title = extractXFirstParagraphTitle(merged.text, url);
    contentMarkdown = formatXPostMarkdown(
      merged.text,
      merged.mediaUrls,
      merged.quoteInfo,
      merged.videoUrls
    );
  }

  const authorDisplay = merged.authorName
    ? `${merged.authorName} (@${merged.authorScreenName || ""})`
    : merged.authorScreenName
    ? `@${merged.authorScreenName}`
    : "";

  const meta: WebArticleMeta = {
    title,
    author: authorDisplay || undefined,
    publishTime: merged.publishTime || undefined,
    url,
  };

  const fullMarkdown = buildClippedMarkdownDocument(meta, contentMarkdown);
  return { title, fullMarkdown };
}

/**
 * 并发预取链接网页真实标题
 * 当发生网络异常或抓取失败时，平滑降级使用 fallbackTitle 或主机名
 */
export async function fetchLinkTitles(
  links: WebLinkItem[],
  concurrency = 3
): Promise<WebLinkItemWithTitle[]> {
  const results: WebLinkItemWithTitle[] = [];

  // 分块并发控制
  for (let i = 0; i < links.length; i += concurrency) {
    const batch = links.slice(i, i + concurrency);
    const batchPromises = batch.map(async (link): Promise<WebLinkItemWithTitle> => {
      try {
        // 如果是 X 网站链接，优先通过结构化接口获取正文第一段作为标题
        if (isXPostUrl(link.url)) {
          const xData = await fetchXPostData(link.url, 8000);
          if (xData?.title) {
            return {
              ...link,
              title: xData.title,
              hasFetchedTitle: true,
            };
          }
        }

        const html = await fetchPageHtml(link.url, 10000);
        const meta = extractWebMetadataFromHtml(html, link.url);
        const title = meta.title || link.fallbackTitle || sanitizeDocTitle("", link.url);
        return {
          ...link,
          title,
          hasFetchedTitle: true,
        };
      } catch {
        // 请求失败降级
        const fallback = link.fallbackTitle || sanitizeDocTitle("", link.url);
        return {
          ...link,
          title: fallback,
          hasFetchedTitle: false,
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}

/**
 * 剪藏单个网页为笔记文档
 * 保存路径为当前文档的同级兄弟路径
 */
export async function clipWebLinkToDoc(
  box: string,
  currentDocHPath: string,
  link: WebLinkItem,
  customTitle?: string
): Promise<{ docId: string; title: string }> {
  let title = "";
  let fullMarkdown = "";

  // 1. 如果是 X 网站链接，优先通过专用 API 提取（自然保留段落换行与首段标题）
  if (isXPostUrl(link.url)) {
    const xData = await fetchXPostData(link.url, 15000);
    if (xData) {
      title = sanitizeDocTitle(customTitle || xData.title, link.url);
      fullMarkdown = xData.fullMarkdown;
    }
  }

  // 2. 若不是 X 网站，或 X 专用接口未成功获取，回退到常规网页抓取
  if (!fullMarkdown) {
    const html = await fetchPageHtml(link.url, 20000);
    const meta = extractWebMetadataFromHtml(html, link.url);
    const contentMarkdown = cleanAndConvertHtmlToMarkdown(html, link.url);
    title = sanitizeDocTitle(
      customTitle || meta.title || link.fallbackTitle || "",
      link.url
    );
    fullMarkdown = buildClippedMarkdownDocument(meta, contentMarkdown);
  }

  // 3. 计算同级兄弟文档路径
  const siblingHPath = resolveSiblingDocHPath(currentDocHPath, title);

  // 4. 调用思源内核 API 创建文档
  const docId = await createDocWithMd(box, siblingHPath, fullMarkdown);
  return { docId, title };
}

/**
 * 批量剪藏链接为笔记文档
 */
export async function clipWebLinksToDocs(
  currentDocId: string,
  links: Array<WebLinkItem & { title?: string }>,
  onProgress?: ClipProgressCallback
): Promise<ClipBatchResult> {
  const currentDoc = await getDocMetaByID(currentDocId);
  if (!currentDoc?.box) {
    throw new Error("未找到当前文档信息，无法创建剪藏文档");
  }

  const result: ClipBatchResult = {
    total: links.length,
    successCount: 0,
    failedCount: 0,
    createdDocIds: [],
    errors: [],
  };

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const displayTitle = link.title || link.fallbackTitle || sanitizeDocTitle("", link.url);
    onProgress?.(i + 1, links.length, displayTitle);

    try {
      const { docId } = await clipWebLinkToDoc(
        currentDoc.box,
        currentDoc.hPath,
        link,
        link.title
      );
      result.successCount++;
      result.createdDocIds.push(docId);
    } catch (err: any) {
      result.failedCount++;
      result.errors.push({
        url: link.url,
        error: err?.message || String(err),
      });
    }
  }

  return result;
}
