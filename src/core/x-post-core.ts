/**
 * X (Twitter) 帖子解析与 Markdown 渲染纯逻辑
 * 负责帖子链接识别、VxTwitter/FxTwitter 响应解析与合并、Article 长文渲染
 */

import { sanitizeDocTitle } from "./web-clip-shared-core";

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
  const cleaned = text.replace(/https:\/\/t\.co\/\w+\s*$/gi, "").trim();

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
  firstParagraph = firstParagraph.replace(/^https?:\/\/\S+\s*/i, "").trim();

  // 去除段首可能的常见 @ 提及或 # 标签（如果只包含标签则保留）
  const strippedMention = firstParagraph.replace(/^@\w+\s+/, "").trim();
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
      mediaUrls: qMedia
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
    article
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
      mediaUrls: qPhotos
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
    article
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
    vx.article?.content?.blocks?.length ?
      vx.article :
      fx.article?.content?.blocks?.length ?
        fx.article :
        vx.article || fx.article;

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
    article
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
