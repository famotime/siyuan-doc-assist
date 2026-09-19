/**
 * 网页链接转思源文档核心纯逻辑
 * 负责链接提取与清洗、HTML 元数据解析、正文清理与 DOM 转 Markdown、安全文档标题生成等
 */

export type WebLinkItem = {
  /** 规范化后的完整链接（已去除追踪参数） */
  url: string;
  /** 原始链接 */
  originalUrl: string;
  /** 提取自 Markdown 链接语法的候选标题（如 [标题](url)） */
  fallbackTitle?: string;
};

export type WebArticleMeta = {
  title: string;
  description?: string;
  author?: string;
  publishTime?: string;
  url: string;
};

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
 * 清洗标题，转换为合法的文档名称/路径（参考参考脚本）
 * 替换文件系统非法字符为全角字符，截断过长标题，防止空标题
 */
export function sanitizeDocTitle(title: string, fallbackUrl?: string): string {
  let clean = (title || "").trim();

  // 字符替换表：替换 Windows/Linux 文件系统敏感字符
  const invalidChars: Record<string, string> = {
    "\\": "＼",
    "/": "／",
    ":": "：",
    "*": "＊",
    "?": "？",
    '"': "＂",
    "<": "＜",
    ">": "＞",
    "|": "｜",
  };

  clean = clean.replace(/[\\/:*?"<>|]/g, (char) => invalidChars[char] || " ");
  // 将连续空格折叠为单空格
  clean = clean.replace(/\s+/g, " ").trim();

  // 若标题为空或太短，使用 URL 域名作为备用标题
  if (!clean || clean.length < 2) {
    if (fallbackUrl) {
      try {
        clean = new URL(fallbackUrl).hostname.replace(/\./g, "-");
      } catch {
        clean = "未命名网页";
      }
    } else {
      clean = "未命名网页";
    }
  }

  // 截断过长标题（最多 80 字符）
  if (clean.length > 80) {
    clean = clean.slice(0, 80).trim();
  }

  return clean;
}

/**
 * 判断是否为 X (Twitter) 帖子链接并提取帖子 ID
 */
export function extractXPostId(url: string): string | null {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")) {
      const match = parsed.pathname.match(/\/status\/(\d+)/i);
      return match ? match[1] : null;
    }
    return null;
  } catch {
    const match = url.match(/(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/i);
    return match ? match[1] : null;
  }
}

/**
 * 判断是否为 X / Twitter 帖子 URL
 */
export function isXPostUrl(url: string): boolean {
  return extractXPostId(url) !== null;
}

/**
 * 从 X 帖子正文中提取第一个段落内容作为标题
 * 1. 清洗末尾自动附加的 t.co 短链接
 * 2. 识别自然段落换行，取第一个非空段落
 * 3. 截断及文件系统安全字符替换
 */
export function extractXFirstParagraphTitle(text: string, fallbackUrl?: string): string {
  if (!text) {
    return sanitizeDocTitle("", fallbackUrl);
  }

  // 1. 去除末尾的 t.co 短链接及多余空格
  let cleaned = text.replace(/https:\/\/t\.co\/\w+\s*$/gi, "").trim();

  // 2. 按自然段落（换行）切分
  const paragraphs = cleaned
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (!paragraphs.length) {
    return sanitizeDocTitle("", fallbackUrl);
  }

  // 取正文第一个段落内容
  let firstParagraph = paragraphs[0];

  // 若首段以网址开头，去除前置纯网址
  firstParagraph = firstParagraph.replace(/^https?:\/\/[^\s]+\s*/i, "").trim();

  // 去除段首可能的常见 @ 提及或 # 标签（如果只包含标签则保留）
  const strippedMention = firstParagraph.replace(/^@[a-zA-Z0-9_]+\s+/, "").trim();
  if (strippedMention) {
    firstParagraph = strippedMention;
  }

  return sanitizeDocTitle(firstParagraph, fallbackUrl);
}

export interface XArticleBlock {
  key?: string;
  type?: string;
  text?: string;
  entityRanges?: Array<{ key: number | string; offset: number; length: number }>;
}

export interface XArticleEntity {
  type?: string;
  data?: {
    url?: string;
    markdown?: string;
    mediaItems?: Array<{ mediaId?: string | number }>;
  };
}

export interface XArticleData {
  title?: string;
  preview_text?: string;
  cover_media?: {
    media_info?: {
      original_img_url?: string;
    };
  };
  media_entities?: Array<{
    media_id?: string | number;
    media_info?: {
      original_img_url?: string;
      variants?: Array<{ content_type?: string; url?: string; bit_rate?: number }>;
    };
  }>;
  content?: {
    blocks?: XArticleBlock[];
    entityMap?: Record<string, XArticleEntity> | XArticleEntity[];
  };
}

export interface ParsedXPost {
  id: string;
  text: string;
  authorName?: string;
  authorScreenName?: string;
  publishTime?: string;
  mediaUrls: string[];
  videoUrls: string[];
  quoteInfo?: {
    author?: string;
    text?: string;
    mediaUrls?: string[];
  };
  article?: XArticleData;
}

/**
 * 解析 VxTwitter/BetterTwitFix API 返回的 JSON 数据
 * 优势：能完整提取 Note Tweet（长推文），不发生 180/280 字符截断
 */
export function parseVxTwitterResponse(data: any): ParsedXPost | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const text = typeof data.text === "string" ? data.text.trim() : "";
  const id = String(data.tweetID || data.conversationID || "");
  if (!text && !id && !data.article) {
    return null;
  }

  const authorName = data.user_name ? String(data.user_name).trim() : undefined;
  const authorScreenName = data.user_screen_name ? String(data.user_screen_name).trim() : undefined;
  const publishTime = data.date ? String(data.date).trim() : undefined;

  const mediaUrls: string[] = [];
  const videoUrls: string[] = [];

  if (Array.isArray(data.mediaURLs)) {
    for (const u of data.mediaURLs) {
      if (typeof u === "string" && u) {
        if (u.includes("pbs.twimg.com/media/") && !u.includes("name=")) {
          mediaUrls.push(`${u}?name=orig`);
        } else {
          mediaUrls.push(u);
        }
      }
    }
  }

  if (Array.isArray(data.media_extended)) {
    for (const item of data.media_extended) {
      if (item?.type === "video" && item.url) {
        videoUrls.push(item.url);
      } else if (item?.url) {
        const u = item.url;
        const target = u.includes("pbs.twimg.com/media/") && !u.includes("name=") ? `${u}?name=orig` : u;
        if (!mediaUrls.some((existing) => existing.split("?")[0] === target.split("?")[0])) {
          mediaUrls.push(target);
        }
      }
    }
  }

  let quoteInfo: ParsedXPost["quoteInfo"];
  if (data.qrt && typeof data.qrt === "object") {
    const qMedia: string[] = [];
    if (Array.isArray(data.qrt.mediaURLs)) {
      qMedia.push(...data.qrt.mediaURLs.filter(Boolean));
    }
    if (Array.isArray(data.qrt.media_extended)) {
      for (const m of data.qrt.media_extended) {
        if (m?.url && !qMedia.includes(m.url)) {
          qMedia.push(m.url);
        }
      }
    }
    quoteInfo = {
      author: data.qrt.user_screen_name || data.qrt.user_name,
      text: data.qrt.text,
      mediaUrls: qMedia,
    };
  }

  const article = data.article && typeof data.article === "object" ? (data.article as XArticleData) : undefined;

  return {
    id,
    text,
    authorName,
    authorScreenName,
    publishTime,
    mediaUrls,
    videoUrls,
    quoteInfo,
    article,
  };
}

