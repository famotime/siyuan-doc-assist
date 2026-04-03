import { describe, expect, test, vi } from "vitest";
import { createAiSummaryService } from "@/services/ai-summary";

describe("ai summary service", () => {
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
