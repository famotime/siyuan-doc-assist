import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/services/kernel-shared", () => ({
  escapeSqlLiteral: vi.fn((value: string) => value.replace(/'/g, "''")),
  sqlPaged: vi.fn(),
}));

vi.mock("@/services/kernel", () => ({
  forwardProxy: vi.fn(),
  getFileBlob: vi.fn(),
}));

vi.mock("@/services/request", () => ({
  requestApi: vi.fn(),
}));

import { getFileBlob } from "@/services/kernel";
import { sqlPaged } from "@/services/kernel-shared";
import { requestApi } from "@/services/request";
import { recognizeDocImages } from "@/services/ai-image-ocr";

const sqlPagedMock = vi.mocked(sqlPaged);
const getFileBlobMock = vi.mocked(getFileBlob);
const requestApiMock = vi.mocked(requestApi);

class TestFileReader {
  result: string | ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  readAsDataURL() {
    this.result = "data:image/png;base64,image-data";
    this.onloadend?.();
  }
}

describe("ai-image-ocr service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sqlPagedMock.mockReset();
    getFileBlobMock.mockReset();
    requestApiMock.mockReset();
    vi.stubGlobal("FileReader", TestFileReader);
    getFileBlobMock.mockResolvedValue(new Blob(["image"]));
    requestApiMock.mockResolvedValue({});
  });

  test("inserts quoted OCR text into the paragraph immediately after each image block", async () => {
    sqlPagedMock
      .mockResolvedValueOnce([
        { id: "img-1", markdown: "![a](assets/a.png)" },
        { id: "img-2", markdown: "![b](assets/b.png)" },
        { id: "tail", markdown: "tail" },
      ] as any);

    const forwardProxy = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({ choices: [{ message: { content: "第一张文字" } }] }),
      })
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({ choices: [{ message: { content: "第二张第一段\n\n第二张第二段" } }] }),
      });

    const report = await recognizeDocImages({
      docId: "doc-1",
      config: {
        enabled: true,
        baseUrl: "https://api.example.com",
        apiKey: "key",
        model: "vision-model",
      },
      forwardProxy,
    });

    expect(requestApiMock).toHaveBeenCalledTimes(2);
    expect(requestApiMock).toHaveBeenNthCalledWith(1, "/api/block/insertBlock", {
      dataType: "markdown",
      data: "> 第一张文字",
      nextID: "",
      previousID: "img-1",
      parentID: "",
    });
    expect(requestApiMock).toHaveBeenNthCalledWith(2, "/api/block/insertBlock", {
      dataType: "markdown",
      data: "> 第二张第一段\n>\n> 第二张第二段",
      nextID: "",
      previousID: "img-2",
      parentID: "",
    });
    expect(report.insertedCount).toBe(2);
  });

  test("anchors insertion directly after nested image blocks instead of the document root", async () => {
    sqlPagedMock.mockResolvedValueOnce([
      { id: "list-item", parent_id: "doc-1", markdown: "item" },
      { id: "nested-img", parent_id: "list-item", markdown: "![a](assets/a.png)" },
      { id: "nested-tail", parent_id: "list-item", markdown: "tail" },
      { id: "root-tail", parent_id: "doc-1", markdown: "root tail" },
    ] as any);

    const forwardProxy = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({ choices: [{ message: { content: "嵌套图片文字" } }] }),
    });

    await recognizeDocImages({
      docId: "doc-1",
      config: {
        enabled: true,
        baseUrl: "https://api.example.com",
        apiKey: "key",
        model: "vision-model",
      },
      forwardProxy,
    });

    expect(requestApiMock).toHaveBeenCalledWith("/api/block/insertBlock", {
      dataType: "markdown",
      data: "> 嵌套图片文字",
      nextID: "",
      previousID: "nested-img",
      parentID: "",
    });
  });

  test("asks the vision model to return OCR text only", async () => {
    sqlPagedMock
      .mockResolvedValueOnce([
        { id: "img-1", markdown: "![a](assets/a.png)" },
      ] as any);

    const forwardProxy = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({ choices: [{ message: { content: "[NO_TEXT]" } }] }),
    });

    await recognizeDocImages({
      docId: "doc-1",
      config: {
        enabled: true,
        baseUrl: "https://api.example.com",
        apiKey: "key",
        model: "vision-model",
      },
      forwardProxy,
    });

    const body = JSON.parse(forwardProxy.mock.calls[0][2]);
    const promptText = JSON.stringify(body.messages);
    expect(promptText).toContain("只输出 OCR 识别出的文字");
    expect(promptText).toContain("不要解读图片");
    expect(promptText).toContain("不要添加说明");
  });
});