/**
 * 解析 FxTwitter API 返回的 JSON 数据
 * 优势：提供高规格图片与完整的 Draft.js X Article 结构数据
 */
export function parseFxTwitterResponse(data: any): ParsedXPost | null {
  if (!data || typeof data !== "object" || data.code !== 200 || !data.tweet) {
    return null;
  }
  const tweet = data.tweet;
  const id = String(tweet.id || "");
  const text = (typeof tweet.text === "string" ? tweet.text : tweet.raw_text?.text || "").trim();
  const authorName = tweet.author?.name ? String(tweet.author.name).trim() : undefined;
  const authorScreenName = tweet.author?.screen_name ? String(tweet.author.screen_name).trim() : undefined;
  const publishTime = tweet.created_at ? String(tweet.created_at).trim() : undefined;

  const mediaUrls: string[] = [];
  const videoUrls: string[] = [];

  if (Array.isArray(tweet.media?.photos)) {
    for (const p of tweet.media.photos) {
      if (p?.url) {
        mediaUrls.push(p.url);
      }
    }
  }
  if (Array.isArray(tweet.media?.all)) {
    for (const m of tweet.media.all) {
      if (m?.type === "photo" && m.url && !mediaUrls.includes(m.url)) {
        mediaUrls.push(m.url);
      }
      if (m?.type === "video" && m.url && !videoUrls.includes(m.url)) {
        videoUrls.push(m.url);
      }
    }
  }
  if (Array.isArray(tweet.media?.videos)) {
    for (const v of tweet.media.videos) {
      if (v?.url && !videoUrls.includes(v.url)) {
        videoUrls.push(v.url);
      }
    }
  }

  let quoteInfo: ParsedXPost["quoteInfo"];
  if (tweet.quote && typeof tweet.quote === "object") {
    const qPhotos: string[] = [];
    if (Array.isArray(tweet.quote.media?.photos)) {
      for (const qp of tweet.quote.media.photos) {
        if (qp?.url) {
          qPhotos.push(qp.url);
        }
      }
    }
    quoteInfo = {
      author: tweet.quote.author?.screen_name || tweet.quote.author?.name,
      text: tweet.quote.text,
      mediaUrls: qPhotos,
    };
  }

  const article = tweet.article && typeof tweet.article === "object" ? (tweet.article as XArticleData) : undefined;

  return {
    id,
    text,
    authorName,
    authorScreenName,
    publishTime,
    mediaUrls,
    videoUrls,
    quoteInfo,
    article,
  };
}

