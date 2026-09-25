import { describe, expect, it } from "vitest";
import {
  convertTextToLinkInMarkdown,
  extractDomainFromUrl,
  extractLinkTextFromUrl,
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

  describe("extractLinkTextFromUrl", () => {
    it("从 GitHub 仓库 URL 提取仓库名（例如形如 https://github.com/browser-use/jev-ultrafast）", () => {
      expect(extractLinkTextFromUrl("https://github.com/browser-use/jev-ultrafast")).toBe("jev-ultrafast");
      expect(extractLinkTextFromUrl("https://github.com/browser-use/jev-ultrafast/")).toBe("jev-ultrafast");
      expect(extractLinkTextFromUrl("https://github.com/browser-use/jev-ultrafast.git")).toBe("jev-ultrafast");
      expect(extractLinkTextFromUrl("https://github.com/browser-use/jev-ultrafast#readme")).toBe("jev-ultrafast");
      expect(extractLinkTextFromUrl("https://github.com/browser-use/jev-ultrafast?tab=readme")).toBe("jev-ultrafast");
      expect(extractLinkTextFromUrl("https://github.com/browser-use/jev-ultrafast/tree/main/src")).toBe("jev-ultrafast");
      expect(extractLinkTextFromUrl("http://github.com/browser-use/jev-ultrafast")).toBe("jev-ultrafast");
      expect(extractLinkTextFromUrl("github.com/browser-use/jev-ultrafast")).toBe("jev-ultrafast");
      expect(extractLinkTextFromUrl("https://www.github.com/browser-use/jev-ultrafast")).toBe("jev-ultrafast");
    });

    it("从其他常见代码托管平台与模型社区提取仓库名", () => {
      expect(extractLinkTextFromUrl("https://gitee.com/dromara/sa-token")).toBe("sa-token");
      expect(extractLinkTextFromUrl("https://gitlab.com/gitlab-org/gitlab-runner")).toBe("gitlab-runner");
      expect(extractLinkTextFromUrl("https://huggingface.co/THUDM/chatglm3-6b")).toBe("chatglm3-6b");
      expect(extractLinkTextFromUrl("https://codeberg.org/forgejo/forgejo")).toBe("forgejo");
      expect(extractLinkTextFromUrl("https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git")).toBe("linux");
    });

    it("普通网页回退为域名", () => {
      expect(extractLinkTextFromUrl("https://www.baidu.com")).toBe("www.baidu.com");
      expect(extractLinkTextFromUrl("http://www.google.com/search?q=test")).toBe("www.google.com");
      expect(extractLinkTextFromUrl("https://github.com/foo")).toBe("github.com");
      expect(extractLinkTextFromUrl("https://github.com")).toBe("github.com");
      expect(extractLinkTextFromUrl("192.168.1.1")).toBe("192.168.1.1");
      expect(extractLinkTextFromUrl("mailto:user@example.com")).toBe("example.com");
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
    it("识别 GitHub 仓库 URL 并生成 [repo](url) 形式的候选链接", () => {
      const text = "项目地址：https://github.com/browser-use/jev-ultrafast ，欢迎 star！";
      const candidates = findCandidatesInMarkdown(text, "b_repo");
      expect(candidates).toHaveLength(1);
      expect(candidates[0].originalUrl).toBe("https://github.com/browser-use/jev-ultrafast");
      expect(candidates[0].linkText).toBe("jev-ultrafast");
      expect(candidates[0].domain).toBe("github.com");
      expect(candidates[0].linkMarkdown).toBe("[jev-ultrafast](https://github.com/browser-use/jev-ultrafast)");
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

    it("将形如 https://github.com/browser-use/jev-ultrafast 的网址转为 [jev-ultrafast](https://github.com/browser-use/jev-ultrafast)", () => {
      const markdown = "项目推荐：https://github.com/browser-use/jev-ultrafast 非常强大！";
      const selectedUrls = new Set(["https://github.com/browser-use/jev-ultrafast"]);

      const { markdown: result, replacedCount } = convertTextToLinkInMarkdown(markdown, selectedUrls);
      expect(replacedCount).toBe(1);
      expect(result).toBe("项目推荐：[jev-ultrafast](https://github.com/browser-use/jev-ultrafast) 非常强大！");
    });

    it("正确处理末尾带标点符号的 GitHub 仓库网址转换", () => {
      const markdown = "参考文档见 https://github.com/browser-use/jev-ultrafast。";
      const selectedUrls = new Set(["https://github.com/browser-use/jev-ultrafast"]);

      const { markdown: result, replacedCount } = convertTextToLinkInMarkdown(markdown, selectedUrls);
      expect(replacedCount).toBe(1);
      expect(result).toBe("参考文档见 [jev-ultrafast](https://github.com/browser-use/jev-ultrafast)。");
    });
  });
});
