import { describe, expect, it, vi } from "vitest";
import { generateBetterTitles } from "@/services/ai-better-titles";

describe("ai-better-titles service", () => {
  const validConfig = {
    enabled: true,
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test-key",
    model: "test-model",
    requestTimeoutSeconds: 30,
  };

  it("当未启用 AI 时抛出提示错误", async () => {
    await expect(
      generateBetterTitles({
        config: { ...validConfig, enabled: false },
        content: "测试内容",
      })
    ).rejects.toThrow("请先在设置中启用 AI 文档功能");
  });

  it("当配置缺失时抛出提示错误", async () => {
    await expect(
      generateBetterTitles({
        config: { ...validConfig, apiKey: "" },
        content: "测试内容",
      })
    ).rejects.toThrow("AI 服务配置不完整");
  });

  it("成功请求并返回两组标题", async () => {
    const mockProxy = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                catchy: ["钩人标题A", "钩人标题B", "钩人标题C"],
                summary: ["平实标题A", "平实标题B", "平实标题C"],
              }),
            },
          },
        ],
      }),
    });

    const result = await generateBetterTitles({
      config: validConfig,
      documentTitle: "原文档标题",
      content: "文章详细正文...",
      forwardProxy: mockProxy,
    });

    expect(result.catchy).toEqual(["钩人标题A", "钩人标题B", "钩人标题C"]);
    expect(result.summary).toEqual(["平实标题A", "平实标题B", "平实标题C"]);
    expect(mockProxy).toHaveBeenCalledTimes(1);

    const callArgs = mockProxy.mock.calls[0];
    expect(callArgs[0]).toBe("https://api.example.com/v1/chat/completions");
    expect(callArgs[1]).toBe("POST");
  });

  it("当接口返回非 2xx 状态码时抛出错误", async () => {
    const mockProxy = vi.fn().mockResolvedValue({
      status: 500,
      body: "Internal Server Error",
    });

    await expect(
      generateBetterTitles({
        config: validConfig,
        content: "内容",
        forwardProxy: mockProxy,
      })
    ).rejects.toThrow("AI 请求失败（状态码：500）");
  });
});