/**
 * 合并 VxTwitter 与 FxTwitter 的解析结果（取长补短，防止长文截断）
 */
export function mergeXPostData(
  vx: ParsedXPost | null,
  fx: ParsedXPost | null
): ParsedXPost | null {
  if (!vx && !fx) return null;
  if (!vx) return fx;
  if (!fx) return vx;

  // 1. 若其中一方包含完整 Article 长文结构，优先保留
  const article =
    vx.article?.content?.blocks?.length
      ? vx.article
      : fx.article?.content?.blocks?.length
      ? fx.article
      : vx.article || fx.article;

  // 2. 正文优先选择更长、更完整的文本（核心：VxTwitter 保留完整 Note Tweet 长推文，避免 FxTwitter 180 字符截断）
  const text = vx.text.length >= fx.text.length ? vx.text : fx.text;

  // 3. 作者信息合并
  const authorName = vx.authorName || fx.authorName;
  const authorScreenName = vx.authorScreenName || fx.authorScreenName;
  const publishTime = vx.publishTime || fx.publishTime;

  // 4. 媒体合并去重（以图片原始基础 URL 去重，保留 ?name=orig 高清版）
  const mediaMap = new Map<string, string>();
  for (const u of [...(fx.mediaUrls || []), ...(vx.mediaUrls || [])]) {
    const baseKey = u.split("?")[0];
    if (!mediaMap.has(baseKey) || u.includes("name=orig")) {
      mediaMap.set(baseKey, u);
    }
  }
  const mediaUrls = Array.from(mediaMap.values());
  const videoUrls = Array.from(new Set([...(fx.videoUrls || []), ...(vx.videoUrls || [])]));

  // 5. 引用推文合并
  const quoteInfo = fx.quoteInfo || vx.quoteInfo;

  return {
    id: vx.id || fx.id,
    text,
    authorName,
    authorScreenName,
    publishTime,
    mediaUrls,
    videoUrls,
    quoteInfo,
    article,
  };
}

/**
 * 将 X Article 的 Draft.js 结构化内容渲染为标准 Markdown
 */
