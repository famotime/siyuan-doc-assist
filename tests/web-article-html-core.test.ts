// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import {
  cleanAndConvertHtmlToMarkdown,
  domNodeToMarkdown,
  extractWechatOriginalLink,
  extractWebMetadataFromHtml
} from "@/core/web-article-html-core";

describe("web-article-html-core", () => {
  describe("extractWechatOriginalLink", () => {
    test("extracts wechat link and strips #wechat_redirect", () => {
      const html = `<div>原文链接：https://mp.weixin.qq.com/s/xyz123_456#wechat_redirect</div>`;
      expect(extractWechatOriginalLink(html)).toBe("https://mp.weixin.qq.com/s/xyz123_456");
    });

    test("matches query-style wechat links and bare mp.weixin urls", () => {
      expect(
        extractWechatOriginalLink(`原文链接：https://mp.weixin.qq.com/s?__biz=MzA1&mid=2#wechat_redirect`)
      ).toBe("https://mp.weixin.qq.com/s?__biz=MzA1&mid=2");
      expect(extractWechatOriginalLink("<p>https://mp.weixin.qq.com/s/abcDEF123</p>")).toBe(
        "https://mp.weixin.qq.com/s/abcDEF123"
      );
    });

    test("returns null when no wechat link exists", () => {
      expect(extractWechatOriginalLink("普通网页无微信链接")).toBeNull();
      expect(extractWechatOriginalLink("")).toBeNull();
    });
  });

  describe("extractWebMetadataFromHtml", () => {
    test("extracts wechat article metadata correctly", () => {
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

    test("extracts standard article metadata", () => {
      const html = `
        <html>
          <head>
            <title>标准博客 - 技术分享</title>
            <meta property="og:title" content="博客大标题" />
            <meta name="description" content="这是一篇精彩的技术文章" />
            <meta name="author" content="李四" />
            <meta property="article:published_time" content="2026-08-15" />
          </head>
          <body><h1>博客大标题</h1></body>
        </html>
      `;
      const meta = extractWebMetadataFromHtml(html, "https://example.com/blog/1");
      expect(meta.title).toBe("博客大标题");
      expect(meta.author).toBe("李四");
      expect(meta.publishTime).toBe("2026-08-15");
      expect(meta.description).toBe("这是一篇精彩的技术文章");
    });

    test("uses first x post paragraph as title for x urls", () => {
      const html = `
        <html>
          <head>
            <meta property="og:description" content="X帖子首段标题 https://t.co/abc123" />
          </head>
          <body><article><span>正文内容</span></article></body>
        </html>
      `;
      const meta = extractWebMetadataFromHtml(html, "https://x.com/user/status/99");
      expect(meta.title).toBe("X帖子首段标题");
    });
  });

  describe("cleanAndConvertHtmlToMarkdown", () => {
    test("extracts wechat #js_content, handles lazy images and relative links", () => {
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

    test("converts headings, blockquotes, lists, tables, and code blocks", () => {
      const html = `
        <article>
          <h2>章节标题</h2>
          <blockquote>引用的名言警句</blockquote>
          <ul><li>列表第一项</li><li>列表第二项</li></ul>
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
      expect(md).toContain('console.log("hello world");');
      expect(md).toContain("| 项目 | 数值 |");
      expect(md).toContain("| --- | --- |");
    });

    test("unwraps image-only anchors into plain image blocks", () => {
      const html = `<article><a href="https://example.com/post"><img src="https://example.com/pic.jpg" alt="配图" /></a></article>`;
      const md = cleanAndConvertHtmlToMarkdown(html, "https://example.com");
      expect(md).toContain("![配图](https://example.com/pic.jpg)");
    });
  });

  describe("domNodeToMarkdown", () => {
    test("preserves whitespace inside pre blocks", () => {
      const doc = new DOMParser().parseFromString("<pre><code>const a = 1;\n  const b = 2;</code></pre>", "text/html");
      const md = domNodeToMarkdown(doc.body);
      expect(md).toContain("const a = 1;\n  const b = 2;");
    });

    test("escapes table pipes and renders ordered lists", () => {
      const doc = new DOMParser().parseFromString(
        `<ol><li>第一项</li><li>第二项</li></ol><table><tr><td>a|b</td></tr></table>`,
        "text/html"
      );
      const md = domNodeToMarkdown(doc.body);
      expect(md).toContain("1. 第一项");
      expect(md).toContain("2. 第二项");
      expect(md).toContain("a\\|b");
    });

    test("returns empty string for ignored tags", () => {
      const doc = new DOMParser().parseFromString("<script>evil()</script><svg></svg>", "text/html");
      expect(domNodeToMarkdown(doc.body)).toBe("");
    });
  });
});
