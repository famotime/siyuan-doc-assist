import { describe, expect, test, vi } from "vitest";
import {
  createAiSlopMarkerService,
  createAiKeyContentMarkerService,
} from "@/services/ai-slop-marker";
import { buildIrrelevantParagraphMessages } from "@/services/ai-slop-marker-prompts";

describe("ai slop marker service", () => {
  test("uses a more active but still conservative prompt for irrelevant paragraphs", () => {
    const messages = buildIrrelevantParagraphMessages({
      documentTitle: "示例文档",
      paragraphs: [
        { id: "p1", markdown: "关注公众号获取资料。" },
        { id: "p2", markdown: "这里是正文论点。" },
      ],
    });

    const systemPrompt = String(messages[0]?.content || "");
    expect(systemPrompt).toContain("明显不承载正文信息价值");
    expect(systemPrompt).toContain("应标记");
    expect(systemPrompt).toContain("不确定");
    expect(systemPrompt).toContain("保留");
    expect(systemPrompt).toContain("事实信息");
    expect(systemPrompt).toContain("代码");
  });

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
    expect(String(forwardProxy.mock.calls[0]?.[2] || "")).toContain("segmentIds");
    expect(String(forwardProxy.mock.calls[0]?.[2] || "")).toContain("\\\"paragraphId\\\":\\\"p3\\\"");
  });

  test("extracts irrelevant paragraph segments from AI response", async () => {
    const forwardProxy = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                paragraphs: [
                  {
                    paragraphId: "p1",
                    segments: ["关注公众号获取资料", "关注公众号获取资料", "不存在片段"],
                  },
                  {
                    id: "p2",
                    snippets: ["欢迎加入交流群"],
                  },
                  {
                    paragraphId: "missing",
                    segments: ["忽略我"],
                  },
                ],
              }),
            },
          },
        ],
      }),
    });
    const service = createAiSlopMarkerService({ forwardProxy });

    const result = await service.detectIrrelevantParagraphMarks({
      config: {
        enabled: true,
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        model: "gpt-4.1-mini",
        requestTimeoutSeconds: 45,
      },
      paragraphs: [
        { id: "p1", markdown: "这里是正文。关注公众号获取资料。" },
        { id: "p2", markdown: "欢迎加入交流群。" },
      ],
    });

    expect(result).toEqual([
      { paragraphId: "p1", segments: ["关注公众号获取资料"] },
      { paragraphId: "p2", segments: ["欢迎加入交流群"] },
    ]);
  });

  test("requests irrelevant segment ids instead of raw segment text", async () => {
    const forwardProxy = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: "{\"segmentIds\":[\"s2\"]}",
            },
          },
        ],
      }),
    });
    const service = createAiSlopMarkerService({ forwardProxy });

    const result = await service.detectIrrelevantParagraphMarks({
      config: {
        enabled: true,
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        model: "mimo-v2-omni",
        requestTimeoutSeconds: 45,
      },
      paragraphs: [
        {
          id: "p1",
          markdown: "这里是核心正文。关注公众号“示例”，回复关键词领取资料。后续继续说明正文重点。",
        },
      ],
    });

    const body = JSON.parse(String(forwardProxy.mock.calls[0]?.[2] || "{}"));
    const promptText = JSON.stringify(body.messages);
    const userContent = String(body.messages?.[1]?.content || "");
    expect(promptText).toContain("segmentIds");
    expect(userContent).toContain("\"id\":\"s2\"");
    expect(promptText).not.toContain("\"segments\":[\"应删除的原文片段1");
    expect(result).toEqual([
      {
        paragraphId: "p1",
        segments: ["关注公众号“示例”，回复关键词领取资料。"],
      },
    ]);
  });

  test("sends plain candidate text while preserving markdown source for updates", async () => {
    const forwardProxy = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: "{\"segmentIds\":[\"s1\"]}",
            },
          },
        ],
      }),
    });
    const service = createAiSlopMarkerService({ forwardProxy });

    const result = await service.detectIrrelevantParagraphMarks({
      config: {
        enabled: true,
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        model: "mimo-v2-omni",
        requestTimeoutSeconds: 45,
      },
      paragraphs: [
        {
          id: "p1",
          markdown: "**关注公众号“示例”**，回复关键词领取资料。这里是正文。",
        },
      ],
    });

    const body = JSON.parse(String(forwardProxy.mock.calls[0]?.[2] || "{}"));
    const userContent = String(body.messages?.[1]?.content || "");
    expect(userContent).toContain("关注公众号“示例”，回复关键词领取资料。");
    expect(userContent).not.toContain("**关注公众号");
    expect(result).toEqual([
      {
        paragraphId: "p1",
        segments: ["**关注公众号“示例”**，回复关键词领取资料。"],
      },
    ]);
  });

  test("keeps legacy paragraphIds responses as whole-paragraph marks", async () => {
    const forwardProxy = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: "{\"paragraphIds\":[\"p2\",\"missing\",\"p1\",\"p2\"]}",
            },
          },
        ],
      }),
    });
    const service = createAiSlopMarkerService({ forwardProxy });

    const result = await service.detectIrrelevantParagraphMarks({
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
      { paragraphId: "p2", segments: [] },
      { paragraphId: "p1", segments: [] },
    ]);
  });

  test("allocates enough output tokens for long irrelevant paragraph id lists", async () => {
    const forwardProxy = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: "{\"paragraphIds\":[]}",
            },
          },
        ],
      }),
    });
    const service = createAiSlopMarkerService({ forwardProxy });

    await service.detectIrrelevantParagraphIds({
      config: {
        enabled: true,
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        model: "mimo-v2-omni",
        requestTimeoutSeconds: 45,
        maxTokens: 4096,
      },
      paragraphs: Array.from({ length: 40 }, (_, index) => ({
        id: `20260517103907-${String(index).padStart(7, "0")}`,
        markdown: `第 ${index + 1} 段候选内容`,
      })),
    });

    const body = JSON.parse(String(forwardProxy.mock.calls[0]?.[2] || "{}"));
    expect(body.max_tokens).toBeGreaterThanOrEqual(2048);
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

  test("accepts segmented message content arrays when extracting irrelevant paragraph ids", async () => {
    const forwardProxy = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: [
                { text: "```json\n" },
                { text: "{\"paragraphIds\":[\"p2\",\"missing\"]}" },
                { text: "\n```" },
              ],
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
      paragraphs: [
        { id: "p1", markdown: "第一段" },
        { id: "p2", markdown: "第二段" },
      ],
    });

    expect(result).toEqual(["p2"]);
  });

  test("reports truncated irrelevant paragraph JSON with an actionable error", async () => {
    const service = createAiSlopMarkerService({
      forwardProxy: vi.fn().mockResolvedValue({
        status: 200,
        body: JSON.stringify({
          choices: [
            {
              message: {
                content: "{\"paragraphIds\":[\"20260517103907-jfmqfut\",\"2026051",
              },
            },
          ],
        }),
      }),
    });

    await expect(service.detectIrrelevantParagraphIds({
      config: {
        enabled: true,
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        model: "mimo-v2-omni",
        requestTimeoutSeconds: 45,
      },
      paragraphs: [
        { id: "20260517103907-jfmqfut", markdown: "第一段" },
      ],
    })).rejects.toThrow("可能被模型截断");
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
    expect(String(forwardProxy.mock.calls[0]?.[2] || "")).toContain("segmentIds");
    expect(String(forwardProxy.mock.calls[0]?.[2] || "")).toContain("\\\"paragraphId\\\":\\\"p2\\\"");
  });

  test("requests key-content segment ids instead of raw highlight text", async () => {
    const forwardProxy = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: "{\"segmentIds\":[\"s1\"]}",
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
        model: "mimo-v2-omni",
        requestTimeoutSeconds: 45,
      },
      paragraphs: [
        {
          id: "p1",
          markdown: "作者提出要用**检索增强生成**提升准确率，并强调评测闭环。普通背景介绍。",
        },
      ],
    });

    const body = JSON.parse(String(forwardProxy.mock.calls[0]?.[2] || "{}"));
    const promptText = JSON.stringify(body.messages);
    const userContent = String(body.messages?.[1]?.content || "");
    expect(promptText).toContain("segmentIds");
    expect(userContent).toContain("\"id\":\"s1\"");
    expect(userContent).toContain("检索增强生成");
    expect(userContent).not.toContain("**检索增强生成**");
    expect(result).toEqual([
      {
        paragraphId: "p1",
        highlights: ["作者提出要用**检索增强生成**提升准确率，并强调评测闭环。"],
      },
    ]);
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
