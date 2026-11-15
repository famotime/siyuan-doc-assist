/**
 * 网页 HTML 采集纯逻辑
 * 负责微信原文链接抽取、网页元数据解析、正文清理与 DOM 转 Markdown
 */

import { sanitizeDocTitle, type WebArticleMeta } from "./web-clip-shared-core";
import { extractXFirstParagraphTitle, isXPostUrl } from "./x-post-core";

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