export function renderXArticleToMarkdown(
  article: XArticleData,
  tweetIntro = ""
): string {
  const parts: string[] = [];

  // 1. 封面图（支持 cover_media 或 article.image）
  const coverUrl =
    article.cover_media?.media_info?.original_img_url ||
    (article as any).image;
  if (coverUrl) {
    parts.push(`![封面图片](${coverUrl})`);
  }

  // 2. 推文前言/导语（如果与文章标题不同）
  const cleanIntro = (tweetIntro || "")
    .replace(/https:\/\/t\.co\/\w+\s*$/gi, "")
    .replace(/https:\/\/x\.com\/i\/article\/\d+\s*$/gi, "")
    .trim();
  if (cleanIntro && cleanIntro !== article.title) {
    const introLines = cleanIntro
      .split(/\r?\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (introLines.length) {
      parts.push(introLines.map((l) => `> ${l}`).join("\n>\n"));
    }
  }

  // 3. 构建媒体查找字典（将 media_id 映射到原始图片或视频 URL）
  const mediaMap = new Map<string, { imgUrl?: string; videoUrl?: string }>();
  if (Array.isArray(article.media_entities)) {
    for (const item of article.media_entities) {
      const mid = String(item.media_id || (item as any).id || "");
      const minfo = item.media_info || {};
      const imgUrl = minfo.original_img_url;
      let videoUrl: string | undefined;
      if (Array.isArray(minfo.variants)) {
        const mp4s = minfo.variants.filter((v) => v.content_type === "video/mp4");
        if (mp4s.length) {
          mp4s.sort((a, b) => (b.bit_rate || 0) - (a.bit_rate || 0));
          videoUrl = mp4s[0].url;
        } else if (minfo.variants[0]?.url) {
          videoUrl = minfo.variants[0].url;
        }
      }
      if (mid) {
        mediaMap.set(mid, { imgUrl, videoUrl });
      }
    }
  }

  // 4. 规范化 entityMap（处理 Draft.js 中数组格式 [{ key, value: { type, data } }] 与对象格式）
  const entityMap = new Map<string, { type?: string; data?: any }>();
  if (article.content?.entityMap) {
    const rawMap = article.content.entityMap;
    if (Array.isArray(rawMap)) {
      rawMap.forEach((ent: any, idx: number) => {
        if (ent) {
          const k = String(ent.key !== undefined ? ent.key : idx);
          const val = ent.value || ent;
          entityMap.set(k, val);
        }
      });
    } else if (typeof rawMap === "object") {
      Object.entries(rawMap).forEach(([k, v]) => {
        if (v) {
          const val = (v as any).value || v;
          entityMap.set(k, val);
        }
      });
    }
  }

  // 5. 遍历 Draft.js 结构块
  const blocks = article.content?.blocks || [];
  for (const block of blocks) {
    const btype = block.type || "unstyled";
    let text = block.text || "";

    // 处理 atomic 类型（嵌入媒体或独立 Markdown/表格）
    if (btype === "atomic") {
      if (block.entityRanges?.length) {
        for (const er of block.entityRanges) {
          const ent = entityMap.get(String(er.key));
          if (ent?.type === "MEDIA") {
            const mediaItems = ent.data?.mediaItems || [];
            for (const mi of mediaItems) {
              const mid = String(mi.mediaId || mi.media_id || (mi as any).localMediaId || "");
              const m = mediaMap.get(mid);
              if (m?.imgUrl) {
                parts.push(`![图片](${m.imgUrl})`);
              } else if (m?.videoUrl) {
                parts.push(`[视频链接](${m.videoUrl})`);
              }
            }
          } else if (ent?.type === "MARKDOWN") {
            const md = (ent.data?.markdown || "").trim();
            if (md) {
              parts.push(md);
            }
          }
        }
      }
      continue;
    }

    // 处理行内链接 entityRanges
    if (block.entityRanges?.length && text) {
      // 逆序替换，避免 index 偏移
      const sortedRanges = [...block.entityRanges].sort((a, b) => b.offset - a.offset);
      for (const er of sortedRanges) {
        const ent = entityMap.get(String(er.key));
        if (ent?.type === "LINK" && ent.data?.url) {
          const start = er.offset;
          const end = er.offset + er.length;
          const sub = text.slice(start, end);
          if (sub) {
            text = `${text.slice(0, start)}[${sub}](${ent.data.url})${text.slice(end)}`;
          }
        }
      }
    }

    const trimmedText = text.trim();
    if (!trimmedText) {
      continue;
    }

    switch (btype) {
      case "header-one":
        parts.push(`# ${trimmedText}`);
        break;
      case "header-two":
        parts.push(`## ${trimmedText}`);
        break;
      case "header-three":
        parts.push(`### ${trimmedText}`);
        break;
      case "blockquote":
        parts.push(`> ${trimmedText}`);
        break;
      case "unordered-list-item":
        parts.push(`- ${trimmedText}`);
        break;
      case "ordered-list-item":
        parts.push(`1. ${trimmedText}`);
        break;
      case "code-block":
        parts.push(`\`\`\`\n${trimmedText}\n\`\`\``);
        break;
      default:
        parts.push(trimmedText);
        break;
    }
  }

  return parts.join("\n\n");
}

/**
 * 格式化 X 帖子正文为保留清晰段落换行的 Markdown
 */
export function formatXPostMarkdown(
  text: string,
  mediaUrls: string[] = [],
  quoteInfo?: { author?: string; text?: string; mediaUrls?: string[] },
  videoUrls: string[] = []
): string {
  const parts: string[] = [];

  // 清洗推文文本末尾的 t.co 链接
  const cleanedText = (text || "").replace(/https:\/\/t\.co\/\w+\s*$/gi, "").trim();

  // 将推文文本按换行切分为段落，每个段落之间保留双换行 \n\n
  if (cleanedText) {
    const paragraphs = cleanedText
      .split(/\r?\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
    parts.push(paragraphs.join("\n\n"));
  }

  // 媒体图片
  for (const mediaUrl of mediaUrls) {
    if (mediaUrl) {
      parts.push(`![图片](${mediaUrl})`);
    }
  }

  // 视频链接
  for (const videoUrl of videoUrls) {
    if (videoUrl) {
      parts.push(`[视频链接](${videoUrl})`);
    }
  }

  // 引用推文
  if (quoteInfo && (quoteInfo.text || quoteInfo.author)) {
    const quoteLines: string[] = [];
    if (quoteInfo.author) {
      quoteLines.push(`**引用 @${quoteInfo.author}：**`);
    }
    if (quoteInfo.text) {
      const quoteParagraphs = quoteInfo.text
        .replace(/https:\/\/t\.co\/\w+\s*$/gi, "")
        .trim()
        .split(/\r?\n+/)
        .map((p) => p.trim())
        .filter(Boolean);
      quoteLines.push(...quoteParagraphs);
    }
    if (quoteInfo.mediaUrls?.length) {
      for (const qm of quoteInfo.mediaUrls) {
        quoteLines.push(`![引用图片](${qm})`);
      }
    }
    const quoteBlock = quoteLines.map((l) => `> ${l}`).join("\n>\n");
    parts.push(quoteBlock);
  }

  return parts.join("\n\n");
}

/**
 * 从页面内容中提取微信公众号原文链接（参考 web_downloader.py）
 */
export function extractWechatOriginalLink(htmlContent: string): string | null {
  if (!htmlContent) {
    return null;
  }

  const patterns = [
    /原文链接\s*[：:]\s*(https:\/\/mp\.weixin\.qq\.com\/s\/[A-Za-z0-9_-]+)/i,
    /原文链接\s*[：:]\s*(https:\/\/mp\.weixin\.qq\.com\/s\?[^"'\s<>]+)/i,
    /https:\/\/mp\.weixin\.qq\.com\/s\/[A-Za-z0-9_-]+/i,
  ];

  for (const pattern of patterns) {
    const m = htmlContent.match(pattern);
    if (m) {
      const link = m[1] || m[0];
      return link.replace(/#wechat_redirect.*$/i, "").trim();
    }
  }

  return null;
}

/**
 * 解析 DOM 树（兼容浏览器原生 DOMParser 与 jsdom）
 */
function getDocument(html: string): Document {
  if (typeof DOMParser !== "undefined") {
    return new DOMParser().parseFromString(html, "text/html");
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { JSDOM } = require("jsdom");
  return new JSDOM(html).window.document;
}

/**
 * 从 HTML 中提取网页的元数据（标题、描述、作者、发布时间）
 */
export function extractWebMetadataFromHtml(html: string, pageUrl: string): WebArticleMeta {
  const doc = getDocument(html);

  // 1. 提取标题
  let rawTitle = "";

  // 如果是 X / Twitter 帖子，直接优先提取正文的第一个段落内容作为新建文档标题
  if (isXPostUrl(pageUrl)) {
    const tweetText =
      doc.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
      doc.querySelector('meta[name="twitter:description"]')?.getAttribute("content") ||
      doc.querySelector('[data-testid="tweetText"]')?.textContent ||
      doc.querySelector("article")?.textContent ||
      "";
    if (tweetText.trim()) {
      rawTitle = extractXFirstParagraphTitle(tweetText, pageUrl);
    }
  }

  if (!rawTitle) {
    // 微信公众号优先取 #activity-name
    const wechatTitle = doc.querySelector("#activity-name");
    if (wechatTitle && wechatTitle.textContent?.trim()) {
      rawTitle = wechatTitle.textContent.trim();
    } else {
      // 检查 OpenGraph 标题
      const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");
      if (ogTitle?.trim()) {
        rawTitle = ogTitle.trim();
      } else {
        // 检查 h1
        const h1 = doc.querySelector("h1");
        if (h1 && h1.textContent?.trim()) {
          rawTitle = h1.textContent.trim();
        } else {
          // 检查 title 标签
          const titleTag = doc.querySelector("title");
          if (titleTag && titleTag.textContent?.trim()) {
            rawTitle = titleTag.textContent.trim();
          }
        }
      }
    }
  }

  const safeTitle = sanitizeDocTitle(rawTitle, pageUrl);

  // 2. 提取描述
  let description = "";
  const metaDesc =
    doc.querySelector('meta[name="description"]')?.getAttribute("content") ||
    doc.querySelector('meta[property="og:description"]')?.getAttribute("content");
  if (metaDesc?.trim()) {
    description = metaDesc.trim();
  }

  // 3. 提取作者
  let author = "";
  const wechatAuthor = doc.querySelector("#js_name") || doc.querySelector(".rich_media_meta_nickname");
  if (wechatAuthor && wechatAuthor.textContent?.trim()) {
    author = wechatAuthor.textContent.trim();
  } else {
    const metaAuthor =
      doc.querySelector('meta[name="author"]')?.getAttribute("content") ||
      doc.querySelector('meta[property="article:author"]')?.getAttribute("content") ||
      doc.querySelector(".author")?.textContent?.trim();
    if (metaAuthor?.trim()) {
      author = metaAuthor.trim();
    }
  }

  // 4. 提取发布时间
  let publishTime = "";
  const wechatTime = doc.querySelector("#publish_time");
  if (wechatTime && wechatTime.textContent?.trim()) {
    publishTime = wechatTime.textContent.trim();
  } else {
    const metaTime =
      doc.querySelector('meta[property="article:published_time"]')?.getAttribute("content") ||
      doc.querySelector('meta[name="publish_date"]')?.getAttribute("content") ||
      doc.querySelector("time")?.getAttribute("datetime") ||
      doc.querySelector("time")?.textContent?.trim() ||
      doc.querySelector(".publish-time")?.textContent?.trim() ||
      doc.querySelector(".date")?.textContent?.trim();
    if (metaTime?.trim()) {
      publishTime = metaTime.trim();
    }
  }

  return {
    title: safeTitle,
    description: description || undefined,
    author: author || undefined,
    publishTime: publishTime || undefined,
    url: pageUrl,
  };
}

/**
 * 清洗 HTML 并转换为 Markdown
 */
export function cleanAndConvertHtmlToMarkdown(html: string, pageUrl: string): string {
  const doc = getDocument(html);

  // 1. 定位主要内容区域
  let container: Element | null = null;
  // 微信公众号正文容器
  const wechatContent = doc.querySelector("#js_content");
  if (wechatContent) {
    container = wechatContent;
  } else {
    // 常见文章正文容器选择器
    const contentSelectors = [
      "article",
      '[role="main"]',
      "main",
      ".article-content",
      ".post-content",
      ".entry-content",
      ".content-article",
      ".article_content",
      ".article",
      "#article",
      "#content",
    ];
    for (const selector of contentSelectors) {
      const found = doc.querySelector(selector);
      if (found && (found.textContent || "").trim().length > 100) {
        container = found;
        break;
      }
    }
  }

  if (!container) {
    container = doc.body || doc.documentElement;
  }

  // 2. 清理无用节点
  const removeSelectors = [
    "script",
    "style",
    "noscript",
    "link",
    "meta",
    "svg",
    "nav",
    "footer",
    "header",
    ".ad",
    ".ads",
    ".advertisement",
    ".share-btn",
    ".share-box",
    ".sidebar",
    ".comment-list",
    ".comments",
  ];
  for (const sel of removeSelectors) {
    container.querySelectorAll(sel).forEach((el) => el.remove());
  }

  // 3. 处理图片懒加载属性与绝对路径转换
  const lazyAttrs = ["data-src", "data-original", "data-actualsrc", "data-lazy-src", "data-url"];
  container.querySelectorAll("img").forEach((img) => {
    let src = img.getAttribute("src") || "";
    // 如果原 src 是 base64 占位图或者为空，尝试读取懒加载属性
    if (!src || src.startsWith("data:image")) {
      for (const attr of lazyAttrs) {
        const val = img.getAttribute(attr);
        if (val && !val.startsWith("data:image")) {
          src = val;
          break;
        }
      }
    }
    // 转换为绝对链接
    if (src && !src.startsWith("data:")) {
      try {
        src = new URL(src, pageUrl).href;
        img.setAttribute("src", src);
      } catch {
        // 保留原样
      }
    }
  });

  // 4. 处理链接的相对路径转换
  container.querySelectorAll("a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
      try {
        a.setAttribute("href", new URL(href, pageUrl).href);
      } catch {
        // 保留原样
      }
    }
  });

  // 5. 递归转换为 Markdown
  const markdown = domNodeToMarkdown(container);
  // 压缩连续换行符
  return markdown.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * 递归将 DOM 节点转换为 Markdown
 */
export function domNodeToMarkdown(node: Node): string {
  // 文本节点
  if (node.nodeType === 3 /* Node.TEXT_NODE */) {
    const text = node.nodeValue || "";
    // 如果父节点是 pre，保留原空白
    if (node.parentElement && node.parentElement.tagName.toLowerCase() === "pre") {
      return text;
    }
    // 若包含换行，保留换行符，将单行内的连续水平空白折叠为单空格
    if (text.includes("\n")) {
      return text
        .split(/\r?\n/)
        .map((line) => line.replace(/[ \t\f\v]+/g, " "))
        .join("\n");
    }
    return text.replace(/[ \t\f\v]+/g, " ");
  }

  // 元素节点
  if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    // 忽略隐藏或无意义标签
    if (["script", "style", "noscript", "svg"].includes(tag)) {
      return "";
    }

    const childMarkdown = Array.from(el.childNodes)
      .map((child) => domNodeToMarkdown(child))
      .join("");

    switch (tag) {
      case "h1":
        return `\n\n# ${childMarkdown.trim()}\n\n`;
      case "h2":
        return `\n\n## ${childMarkdown.trim()}\n\n`;
      case "h3":
        return `\n\n### ${childMarkdown.trim()}\n\n`;
      case "h4":
        return `\n\n#### ${childMarkdown.trim()}\n\n`;
      case "h5":
        return `\n\n##### ${childMarkdown.trim()}\n\n`;
      case "h6":
        return `\n\n###### ${childMarkdown.trim()}\n\n`;

      case "p":
        return childMarkdown.trim() ? `\n\n${childMarkdown.trim()}\n\n` : "";

      case "br":
        return "\n\n";

      case "hr":
        return "\n\n---\n\n";

      case "strong":
      case "b":
        return childMarkdown.trim() ? `**${childMarkdown.trim()}**` : "";

      case "em":
      case "i":
        return childMarkdown.trim() ? `*${childMarkdown.trim()}*` : "";

      case "del":
      case "s":
      case "strike":
        return childMarkdown.trim() ? `~~${childMarkdown.trim()}~~` : "";

      case "code":
        if (el.parentElement && el.parentElement.tagName.toLowerCase() === "pre") {
          return childMarkdown;
        }
        return childMarkdown.trim() ? ` \`${childMarkdown.trim()}\` ` : "";

      case "pre": {
        const codeText = el.textContent || "";
        return `\n\n\`\`\`\n${codeText.trim()}\n\`\`\`\n\n`;
      }

      case "blockquote": {
        const lines = childMarkdown
          .trim()
          .split("\n")
          .map((line) => `> ${line}`);
        return `\n\n${lines.join("\n")}\n\n`;
      }

      case "ul": {
        const items = Array.from(el.children)
          .filter((c) => c.tagName.toLowerCase() === "li")
          .map((li) => {
            const liText = domNodeToMarkdown(li).trim();
            return `- ${liText}`;
          });
        return `\n\n${items.join("\n")}\n\n`;
      }

      case "ol": {
        const items = Array.from(el.children)
          .filter((c) => c.tagName.toLowerCase() === "li")
          .map((li, index) => {
            const liText = domNodeToMarkdown(li).trim();
            return `${index + 1}. ${liText}`;
          });
        return `\n\n${items.join("\n")}\n\n`;
      }

      case "li":
        return childMarkdown.trim();

      case "picture": {
        const img = el.querySelector("img");
        if (img) {
          return domNodeToMarkdown(img);
        }
        const source = el.querySelector("source");
        const srcset = source?.getAttribute("srcset");
        if (srcset) {
          const firstUrl = srcset.split(",")[0].trim().split(" ")[0];
          return `\n\n![](${firstUrl})\n\n`;
        }
        return childMarkdown;
      }

      case "a": {
        const href = el.getAttribute("href") || "";
        const text = childMarkdown.trim();
        if (!href) {
          return text;
        }
        // 如果 a 标签内仅包裹图片（形如 [![图片](url)](link)），在文档渲染中解包为纯图片块
        if (text.startsWith("![") && text.endsWith(")")) {
          return `\n\n${text}\n\n`;
        }
        if (!text) {
          return `[${href}](${href})`;
        }
        return `[${text}](${href})`;
      }

      case "img": {
        const src =
          el.getAttribute("src") ||
          el.getAttribute("data-src") ||
          el.getAttribute("data-original") ||
          "";
        if (!src) {
          return "";
        }
        const alt = el.getAttribute("alt") || "";
        return `\n\n![${alt}](${src})\n\n`;
      }

      case "table": {
        const rows = Array.from(el.querySelectorAll("tr"));
        if (!rows.length) {
          return "";
        }
        const tableLines: string[] = [];
        let colCount = 0;

        rows.forEach((tr, rIndex) => {
          const cells = Array.from(tr.querySelectorAll("th, td")).map((c) =>
            domNodeToMarkdown(c).trim().replace(/\|/g, "\\|")
          );
          if (cells.length > colCount) {
            colCount = cells.length;
          }
          tableLines.push(`| ${cells.join(" | ")} |`);

          // 第一行后补充表头分割线
          if (rIndex === 0) {
            const sep = Array(cells.length).fill("---").join(" | ");
            tableLines.push(`| ${sep} |`);
          }
        });

        return `\n\n${tableLines.join("\n")}\n\n`;
      }

      case "div":
      case "section":
      case "article":
      case "main":
        return childMarkdown.trim() ? `\n\n${childMarkdown.trim()}\n\n` : "";

      default:
        return childMarkdown;
    }
  }

  return "";
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
