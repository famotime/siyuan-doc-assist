import { beforeEach, describe, expect, test, vi } from "vitest";

import { sqlPaged } from "@/services/kernel-shared";
import { requestApi } from "@/services/request";
import { translateDocParagraphs } from "@/services/ai-paragraph-translation";

vi.mock("@/services/kernel-shared", () => ({
  escapeSqlLiteral: vi.fn((value: string) => value.replace(/'/g, "''")),
  sqlPaged: vi.fn()
}));

vi.mock("@/services/kernel", () => ({
  forwardProxy: vi.fn()
}));

vi.mock("@/services/request", () => ({
  requestApi: vi.fn()
}));

const sqlPagedMock = vi.mocked(sqlPaged);
const requestApiMock = vi.mocked(requestApi);

const aiConfig = {
  enabled: true,
  baseUrl: "https://api.example.com",
  apiKey: "key",
  model: "text-model"
};

describe("ai paragraph translation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sqlPagedMock.mockReset();
    requestApiMock.mockReset();
    requestApiMock.mockResolvedValue({});
  });

  test("translates only paragraph blocks containing English letters and inserts after each source block", async () => {
    sqlPagedMock.mockResolvedValueOnce([
      { id: "p1", type: "p", markdown: "Hello world." },
      { id: "p2", type: "p", markdown: "纯中文段落。" },
      { id: "h1", type: "h", markdown: "# Title" },
      { id: "p3", type: "p", markdown: "Second paragraph with AI." }
    ] as any);

    const forwardProxy = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({ choices: [{ message: { content: "你好，世界。" } }] })
      })
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({ choices: [{ message: { content: "第二段包含 AI。" } }] })
      });

    const report = await translateDocParagraphs({
      docId: "doc-1",
      config: aiConfig,
      forwardProxy
    });

    expect(forwardProxy).toHaveBeenCalledTimes(2);
    expect(requestApiMock).toHaveBeenCalledTimes(2);
    expect(requestApiMock).toHaveBeenNthCalledWith(1, "/api/block/insertBlock", {
      dataType: "markdown",
      data: "你好，世界。",
      nextID: "",
      previousID: "p1",
      parentID: ""
    });
    expect(requestApiMock).toHaveBeenNthCalledWith(2, "/api/block/insertBlock", {
      dataType: "markdown",
      data: "第二段包含 AI。",
      nextID: "",
      previousID: "p3",
      parentID: ""
    });
    expect(report.scannedParagraphCount).toBe(3);
    expect(report.translatableParagraphCount).toBe(2);
    expect(report.translatedCount).toBe(2);
    expect(report.insertedCount).toBe(2);
  });

  test("ignores SiYuan block attributes when deciding whether a paragraph needs translation", async () => {
    sqlPagedMock.mockResolvedValueOnce([
      { id: "p1", type: "p", markdown: "纯中文段落。\n{: id=\"20260518120000-abcdefg\"}" }
    ] as any);

    const forwardProxy = vi.fn();

    const report = await translateDocParagraphs({
      docId: "doc-1",
      config: aiConfig,
      forwardProxy
    });

    expect(forwardProxy).not.toHaveBeenCalled();
    expect(requestApiMock).not.toHaveBeenCalled();
    expect(report.scannedParagraphCount).toBe(1);
    expect(report.translatableParagraphCount).toBe(0);
  });

  test("uses a translation-only prompt with the source paragraph", async () => {
    sqlPagedMock.mockResolvedValueOnce([
      { id: "p1", type: "p", markdown: "This is a source paragraph." }
    ] as any);

    const forwardProxy = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({ choices: [{ message: { content: "这是一段源文本。" } }] })
    });

    await translateDocParagraphs({
      docId: "doc-1",
      config: aiConfig,
      forwardProxy
    });

    const body = JSON.parse(forwardProxy.mock.calls[0][2]);
    const promptText = JSON.stringify(body.messages);
    expect(promptText).toContain("只输出中文翻译");
    expect(promptText).toContain("不要添加说明");
    expect(promptText).toContain("This is a source paragraph.");
  });

  test("continues inserting when one insertBlock call fails and counts it as failed", async () => {
    sqlPagedMock.mockResolvedValueOnce([
      { id: "p1", type: "p", markdown: "First paragraph in English." },
      { id: "p2", type: "p", markdown: "Second paragraph in English." }
    ] as any);

    const forwardProxy = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({ choices: [{ message: { content: "第一段。" } }] })
      })
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({ choices: [{ message: { content: "第二段。" } }] })
      });
    requestApiMock
      .mockRejectedValueOnce(new Error("insert failed"))
      .mockResolvedValue({});

    const report = await translateDocParagraphs({
      docId: "doc-1",
      config: aiConfig,
      forwardProxy
    });

    expect(report.translatedCount).toBe(2);
    expect(report.failedCount).toBe(1);
    expect(report.insertedCount).toBe(1);
    expect(requestApiMock).toHaveBeenCalledTimes(2);
  });

  test("reports progress as translation requests complete", async () => {
    sqlPagedMock.mockResolvedValueOnce([
      { id: "p1", type: "p", markdown: "One." },
      { id: "p2", type: "p", markdown: "Two." }
    ] as any);

    const forwardProxy = vi.fn((..._args: unknown[]) =>
      new Promise((resolve) => setTimeout(() => resolve({
        status: 200,
        body: JSON.stringify({ choices: [{ message: { content: "译文。" } }] })
      }), 5))
    );
    const onProgress = vi.fn();

    const reportPromise = translateDocParagraphs({
      docId: "doc-1",
      config: aiConfig,
      forwardProxy,
      onProgress
    });
    await vi.waitFor(() => {
      expect(onProgress).toHaveBeenCalledTimes(2);
    });
    // Progress reflects completed requests, never a jump straight to N/N.
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2, expect.any(String));
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2, expect.any(String));

    const report = await reportPromise;
    expect(report.insertedCount).toBe(2);
  });
});
