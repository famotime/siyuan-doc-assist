import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderKramdownToBlockDOM } from "@/services/kernel";
import { requestApi } from "@/services/request";

vi.mock("@/services/request", () => ({
  requestApi: vi.fn(),
}));

describe("renderKramdownToBlockDOM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as any).window;
  });

  test("returns empty string when kramdown is empty", async () => {
    const result = await renderKramdownToBlockDOM("");
    expect(result).toBe("");
    expect(requestApi).not.toHaveBeenCalled();
  });

  test("uses protyle.lute.Md2BlockDOM when protyle is provided", async () => {
    const fakeLute = {
      Md2BlockDOM: vi.fn((md: string) => `<div data-node-id="b1">${md}</div>`),
    };
    const protyle = { lute: fakeLute };

    const result = await renderKramdownToBlockDOM("测试段落", protyle);
    expect(fakeLute.Md2BlockDOM).toHaveBeenCalledWith("测试段落");
    expect(result).toBe('<div data-node-id="b1">测试段落</div>');
    expect(requestApi).not.toHaveBeenCalled();
  });

  test("uses window.Lute.New().Md2BlockDOM when protyle is not provided", async () => {
    const fakeLuteInstance = {
      Md2BlockDOM: vi.fn((md: string) => `<div class="block-dom">${md}</div>`),
    };
    (globalThis as any).window = {
      Lute: {
        New: vi.fn(() => fakeLuteInstance),
      },
    };

    const result = await renderKramdownToBlockDOM("# 标题内容");
    expect((globalThis as any).window.Lute.New).toHaveBeenCalled();
    expect(fakeLuteInstance.Md2BlockDOM).toHaveBeenCalledWith("# 标题内容");
    expect(result).toBe('<div class="block-dom"># 标题内容</div>');
    expect(requestApi).not.toHaveBeenCalled();
  });

  test("returns null cleanly and never invokes HTTP API when Lute is unavailable", async () => {
    const result = await renderKramdownToBlockDOM("无环境段落");
    expect(result).toBeNull();
    expect(requestApi).not.toHaveBeenCalled();
  });

  test("returns null cleanly when Lute.Md2BlockDOM throws", async () => {
    const fakeLute = {
      Md2BlockDOM: vi.fn(() => {
        throw new Error("Lute WASM crash simulation");
      }),
    };
    const protyle = { lute: fakeLute };

    const result = await renderKramdownToBlockDOM("异常段落", protyle);
    expect(result).toBeNull();
    expect(requestApi).not.toHaveBeenCalled();
  });
});
