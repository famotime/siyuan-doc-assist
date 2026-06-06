import { describe, expect, test, vi } from "vitest";
import { createAiSummaryService } from "@/services/ai-summary";

describe("ai summary service", () => {
  test("returns indexed summary when a fresh external summary is available", async () => {
    const forwardProxy = vi.fn();
    const loadFreshDocumentSummary = vi.fn().mockResolvedValue({
      summaryShort: "这是索引里的摘要。",
      summaryMedium: "这是索引里的较长摘要。",
      indexedAt: "2026-04-03T15:02:08.012Z",
    });
    const service = createAiSummaryService({
      forwardProxy,
      loadFreshDocumentSummary,
    });

    const result = await service.generateDocumentSummary({
      config: {
        enabled: true,
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        model: "gpt-4.1-mini",
        requestTimeoutSeconds: 45,
      },
      documentId: "doc-1",
      documentUpdatedAt: "20260403150208",
      documentTitle: "AI 摘要测试",
      documentMarkdown: "# 标题\n\n正文第一段\n\n正文第二段",
    });

    expect(result).toBe("这是索引里的摘要。");
    expect(loadFreshDocumentSummary).toHaveBeenCalledWith({
      documentId: "doc-1",
      documentUpdatedAt: "20260403150208",
    });
    expect(forwardProxy).not.toHaveBeenCalled();
  });

  test("returns indexed summary even when local AI config is disabled", async () => {
    const forwardProxy = vi.fn();
    const loadFreshDocumentSummary = vi.fn().mockResolvedValue({
      summaryShort: "这是索引里的摘要。",
      summaryMedium: "这是索引里的较长摘要。",
      indexedAt: "2026-04-03T15:02:08.012Z",
    });
    const service = createAiSummaryService({
      forwardProxy,
      loadFreshDocumentSummary,
    });

    const result = await service.generateDocumentSummary({
      config: {
        enabled: false,
        baseUrl: "",
        apiKey: "",
        model: "",
        requestTimeoutSeconds: 45,
      },
      documentId: "doc-1",
      documentUpdatedAt: "20260403150208",
      documentTitle: "AI 摘要测试",
      documentMarkdown: "# 标题\n\n正文第一段\n\n正文第二段",
    });

    expect(result).toBe("这是索引里的摘要。");
    expect(forwardProxy).not.toHaveBeenCalled();
  });

  test("falls back to chat completion when no fresh external summary is available", async () => {
    const forwardProxy = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: "  这是精简后的文档摘要。  ",
            },
          },
        ],
      }),
    });
    const loadFreshDocumentSummary = vi.fn().mockResolvedValue(null);
    const service = createAiSummaryService({
      forwardProxy,
      loadFreshDocumentSummary,
    });

    const result = await service.generateDocumentSummary({
      config: {
        enabled: true,
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        model: "gpt-4.1-mini",
        requestTimeoutSeconds: 45,
      },
      documentId: "doc-1",
      documentUpdatedAt: "20260403150208",
      documentTitle: "AI 摘要测试",
      documentMarkdown: "# 标题\n\n正文第一段\n\n正文第二段",
    });

    expect(result).toBe("这是精简后的文档摘要。");
    expect(loadFreshDocumentSummary).toHaveBeenCalledWith({
      documentId: "doc-1",
      documentUpdatedAt: "20260403150208",
    });
    expect(forwardProxy).toHaveBeenCalledTimes(1);
  });

  test("requests a summary from an OpenAI-compatible chat completion endpoint", async () => {
    const forwardProxy = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: "  这是精简后的文档摘要。  ",
            },
          },
        ],
      }),
    });
    const service = createAiSummaryService({ forwardProxy });

    const result = await service.generateDocumentSummary({
      config: {
        enabled: true,
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        model: "gpt-4.1-mini",
        requestTimeoutSeconds: 45,
      },
      documentTitle: "AI 摘要测试",
      documentMarkdown: "# 标题\n\n正文第一段\n\n正文第二段",
    });

    expect(result).toBe("这是精简后的文档摘要。");
    expect(forwardProxy).toHaveBeenCalledWith(
      "https://api.example.com/v1/chat/completions",
      "POST",
      expect.stringContaining("\"model\":\"gpt-4.1-mini\""),
      [
        { Authorization: "Bearer sk-test" },
        { Accept: "application/json" },
      ],
      45000,
      "application/json"
    );
    expect(String(forwardProxy.mock.calls[0]?.[2] || "")).toContain("文档正文");
    expect(String(forwardProxy.mock.calls[0]?.[2] || "")).toContain("正文第一段");
  });

  test("requests a concept map from an OpenAI-compatible chat completion endpoint", async () => {
    const forwardProxy = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: [
                { type: "text", text: "  - 核心主题：聚焦主题脉络。\n  - 关键概念：补充核心概念间关系。  " },
              ],
            },
          },
        ],
      }),
    });
    const service = createAiSummaryService({ forwardProxy });

    const result = await (service as any).generateDocumentConceptMap({
      config: {
        enabled: true,
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        model: "gpt-4.1-mini",
        requestTimeoutSeconds: 45,
      },
      documentTitle: "ClaudeCode 主题",
      documentMarkdown: "# 标题\n\n正文第一段\n\n正文第二段",
    });

    expect(result).toBe("- 核心主题：聚焦主题脉络。\n  - 关键概念：补充核心概念间关系。");
    expect(forwardProxy).toHaveBeenCalledWith(
      "https://api.example.com/v1/chat/completions",
      "POST",
      expect.stringContaining("\"model\":\"gpt-4.1-mini\""),
      [
        { Authorization: "Bearer sk-test" },
        { Accept: "application/json" },
      ],
      45000,
      "application/json"
    );
    expect(String(forwardProxy.mock.calls[0]?.[2] || "")).toContain("生成该主题的概念地图");
    expect(String(forwardProxy.mock.calls[0]?.[2] || "")).toContain("总-分-细节");
    expect(String(forwardProxy.mock.calls[0]?.[2] || "")).toContain("不超过15字");
    expect(String(forwardProxy.mock.calls[0]?.[2] || "")).toContain("20-100字");
    expect(String(forwardProxy.mock.calls[0]?.[2] || "")).toContain("最多5层");
    expect(String(forwardProxy.mock.calls[0]?.[2] || "")).toContain("没有标题和普通正文段落");
  });

  test("concept map request includes related documents in the prompt", async () => {
    const forwardProxy = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: "- 核心主题：综合概念。\n  - 子文档要点：子文档内容概述。",
            },
          },
        ],
      }),
    });
    const service = createAiSummaryService({ forwardProxy });

    const result = await (service as any).generateDocumentConceptMap({
      config: {
        enabled: true,
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        model: "gpt-4.1-mini",
        requestTimeoutSeconds: 45,
      },
      documentTitle: "主题文档",
      documentMarkdown: "# 主题\n\n正文内容",
      relatedDocuments: [
        { title: "子文档A", markdown: "子文档A 的正文内容" },
        { title: "链接文档B", markdown: "链接文档B 的正文内容" },
      ],
    });

    expect(result).toBe("- 核心主题：综合概念。\n  - 子文档要点：子文档内容概述。");
    const body = String(forwardProxy.mock.calls[0]?.[2] || "");
    expect(body).toContain("关联文档");
    expect(body).toContain("子文档A");
    expect(body).toContain("子文档A 的正文内容");
    expect(body).toContain("链接文档B");
    expect(body).toContain("链接文档B 的正文内容");
    expect(body).toContain("综合提炼跨文档的层次化概念关系");
  });

  test("concept map request without related documents omits related section", async () => {
    const forwardProxy = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: "- 核心主题：单一文档概念。",
            },
          },
        ],
      }),
    });
    const service = createAiSummaryService({ forwardProxy });

    await (service as any).generateDocumentConceptMap({
      config: {
        enabled: true,
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        model: "gpt-4.1-mini",
        requestTimeoutSeconds: 45,
      },
      documentTitle: "主题文档",
      documentMarkdown: "# 主题\n\n正文内容",
    });

    const body = String(forwardProxy.mock.calls[0]?.[2] || "");
    expect(body).not.toContain("关联文档");
    expect(body).not.toContain("综合提炼跨文档");
  });

  test("falls back to reasoning_content when content is empty (reasoning model)", async () => {
    const forwardProxy = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        choices: [
          {
            finish_reason: "length",
            message: {
              content: "",
              role: "assistant",
              reasoning_content: "嗯，用户要求生成摘要。这个文档主要介绍了搜索替换插件的功能特性。摘要：这是一个类似 VS Code 风格的搜索替换插件，支持正则表达式、大小写匹配等功能。",
            },
          },
        ],
      }),
    });
    const service = createAiSummaryService({ forwardProxy });

    const result = await service.generateDocumentSummary({
      config: {
        enabled: true,
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        model: "mimo-v2.5-pro",
        requestTimeoutSeconds: 60,
        maxTokens: 2048,
      },
      documentTitle: "搜索替换插件",
      documentMarkdown: "# 搜索替换插件\n\n支持正则表达式、大小写匹配等功能。",
    });

    expect(result).toContain("搜索替换插件");
    expect(forwardProxy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(forwardProxy.mock.calls[0]?.[2] || "{}");
    expect(body.max_tokens).toBe(2048);
  });

  test("throws a readable error when config is incomplete", async () => {
    const service = createAiSummaryService({
      forwardProxy: vi.fn(),
    });

    await expect(service.generateDocumentSummary({
      config: {
        enabled: true,
        baseUrl: "",
        apiKey: "",
        model: "",
        requestTimeoutSeconds: 30,
      },
      documentMarkdown: "正文",
    })).rejects.toThrow("AI 服务配置不完整");
  });
});
