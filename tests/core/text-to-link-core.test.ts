import { describe, expect, it } from "vitest";
import {
  convertTextToLinkInMarkdown,
  extractDomainFromUrl,
  findCandidatesInMarkdown,
  sanitizeUrlMatch,
} from "@/core/text-to-link-core";

describe("text-to-link-core", () => {
  describe("extractDomainFromUrl", () => {
    it("从标准 http/https URL 提取域名", () => {
      expect(extractDomainFromUrl("https://github.com/owner/repo")).toBe("github.com");
      expect(extractDomainFromUrl("http://www.google.com/search?q=test")).toBe("www.google.com");
      expect(extractDomainFromUrl("https://sub.domain.co.uk:8080/path")).toBe("sub.domain.co.uk");
    });

    it("从无协议头的域名中提取域名", () => {
      expect(extractDomainFromUrl("www.example.com/page")).toBe("www.example.com");
    });
  });

  describe("sanitizeUrlMatch", () => {
    it("去除末尾标点符号及不匹配的括号", () => {
      expect(sanitizeUrlMatch("https://example.com/path。").url).toBe("https://example.com/path");
      expect(sanitizeUrlMatch("https://example.com/path,").url).toBe("https://example.com/path");
      expect(sanitizeUrlMatch("https://example.com/path)").url).toBe("https://example.com/path");
    });
  });

  describe("findCandidatesInMarkdown", () => {
    it("扫描普通文本中的纯文本 URL", () => {
      const text = "请访问 https://github.com/foo 查看源码，或者访问 www.baidu.com 搜索。";
      const candidates = findCandidatesInMarkdown(text, "b1");
      expect(candidates).toHaveLength(2);

      expect(candidates[0].originalUrl).toBe("https://github.com/foo");
      expect(candidates[0].domain).toBe("github.com");
      expect(candidates[0].linkMarkdown).toBe("[github.com](https://github.com/foo)");

      expect(candidates[1].originalUrl).toBe("www.baidu.com");
      expect(candidates[1].targetUrl).toBe("https://www.baidu.com");
      expect(candidates[1].domain).toBe("www.baidu.com");
      expect(candidates[1].linkMarkdown).toBe("[www.baidu.com](https://www.baidu.com)");
    });

    it("忽略代码块、行内代码、既有链接和图片中的 URL", () => {
      const markdown = `
请访问 https://valid.com。

代码块：
\`\`\`js
const url = "https://code-block.com";
\`\`\`

行内代码：\`https://inline-code.com\`

既有 Markdown 链接：[示例链接](https://existing-link.com)

Markdown 图片：![图片](https://image.com/a.jpg)

HTML 链接：<a href="https://html-link.com">点击</a>
      `;

      const candidates = findCandidatesInMarkdown(markdown, "b2");
      expect(candidates).toHaveLength(1);
      expect(candidates[0].originalUrl).toBe("https://valid.com");
    });
  });

    it("支持扫描并解析 mailto:、IPv4 以及中文/Unicode 域名与路径 URL", () => {
      const text = `
联系邮箱：mailto:user@example.com。
本地服务器：192.168.1.1。
中文测试地址：https://例子.测试/路径?参数=值。
      `;
      const candidates = findCandidatesInMarkdown(text, "b_custom");
      expect(candidates).toHaveLength(3);

      expect(candidates[0].originalUrl).toBe("mailto:user@example.com");
      expect(candidates[0].targetUrl).toBe("mailto:user@example.com");
      expect(candidates[0].domain).toBe("example.com");
      expect(candidates[0].linkMarkdown).toBe("[example.com](mailto:user@example.com)");

      expect(candidates[1].originalUrl).toBe("192.168.1.1");
      expect(candidates[1].targetUrl).toBe("http://192.168.1.1");
      expect(candidates[1].domain).toBe("192.168.1.1");
      expect(candidates[1].linkMarkdown).toBe("[192.168.1.1](http://192.168.1.1)");

      expect(candidates[2].originalUrl).toBe("https://例子.测试/路径?参数=值");
      expect(candidates[2].targetUrl).toBe("https://例子.测试/路径?参数=值");
      expect(candidates[2].domain).toBe("例子.测试");
      expect(candidates[2].linkMarkdown).toBe("[例子.测试](https://例子.测试/路径?参数=值)");
    });

    it("在生成上下文片段时剥离 IAL 属性标记 {: id=...}", () => {
      const markdown = '段落内容 {: id="20260906094133-abc1234" updated="20260906094133"} 请访问 https://github.com/foo 查看源码';
      const candidates = findCandidatesInMarkdown(markdown, "b3");
      expect(candidates).toHaveLength(1);
      expect(candidates[0].contextSnippet).not.toContain("20260906094133");
      expect(candidates[0].contextSnippet).not.toContain("{:");
      expect(candidates[0].contextSnippet).toContain("段落内容 请访问 https://github.com/foo");
    });
  });

  describe("convertTextToLinkInMarkdown", () => {
    it("只替换被勾选选中的 URL", () => {
      const markdown = "访问 https://site1.com 和 https://site2.com 了解更多。";
      const selectedUrls = new Set(["https://site1.com"]);

      const { markdown: result, replacedCount } = convertTextToLinkInMarkdown(markdown, selectedUrls);
      expect(replacedCount).toBe(1);
      expect(result).toBe("访问 [site1.com](https://site1.com) 和 https://site2.com 了解更多。");
    });
  });
});
