import { describe, expect, test, vi } from "vitest";
import {
  createAiSlopMarkerService,
  createAiKeyContentMarkerService,
} from "@/services/ai-slop-marker";

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

  test("requests paragraph highlight fragments from an OpenAI-compatible chat completion endpoint", async () => {
    const forwardProxy = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: "```json\n{\"paragraphs\":[{\"paragraphId\":\"p2\",\"highlights\":[\"检索增强生成\",\"评测闭环\"]},{\"paragraphId\":\"missing\",\"highlights\":[\"忽略我\"]},{\"paragraphId\":\"p2\",\"highlights\":[\"检索增强生成\",\"评测闭环\",\"额外提示\"]},{\"paragraphId\":\"p3\",\"highlights\":[\"  \",123,\"小范围试点\"]}]}\n```",
            },
          },
        ],
      }),
    });
    const service = createAiKeyContentMarkerService({ forwardProxy });

    const result = await service.detectKeyContentParagraphHighlights({
      config: {
        enabled: true,
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        model: "gpt-4.1-mini",
        requestTimeoutSeconds: 45,
      },
      documentTitle: "AI 关键内容测试",
      paragraphs: [
        { id: "p1", markdown: "这里是普通正文。" },
        { id: "p2", markdown: "作者提出要用检索增强生成提升准确率，并强调评测闭环。" },
        { id: "p3", markdown: "最后建议先做小范围试点，再逐步扩展。" },
      ],
    });

    expect(result).toEqual([
      {
        paragraphId: "p2",
        highlights: ["检索增强生成", "评测闭环", "额外提示"],
      },
      {
        paragraphId: "p3",
        highlights: ["小范围试点"],
      },
    ]);
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
    expect(String(forwardProxy.mock.calls[0]?.[2] || "")).toContain("highlights");
    expect(String(forwardProxy.mock.calls[0]?.[2] || "")).toContain("\\\"id\\\":\\\"p2\\\"");
  });

  test("accepts alternative key-content response shapes from AI", async () => {
    const forwardProxy = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                items: [
                  {
                    id: "p1",
                    phrases: ["关键流程", "验收标准"],
                  },
                  {
                    paragraphId: "p2",
                    keywords: ["上线节奏"],
                  },
                ],
              }),
            },
          },
        ],
      }),
    });
    const service = createAiKeyContentMarkerService({ forwardProxy });

    const result = await service.detectKeyContentParagraphHighlights({
      config: {
        enabled: true,
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        model: "gpt-4.1-mini",
        requestTimeoutSeconds: 45,
      },
      paragraphs: [
        { id: "p1", markdown: "第一段" },
        { id: "p2", markdown: "第二段" },
      ],
    });

    expect(result).toEqual([
      {
        paragraphId: "p1",
        highlights: ["关键流程", "验收标准"],
      },
      {
        paragraphId: "p2",
        highlights: ["上线节奏"],
      },
    ]);
  });
});
