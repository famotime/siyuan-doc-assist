// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildClippedMarkdownDocument,
  cleanAndConvertHtmlToMarkdown,
  domNodeToMarkdown,
  extractWebLinksFromMarkdown,
  extractWebMetadataFromHtml,
  extractWechatOriginalLink,
  extractXFirstParagraphTitle,
  extractXPostId,
  formatXPostMarkdown,
  isXPostUrl,
  mergeXPostData,
  normalizeWebUrl,
  parseFxTwitterResponse,
  parseVxTwitterResponse,
  renderXArticleToMarkdown,
  resolveSiblingDocHPath,
  sanitizeDocTitle,
} from "@/core/link-to-doc-core";

describe("link-to-doc-core", () => {
  describe("normalizeWebUrl", () => {
    it("removes tracking parameters and keeps valid query params", () => {
      const url = "https://example.com/article?id=123&utm_source=twitter&utm_medium=social&from=timeline&spm=100.1";
      const normalized = normalizeWebUrl(url);
      expect(normalized).toBe("https://example.com/article?id=123");
    });

    it("strips trailing punctuation and trailing slash", () => {
      const url = "https://example.com/blog/path/.,;)";
      expect(normalizeWebUrl(url)).toBe("https://example.com/blog/path");
    });

    it("ignores internal or non-http URLs", () => {
      expect(normalizeWebUrl("siyuan://blocks/123456")).toBe("siyuan://blocks/123456");
      expect(normalizeWebUrl("")).toBe("");
    });
  });

  describe("extractWebLinksFromMarkdown", () => {
    it("extracts markdown link with label and bare urls without duplicates", () => {
      const markdown = `
这里有一篇文章：[测试文章](https://example.com/post/1?utm_source=feed)
这是重复链接：https://example.com/post/1
这是另一篇链接：https://mp.weixin.qq.com/s/abcdef123
这是思源块引用：[块引用](siyuan://blocks/20260301-123456)
这是本地地址：http://localhost:6806/test
      `;

      const links = extractWebLinksFromMarkdown(markdown);
      expect(links).toHaveLength(2);

      expect(links[0].url).toBe("https://example.com/post/1");
      expect(links[0].fallbackTitle).toBe("测试文章");

      expect(links[1].url).toBe("https://mp.weixin.qq.com/s/abcdef123");
      expect(links[1].fallbackTitle).toBeUndefined();
    });
  });

  describe("sanitizeDocTitle", () => {
    it("replaces invalid filesystem characters with fullwidth equivalents", () => {
      const title = '深度研究: "AI" / 机器学习 <2026版>? *特别版* | 目录\\详情';
      const safe = sanitizeDocTitle(title);
      expect(safe).toContain("：");
      expect(safe).toContain("＂AI＂");
      expect(safe).toContain("／");
      expect(safe).toContain("＜2026版＞");
      expect(safe).toContain("？");
      expect(safe).toContain("＊特别版＊");
      expect(safe).toContain("｜");
      expect(safe).toContain("＼");
      expect(safe).not.toMatch(/[\\/:*?"<>|]/);
    });

    it("falls back to hostname if title is empty", () => {
      expect(sanitizeDocTitle("", "https://sub.domain.com/path")).toBe("sub-domain-com");
      expect(sanitizeDocTitle("   ", "")).toBe("未命名网页");
    });

    it("truncates excessively long titles", () => {
      const longTitle = "A".repeat(120);
      expect(sanitizeDocTitle(longTitle).length).toBe(80);
    });
  });

  describe("extractWechatOriginalLink", () => {
    it("extracts wechat link from feishu text or html", () => {
      const html = `<div>原文链接：https://mp.weixin.qq.com/s/xyz123_456#wechat_redirect</div>`;
      expect(extractWechatOriginalLink(html)).toBe("https://mp.weixin.qq.com/s/xyz123_456");
    });

    it("returns null when no wechat link exists", () => {
      expect(extractWechatOriginalLink("普通网页无微信链接")).toBeNull();
    });
  });

  describe("extractWebMetadataFromHtml", () => {
    it("extracts wechat article metadata correctly", () => {
      const html = `
        <html>
          <head>
            <title>微信网页标题</title>
            <meta property="og:title" content="微信OG标题" />
            <meta property="og:description" content="微信文章简介描述" />
          </head>
          <body>
            <h1 id="activity-name">真正的微信文章标题</h1>
            <div id="js_name">作者名张三</div>
            <em id="publish_time">2026-09-01</em>
          </body>
        </html>
      `;

      const meta = extractWebMetadataFromHtml(html, "https://mp.weixin.qq.com/s/123");
      expect(meta.title).toBe("真正的微信文章标题");
      expect(meta.author).toBe("作者名张三");
      expect(meta.publishTime).toBe("2026-09-01");
      expect(meta.description).toBe("微信文章简介描述");
    });

    it("extracts standard article metadata", () => {
      const html = `
        <html>
          <head>
            <title>标准博客 - 技术分享</title>
            <meta property="og:title" content="博客大标题" />
            <meta name="description" content="这是一篇精彩的技术文章" />
            <meta name="author" content="李四" />
            <meta property="article:published_time" content="2026-08-15" />
          </head>
          <body>
            <h1>博客大标题</h1>
          </body>
        </html>
      `;

      const meta = extractWebMetadataFromHtml(html, "https://example.com/blog/1");
      expect(meta.title).toBe("博客大标题");
      expect(meta.author).toBe("李四");
      expect(meta.publishTime).toBe("2026-08-15");
      expect(meta.description).toBe("这是一篇精彩的技术文章");
    });
  });

  describe("cleanAndConvertHtmlToMarkdown", () => {
    it("extracts wechat #js_content and handles lazy loaded images", () => {
      const html = `
        <div>
          <nav>导航内容应被移除</nav>
          <div id="js_content">
            <p>第一段文本介绍<strong>加粗重点</strong>与<em>斜体文本</em>。</p>
            <img data-src="https://mmbiz.qpic.cn/mmbiz_png/abc/640?wx_fmt=png" alt="配图1" />
            <p><a href="/relative/link">相对链接</a></p>
          </div>
          <footer>页脚内容应被移除</footer>
        </div>
      `;

      const md = cleanAndConvertHtmlToMarkdown(html, "https://example.com/page");
      expect(md).toContain("第一段文本介绍**加粗重点**与*斜体文本*。");
      expect(md).toContain("![配图1](https://mmbiz.qpic.cn/mmbiz_png/abc/640?wx_fmt=png)");
      expect(md).toContain("[相对链接](https://example.com/relative/link)");
      expect(md).not.toContain("导航内容");
      expect(md).not.toContain("页脚内容");
    });

    it("converts headings, blockquotes, lists, tables, and code blocks", () => {
      const html = `
        <article>
          <h2>章节标题</h2>
          <blockquote>引用的名言警句</blockquote>
          <ul>
            <li>列表第一项</li>
            <li>列表第二项</li>
          </ul>
          <pre><code>console.log("hello world");</code></pre>
          <table>
            <tr><th>项目</th><th>数值</th></tr>
            <tr><td>CPU</td><td>100%</td></tr>
          </table>
        </article>
      `;

      const md = cleanAndConvertHtmlToMarkdown(html, "https://example.com");
      expect(md).toContain("## 章节标题");
      expect(md).toContain("> 引用的名言警句");
      expect(md).toContain("- 列表第一项");
      expect(md).toContain("- 列表第二项");
      expect(md).toContain('console.log("hello world");');
      expect(md).toContain("| 项目 | 数值 |");
      expect(md).toContain("| --- | --- |");
      expect(md).toContain("| CPU | 100% |");
    });
  });

  describe("buildClippedMarkdownDocument", () => {
    it("formats metadata header and content", () => {
      const meta = {
        title: "测试文档",
        author: "张三",
        publishTime: "2026-09-01",
        description: "这是测试描述",
        url: "https://example.com/test",
      };

      const content = "## 正文开始\n\n正文第一段。";
      const doc = buildClippedMarkdownDocument(meta, content);

      expect(doc).toContain("**原始链接：** [https://example.com/test](https://example.com/test)");
      expect(doc).toContain("**作者：** 张三");
      expect(doc).toContain("**发布时间：** 2026-09-01");
      expect(doc).toContain("**描述：** 这是测试描述");
      expect(doc).toContain("---");
      expect(doc).toContain("## 正文开始\n\n正文第一段。");
    });
  });

  describe("resolveSiblingDocHPath", () => {
    it("resolves sibling path when current doc is inside a directory", () => {
      expect(resolveSiblingDocHPath("/资料库/技术/React深入", "新网页")).toBe("/资料库/技术/新网页");
    });

    it("resolves sibling path when current doc is in root", () => {
      expect(resolveSiblingDocHPath("/今日随笔", "新网页")).toBe("/新网页");
      expect(resolveSiblingDocHPath("/", "新网页")).toBe("/新网页");
      expect(resolveSiblingDocHPath("", "新网页")).toBe("/新网页");
    });
  });

  describe("X/Twitter post handling", () => {
    it("identifies x.com and twitter.com URLs and extracts post IDs", () => {
      expect(extractXPostId("https://x.com/username/status/1234567890")).toBe("1234567890");
      expect(extractXPostId("https://twitter.com/user/status/9876543210?s=20")).toBe("9876543210");
      expect(extractXPostId("https://example.com/status/123")).toBeNull();
      expect(isXPostUrl("https://x.com/foo/status/111")).toBe(true);
      expect(isXPostUrl("https://example.com")).toBe(false);
    });

    it("extracts the first paragraph content as document title", () => {
      const tweetText = `
大模型在搞设计这块终于有重大突破了！

详细测评如下：
1. 界面生成更加自然
2. 代码导出无缝衔接
更多见 https://t.co/abc12345
      `;
      const title = extractXFirstParagraphTitle(tweetText);
      expect(title).toBe("大模型在搞设计这块终于有重大突破了！");
    });

    it("strips t.co links and leading mention when extracting first paragraph title", () => {
      const text = "@OpenAI 刚刚发布了全模态模型，支持图像与音频实时生成 https://t.co/xyz";
      const title = extractXFirstParagraphTitle(text);
      expect(title).toBe("刚刚发布了全模态模型，支持图像与音频实时生成");
    });

    it("formats x post markdown preserving paragraph line breaks", () => {
      const text = "第一段文本介绍。\n\n第二段深入解析核心逻辑。\n第三段总结。https://t.co/abc";
      const photos = ["https://pbs.twimg.com/media/1.jpg"];
      const quote = {
        author: "someone",
        text: "引用的推文首段。\n引用的推文次段。",
      };

      const md = formatXPostMarkdown(text, photos, quote);
      expect(md).toContain("第一段文本介绍。\n\n第二段深入解析核心逻辑。\n\n第三段总结。");
      expect(md).toContain("![图片](https://pbs.twimg.com/media/1.jpg)");
      expect(md).toContain("> **引用 @someone：**");
      expect(md).toContain("> 引用的推文首段。");
      expect(md).toContain("> 引用的推文次段。");
    });

    it("preserves explicit line breaks in text nodes and converts br to paragraph breaks", () => {
      const html = `
        <div>
          <p>第一行文本<br>第二行文本</p>
          <div>段落一文本内容\n\n段落二文本内容</div>
        </div>
      `;
      const md = cleanAndConvertHtmlToMarkdown(html, "https://example.com");
      expect(md).toContain("第一行文本\n\n第二行文本");
      expect(md).toContain("段落一文本内容\n\n段落二文本内容");
    });

    it("extracts first paragraph title from X page HTML metadata", () => {
      const html = `
        <html>
          <head>
            <title>User on X: "测试推文标题正文第一段内容。 更多后续详情分析..." / X</title>
            <meta property="og:description" content="测试推文标题正文第一段内容。\n\n这是第二段内容，包含分析。" />
          </head>
          <body>
            <article>测试推文</article>
          </body>
        </html>
      `;
      const meta = extractWebMetadataFromHtml(html, "https://x.com/user/status/12345");
      expect(meta.title).toBe("测试推文标题正文第一段内容。");
    });

    it("parses VxTwitter response correctly with full text and media", () => {
      const vxData = {
        tweetID: "2096129449725174257",
        text: "别再问我 2026 大陆用户还有什么 U 卡值得开了！！！\n\n我整理了目前中国大陆用户最值得开的 6 张卡：\n\n1. Gate U 卡\n身份证可开\n\n2. Bybit U 卡\n免年费\n\n3. PokePay\n护照开\n\n4. Starryblu\n\n5. MEXC\n\n6. BiyaPay\n\n补充欢迎评论！",
        user_name: "Suu",
        user_screen_name: "Suu766",
        date: "Sat Sep 05 06:52:59 +0000 2026",
        mediaURLs: ["https://pbs.twimg.com/media/HRbyg2paMAA8kz1.jpg"],
        media_extended: [
          {
            type: "video",
            url: "https://video.twimg.com/ext_tw_video/123.mp4",
          },
        ],
      };

      const parsed = parseVxTwitterResponse(vxData);
      expect(parsed).not.toBeNull();
      expect(parsed?.id).toBe("2096129449725174257");
      expect(parsed?.authorName).toBe("Suu");
      expect(parsed?.authorScreenName).toBe("Suu766");
      expect(parsed?.text).toContain("6. BiyaPay");
      expect(parsed?.mediaUrls).toContain("https://pbs.twimg.com/media/HRbyg2paMAA8kz1.jpg?name=orig");
      expect(parsed?.videoUrls).toContain("https://video.twimg.com/ext_tw_video/123.mp4");
    });

    it("parses FxTwitter response correctly", () => {
      const fxData = {
        code: 200,
        tweet: {
          id: "2096129449725174257",
          text: "别再问我 2026 大陆用户还有什么 U 卡值得开了！！！\n\n截断的正文...",
          author: {
            name: "Suu",
            screen_name: "Suu766",
          },
          created_at: "2026-09-05",
          media: {
            photos: [{ url: "https://pbs.twimg.com/media/test.jpg?name=orig" }],
          },
        },
      };

      const parsed = parseFxTwitterResponse(fxData);
      expect(parsed).not.toBeNull();
      expect(parsed?.id).toBe("2096129449725174257");
      expect(parsed?.text).toBe("别再问我 2026 大陆用户还有什么 U 卡值得开了！！！\n\n截断的正文...");
      expect(parsed?.mediaUrls).toContain("https://pbs.twimg.com/media/test.jpg?name=orig");
    });

    it("merges VxTwitter and FxTwitter data prioritizing the longer full text (anti-truncation)", () => {
      const vx = {
        id: "2096129449725174257",
        text: "别再问我 2026 大陆用户还有什么 U 卡值得开了！！！\n\n完整的正文内容，包含第 1 到第 6 项所有完整内容，无截断。",
        authorName: "Suu",
        authorScreenName: "Suu766",
        publishTime: "Sat Sep 05 06:52:59 +0000 2026",
        mediaUrls: ["https://pbs.twimg.com/media/img.jpg"],
        videoUrls: [],
      };

      const fx = {
        id: "2096129449725174257",
        text: "别再问我 2026 大陆用户还有什么 U 卡值得开了！！！\n\n截断正文",
        authorName: "Suu",
        authorScreenName: "Suu766",
        publishTime: "Sat Sep 05 06:52:59 +0000 2026",
        mediaUrls: ["https://pbs.twimg.com/media/img.jpg?name=orig"],
        videoUrls: [],
      };

      const merged = mergeXPostData(vx, fx);
      expect(merged).not.toBeNull();
      // 必须优先选用更长、更完整的 VxTwitter 文本
      expect(merged?.text).toBe("别再问我 2026 大陆用户还有什么 U 卡值得开了！！！\n\n完整的正文内容，包含第 1 到第 6 项所有完整内容，无截断。");
      // 媒体合并时保留高清参数 ?name=orig
      expect(merged?.mediaUrls).toEqual(["https://pbs.twimg.com/media/img.jpg?name=orig"]);
    });

    it("renders X Article Draft.js content into markdown with covers, headers, and links", () => {
      const article = {
        title: "2026 深度学习前沿思考",
        cover_media: {
          media_info: {
            original_img_url: "https://pbs.twimg.com/media/cover.jpg",
          },
        },
        content: {
          blocks: [
            { type: "header-one", text: "引言与背景" },
            {
              type: "unstyled",
              text: "欢迎访问 OpenAI 官网了解更多。",
              entityRanges: [{ key: "0", offset: 5, length: 6 }],
            },
            { type: "unordered-list-item", text: "要点一：推理扩展定律" },
            { type: "unordered-list-item", text: "要点二：具身智能落地" },
          ],
          entityMap: {
            "0": {
              type: "LINK",
              data: { url: "https://openai.com" },
            },
          },
        },
      };

      const md = renderXArticleToMarkdown(article, "推文导语前言");
      expect(md).toContain("![封面图片](https://pbs.twimg.com/media/cover.jpg)");
      expect(md).toContain("> 推文导语前言");
      expect(md).toContain("# 引言与背景");
      expect(md).toContain("[OpenAI](https://openai.com)");
      expect(md).toContain("- 要点一：推理扩展定律");
      expect(md).toContain("- 要点二：具身智能落地");
    });

    it("renders X Article atomic media blocks with Draft.js array entityMap structure", () => {
      const article = {
        title: "Grok bot 设计团队背后的设计理念",
        cover_media: {
          media_info: {
            original_img_url: "https://pbs.twimg.com/media/cover.jpg",
          },
        },
        content: {
          blocks: [
            { type: "header-one", text: "设计理念" },
            {
              type: "atomic",
              text: " ",
              entityRanges: [{ key: 0, length: 1, offset: 0 }],
            },
            { type: "unstyled", text: "正文分析..." },
          ],
          entityMap: [
            {
              key: "0",
              value: {
                type: "MEDIA",
                data: {
                  mediaItems: [{ mediaId: "2095778064135311362" }],
                },
              },
            },
          ],
        },
        media_entities: [
          {
            media_id: "2095778064135311362",
            media_info: {
              original_img_url: "https://pbs.twimg.com/media/HRWzC6DXUAIpbEd.jpg",
            },
          },
        ],
      };

      const md = renderXArticleToMarkdown(article);
      expect(md).toContain("![封面图片](https://pbs.twimg.com/media/cover.jpg)");
      expect(md).toContain("![图片](https://pbs.twimg.com/media/HRWzC6DXUAIpbEd.jpg)");
      expect(md).toContain("正文分析...");
    });

    it("unwraps image-only anchor links and picture tags to pure markdown images", () => {
      const html = `
        <div>
          <a href="https://x.com/user/status/123/photo/1">
            <img src="https://pbs.twimg.com/media/photo1.jpg" alt="推文配图" />
          </a>
          <picture>
            <source srcset="https://pbs.twimg.com/media/photo2.webp" />
            <img src="https://pbs.twimg.com/media/photo2.jpg" alt="响应式图片" />
          </picture>
        </div>
      `;

      const md = cleanAndConvertHtmlToMarkdown(html, "https://x.com/user/status/123");
      expect(md).toContain("![推文配图](https://pbs.twimg.com/media/photo1.jpg)");
      expect(md).toContain("![响应式图片](https://pbs.twimg.com/media/photo2.jpg)");
      expect(md).not.toContain("[![推文配图]");
    });
  });
});
