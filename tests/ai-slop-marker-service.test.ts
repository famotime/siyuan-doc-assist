import { describe, expect, test, vi } from "vitest";
import { createAiSlopMarkerService } from "@/services/ai-slop-marker";

describe("ai slop marker service", () => {
  test("requests irrelevant paragraph ids from an OpenAI-compatible chat completion endpoint", async () => {
    const forwardProxy = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: "```json\n{\"paragraphIds\":[\"p3\",\"missing\",\"p1\",\"p3\"]}\n```",
            },
          },
        ],
      }),
    });
    const service = createAiSlopMarkerService({ forwardProxy });

    const result = await service.detectIrrelevantParagraphIds({
      config: {
        enabled: true,
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        model: "gpt-4.1-mini",
        requestTimeoutSeconds: 45,
      },
      documentTitle: "AI 口水内容测试",
      paragraphs: [
        { id: "p1", markdown: "栏目说明：以下是栏目介绍。" },
        { id: "p2", markdown: "这是正文重点。" },
        { id: "p3", markdown: "文末广告：欢迎关注公众号。" },
      ],
    });

    expect(result).toEqual(["p3", "p1"]);
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
    expect(String(forwardProxy.mock.calls[0]?.[2] || "")).toContain("paragraphIds");
    expect(String(forwardProxy.mock.calls[0]?.[2] || "")).toContain("\\\"id\\\":\\\"p3\\\"");
  });

  test("throws a readable error when config is incomplete", async () => {
    const service = createAiSlopMarkerService({
      forwardProxy: vi.fn(),
    });

    await expect(service.detectIrrelevantParagraphIds({
      config: {
        enabled: true,
        baseUrl: "",
        apiKey: "",
        model: "",
        requestTimeoutSeconds: 30,
      },
      paragraphs: [{ id: "p1", markdown: "正文" }],
    })).rejects.toThrow("AI 服务配置不完整");
  });
});
