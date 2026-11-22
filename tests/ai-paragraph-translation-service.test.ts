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

  test("translates paragraph and heading blocks containing English letters and inserts after each source block", async () => {
    sqlPagedMock.mockResolvedValueOnce([
      { id: "p1", type: "p", markdown: "Hello world." },
      { id: "h1", type: "h", subtype: "h1", markdown: "# Title" },
      { id: "h2", type: "h", subtype: "h2", markdown: "## 纯中文标题" },
      { id: "p2", type: "p", markdown: "Second paragraph with AI." }
    ] as any);

    const forwardProxy = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({ choices: [{ message: { content: "你好，世界。" } }] })
      })
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({ choices: [{ message: { content: "标题" } }] })
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

    expect(forwardProxy).toHaveBeenCalledTimes(3);
    expect(requestApiMock).toHaveBeenCalledTimes(3);
    expect(requestApiMock).toHaveBeenNthCalledWith(1, "/api/block/insertBlock", {
      dataType: "markdown",
      data: "你好，世界。\n{: custom-doc-assist-trans=\"true\"}",
      nextID: "",
      previousID: "p1",
      parentID: ""
    });
    expect(requestApiMock).toHaveBeenNthCalledWith(2, "/api/block/insertBlock", {
      dataType: "markdown",
      data: "# 标题\n{: custom-doc-assist-trans=\"true\"}",
      nextID: "",
      previousID: "h1",
      parentID: ""
    });
    expect(requestApiMock).toHaveBeenNthCalledWith(3, "/api/block/insertBlock", {
      dataType: "markdown",
      data: "第二段包含 AI。\n{: custom-doc-assist-trans=\"true\"}",
      nextID: "",
      previousID: "p2",
      parentID: ""
    });
    expect(report.scannedParagraphCount).toBe(4);
    expect(report.translatableParagraphCount).toBe(3);
    expect(report.skippedCount).toBe(0);
    expect(report.translatedCount).toBe(3);
    expect(report.insertedCount).toBe(3);
  });

  test("translates headings with preserved heading level even if AI returns markdown marks or multiline", async () => {
    sqlPagedMock.mockResolvedValueOnce([
      { id: "h2_1", type: "h", subtype: "h2", markdown: "## 2. System Architecture\n{: id=\"20260101\"}" },
      { id: "h3_1", type: "h", subtype: "h3", markdown: "### 2.1 Overview" }
    ] as any);

    const forwardProxy = vi.fn()
      // AI 自带了 ## 且有多行
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({ choices: [{ message: { content: "## 2. 系统架构\n说明文字" } }] })
      })
      // AI 仅返回纯文本
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({ choices: [{ message: { content: "2.1 概述" } }] })
      });

    const report = await translateDocParagraphs({
      docId: "doc-1",
      config: aiConfig,
      forwardProxy
    });

    expect(forwardProxy).toHaveBeenCalledTimes(2);
    // 验证传给 AI 的 prompt 中已经去掉了 ## 前缀和 {: id}
    const firstCallBody = JSON.parse(forwardProxy.mock.calls[0][2]);
    expect(firstCallBody.messages[1].content).toContain("2. System Architecture");
    expect(firstCallBody.messages[1].content).not.toContain("##");
    expect(firstCallBody.messages[1].content).not.toContain("20260101");

    expect(requestApiMock).toHaveBeenNthCalledWith(1, "/api/block/insertBlock", {
      dataType: "markdown",
      data: "## 2. 系统架构 说明文字\n{: custom-doc-assist-trans=\"true\"}",
      nextID: "",
      previousID: "h2_1",
      parentID: ""
    });
    expect(requestApiMock).toHaveBeenNthCalledWith(2, "/api/block/insertBlock", {
      dataType: "markdown",
      data: "### 2.1 概述\n{: custom-doc-assist-trans=\"true\"}",
      nextID: "",
      previousID: "h3_1",
      parentID: ""
    });
    expect(report.translatedCount).toBe(2);
    expect(report.insertedCount).toBe(2);
  });

  test("supports resume translation by skipping already translated blocks with attribute or adjacent chinese fallback", async () => {
    sqlPagedMock.mockResolvedValueOnce([
      // 1. 已翻译的标题（带属性）
      { id: "h1", type: "h", subtype: "h1", markdown: "# Chapter 1" },
      {
        id: "h1_t",
        type: "h",
        subtype: "h1",
        markdown: "# 第一章\n{: custom-doc-assist-trans=\"true\"}",
        ial: "{: custom-doc-assist-trans=\"true\"}"
      },
      // 2. 已翻译的段落（无属性，兜底相邻中文块命中，且译文包含英文术语）
      { id: "p1", type: "p", markdown: "Introduction to TypeScript." },
      { id: "p1_t", type: "p", markdown: "TypeScript 语言入门介绍。" },
      // 3. 尚未翻译的标题
      { id: "h2", type: "h", subtype: "h2", markdown: "## Chapter 2 Background" },
      // 4. 尚未翻译的段落
      { id: "p2", type: "p", markdown: "This paragraph is pending translation." }
    ] as any);

    const forwardProxy = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({ choices: [{ message: { content: "第 2 章 背景" } }] })
      })
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({ choices: [{ message: { content: "该段落待翻译。" } }] })
      });

    const report = await translateDocParagraphs({
      docId: "doc-1",
      config: aiConfig,
      forwardProxy
    });

    // 仅翻译未翻译的 h2 和 p2（跳过了 h1 和 p1，且未将 p1_t 当成源块）
    expect(forwardProxy).toHaveBeenCalledTimes(2);
    expect(requestApiMock).toHaveBeenCalledTimes(2);
    expect(requestApiMock).toHaveBeenNthCalledWith(1, "/api/block/insertBlock", {
      dataType: "markdown",
      data: "## 第 2 章 背景\n{: custom-doc-assist-trans=\"true\"}",
      nextID: "",
      previousID: "h2",
      parentID: ""
    });
    expect(requestApiMock).toHaveBeenNthCalledWith(2, "/api/block/insertBlock", {
      dataType: "markdown",
      data: "该段落待翻译。\n{: custom-doc-assist-trans=\"true\"}",
      nextID: "",
      previousID: "p2",
      parentID: ""
    });

    expect(report.scannedParagraphCount).toBe(6);
    expect(report.translatableParagraphCount).toBe(2);
    expect(report.skippedCount).toBe(2);
    expect(report.translatedCount).toBe(2);
    expect(report.insertedCount).toBe(2);
  });

  test("returns zero translatable count and skips all when every english block has translation", async () => {
    sqlPagedMock.mockResolvedValueOnce([
      { id: "p1", type: "p", markdown: "Hello world." },
      { id: "p1_trans", type: "p", markdown: "你好，世界。\n{: custom-doc-assist-trans=\"true\"}" }
    ] as any);

    const forwardProxy = vi.fn();

    const report = await translateDocParagraphs({
      docId: "doc-1",
      config: aiConfig,
      forwardProxy
    });

    expect(forwardProxy).not.toHaveBeenCalled();
    expect(requestApiMock).not.toHaveBeenCalled();
    expect(report.scannedParagraphCount).toBe(2);
    expect(report.translatableParagraphCount).toBe(0);
    expect(report.skippedCount).toBe(1);
    expect(report.translatedCount).toBe(0);
    expect(report.insertedCount).toBe(0);
  });

  test("ignores SiYuan block attributes when deciding whether a paragraph or heading needs translation", async () => {
    sqlPagedMock.mockResolvedValueOnce([
      { id: "p1", type: "p", markdown: "纯中文段落。\n{: id=\"20260518120000-abcdefg\"}" },
      { id: "h1", type: "h", subtype: "h1", markdown: "# 纯中文标题 {: id=\"20260518120000-h123456\"}" }
    ] as any);

    const forwardProxy = vi.fn();

    const report = await translateDocParagraphs({
      docId: "doc-1",
      config: aiConfig,
      forwardProxy
    });

    expect(forwardProxy).not.toHaveBeenCalled();
    expect(requestApiMock).not.toHaveBeenCalled();
    expect(report.scannedParagraphCount).toBe(2);
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
