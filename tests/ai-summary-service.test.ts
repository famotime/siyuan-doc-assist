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
