import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/services/kernel", () => ({
  exportMdContent: vi.fn(),
  exportMds: vi.fn(),
  exportResources: vi.fn(),
  getFileBlob: vi.fn(),
  putBlobFile: vi.fn(),
  putFile: vi.fn(),
  removeFile: vi.fn(),
}));

vi.mock("@/services/link-resolver", () => ({
  getChildDocs: vi.fn(),
}));

vi.mock("@/services/key-info", () => ({
  getDocKeyInfo: vi.fn(),
}));

import {
  exportCurrentDocMarkdown,
  exportDocAndChildDocsAsMarkdownZip,
  exportDocIdsAsMarkdownZip,
  exportDocAndChildKeyInfoAsZip,
} from "@/services/exporter";
import { buildDefaultKeyInfoFilter } from "@/core/key-info-core";
import { getChildDocs } from "@/services/link-resolver";
import { getDocKeyInfo } from "@/services/key-info";
import {
  exportMdContent,
  exportMds,
  exportResources,
  getFileBlob,
  putBlobFile,
  putFile,
  removeFile,
} from "@/services/kernel";

describe("export docs zip download", () => {
  const exportMdContentMock = vi.mocked(exportMdContent);
  const exportMdsMock = vi.mocked(exportMds);
  const exportResourcesMock = vi.mocked(exportResources);
  const getFileBlobMock = vi.mocked(getFileBlob);
  const putBlobFileMock = vi.mocked(putBlobFile);
  const putFileMock = vi.mocked(putFile);
  const removeFileMock = vi.mocked(removeFile);
  const getChildDocsMock = vi.mocked(getChildDocs);
  const getDocKeyInfoMock = vi.mocked(getDocKeyInfo);
  const originalURL = globalThis.URL;
  const originalFetch = globalThis.fetch;
  const originalDocument = (globalThis as any).document;

  beforeEach(() => {
    vi.useFakeTimers();

    const anchor = {
      click: vi.fn(),
      download: "",
      href: "",
    };

    (globalThis as any).document = {
      createElement: vi.fn(() => anchor),
    };

    (globalThis as any).URL = {
      createObjectURL: vi.fn(() => "blob://zip"),
      revokeObjectURL: vi.fn(),
    };

    globalThis.fetch = vi.fn(async () => {
      return new Response(new Blob(["zip"]), {
        status: 200,
        headers: {
          "content-type": "application/zip",
        },
      });
    }) as any;

    exportMdContentMock.mockImplementation(async (id: string) => {
      if (id === "doc1") {
        return {
          hPath: "/folder/doc1",
          content: "![img](assets/image-20260201-a.png)",
        } as any;
      }
      return {
        hPath: "/folder/doc2",
        content: "doc2 content",
      } as any;
    });
    exportResourcesMock.mockResolvedValue({
      path: "temp/export/my-pack.zip",
    } as any);
    getFileBlobMock.mockResolvedValue(new Blob(["asset"]));
    getChildDocsMock.mockResolvedValue([]);
    getDocKeyInfoMock.mockImplementation(async (docId: string) => ({
      docId,
      docTitle: docId,
      items: [],
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.URL = originalURL;
    globalThis.fetch = originalFetch;
    (globalThis as any).document = originalDocument;
  });

  test("exports only requested docs via strict per-doc flow", async () => {
    const result = await exportDocIdsAsMarkdownZip(["doc1", "doc2"], "my-pack");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/file/getFile",
      expect.objectContaining({
        method: "POST",
      })
    );

    const fetchArg = (globalThis.fetch as any).mock.calls[0][1];
    expect(JSON.parse(fetchArg.body).path).toBe("/temp/export/my-pack.zip");

    expect(exportMdsMock).not.toHaveBeenCalled();
    expect(exportMdContentMock).toHaveBeenCalledTimes(2);
    expect(exportMdContentMock).toHaveBeenNthCalledWith(1, "doc1", {
      refMode: 3,
      embedMode: 0,
      addTitle: false,
      yfm: false,
    });
    expect(exportMdContentMock).toHaveBeenNthCalledWith(2, "doc2", {
      refMode: 3,
      embedMode: 0,
      addTitle: false,
      yfm: false,
    });
    expect(putFileMock).toHaveBeenCalled();
    expect(putBlobFileMock).toHaveBeenCalled();
    const exportPaths = exportResourcesMock.mock.calls[0][0] as string[];
    expect(exportPaths.some((path) => /\/temp\/export\/doc-link-tool-[^/]+$/.test(path))).toBe(
      false
    );
    expect(exportPaths.some((path) => path.endsWith("/doc1.md"))).toBe(true);
    expect(exportPaths.some((path) => path.endsWith("/doc2.md"))).toBe(true);
    expect(exportPaths.some((path) => path.endsWith("/assets"))).toBe(true);
    expect(exportResourcesMock).toHaveBeenCalledWith(expect.any(Array), "my-pack");
    expect(removeFileMock).toHaveBeenCalled();

    const anchor = (globalThis as any).document.createElement.mock.results[0].value;
    expect(anchor.download).toBe("my-pack.zip");
    expect(anchor.click).toHaveBeenCalledTimes(1);

    expect(result).toEqual({
      name: "my-pack",
      zip: "temp/export/my-pack.zip",
      docCount: 2,
      skippedDocCount: 0,
      skippedAssetCount: 0,
    });
  });

  test("skips missing docs and assets while still exporting remaining docs", async () => {
    exportMdContentMock.mockImplementation(async (id: string) => {
      if (id === "missing-doc") {
        throw new Error("file not exist");
      }
      if (id === "doc1") {
        return {
          hPath: "/folder/主文档",
          content: "![ok](assets/ok.png)\n![lost](assets/lost.png)\n主文档内容",
        } as any;
      }
      return {
        hPath: "/folder/子文档",
        content: "子文档内容",
      } as any;
    });
    getFileBlobMock.mockImplementation(async (path: string) => {
      if (path.includes("lost.png")) {
        throw new Error("file not exist");
      }
      return new Blob(["asset"]);
    });

    const result = await exportDocIdsAsMarkdownZip(["doc1", "missing-doc", "doc2"], "my-pack");

    expect(exportMdContentMock).toHaveBeenCalledTimes(3);
    expect(putFileMock).toHaveBeenCalledTimes(2);
    expect(putBlobFileMock).toHaveBeenCalledTimes(1);
    const exportPaths = exportResourcesMock.mock.calls[0][0] as string[];
    expect(exportPaths.some((path) => path.endsWith("/主文档.md"))).toBe(true);
    expect(exportPaths.some((path) => path.endsWith("/子文档.md"))).toBe(true);
    expect(exportPaths.some((path) => path.endsWith("/assets"))).toBe(true);
    expect(result).toEqual({
      name: "my-pack",
      zip: "temp/export/my-pack.zip",
      docCount: 2,
      skippedDocCount: 1,
      skippedAssetCount: 1,
    });
  });

  test("prefixes current doc title into exported markdown body", async () => {
    exportMdContentMock.mockResolvedValueOnce({
      hPath: "/folder/当前文档",
      content: "正文第一段\n正文第二段",
    } as any);

    const result = await exportCurrentDocMarkdown("doc1");

    const blob = ((globalThis as any).URL.createObjectURL as any).mock.calls[0][0] as Blob;
    expect(await blob.text()).toBe("# 当前文档\n\n正文第一段\n正文第二段");

    const anchor = (globalThis as any).document.createElement.mock.results[0].value;
    expect(anchor.download).toBe("当前文档.md");
    expect(result).toEqual({
      mode: "md",
      fileName: "当前文档.md",
    });
  });

  test("sanitizes illegal separators but preserves Chinese quotes and em dash in filenames", async () => {
    await (exportDocIdsAsMarkdownZip as any)(["doc1"], "当前“文档”——标题/草稿:一");

    const anchor = (globalThis as any).document.createElement.mock.results[0].value;
    expect(anchor.download).toBe("当前“文档”——标题_草稿_一.zip");
  });

  test("prefixes each exported doc title into zip markdown body", async () => {
    exportMdContentMock.mockImplementationOnce(async () => ({
      hPath: "/folder/批量文档",
      content: "批量正文",
    }));

    await exportDocIdsAsMarkdownZip(["doc1"], "my-pack");

    expect(putFileMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/批量文档\.md$/),
      "# 批量文档\n\n批量正文"
    );
  });

  test("exports current and child docs key info zip with filter applied", async () => {
    getChildDocsMock.mockResolvedValue([
      { id: "child-1" } as any,
      { id: "child-2" } as any,
    ]);
    getDocKeyInfoMock.mockImplementation(async (docId: string) => {
      if (docId === "doc1") {
        return {
          docId,
          docTitle: "主文档",
          items: [
            { type: "bold", raw: "**A**", text: "A", id: "1", blockSort: 1, order: 1 },
            { type: "tag", raw: "#t", text: "t", id: "2", blockSort: 1, order: 2 },
          ],
        } as any;
      }
      return {
        docId,
        docTitle: docId,
        items: [
          { type: "bold", raw: "**B**", text: "B", id: "3", blockSort: 1, order: 1 },
          { type: "remark", raw: "%%R%%", text: "R", id: "4", blockSort: 1, order: 2 },
        ],
      } as any;
    });

    const result = await exportDocAndChildKeyInfoAsZip({
      docId: "doc1",
      filter: ["bold"],
    });

    expect(getDocKeyInfoMock).toHaveBeenCalledTimes(3);
    expect(getDocKeyInfoMock).toHaveBeenNthCalledWith(1, "doc1", undefined);
    expect(getDocKeyInfoMock).toHaveBeenNthCalledWith(2, "child-1", undefined);
    expect(getDocKeyInfoMock).toHaveBeenNthCalledWith(3, "child-2", undefined);
    expect(putFileMock).toHaveBeenCalledTimes(3);
    expect(putFileMock.mock.calls.every((call) => String(call[1] || "").includes("**"))).toBe(true);
    expect(exportResourcesMock).toHaveBeenCalledWith(expect.any(Array), "主文档-key-info");
    expect(result).toEqual({
      name: "主文档-key-info",
      zip: "temp/export/my-pack.zip",
      docCount: 3,
      itemCount: 3,
      skippedDocCount: 0,
    });
  });

  test("exports current doc with child docs markdown zip and related assets", async () => {
    getChildDocsMock.mockResolvedValue([
      { id: "child-1" } as any,
      { id: "child-2" } as any,
    ]);
    exportMdContentMock.mockImplementation(async (id: string) => {
      if (id === "doc1") {
        return {
          hPath: "/folder/主文档",
          content: "![main](assets/main.png)\n主文档内容",
        } as any;
      }
      if (id === "child-1") {
        return {
          hPath: "/folder/子文档一",
          content: "![child](assets/child.png)\n子文档一内容",
        } as any;
      }
      return {
        hPath: "/folder/子文档二",
        content: "![main](assets/main.png)\n子文档二内容",
      } as any;
    });

    const result = await exportDocAndChildDocsAsMarkdownZip({
      docId: "doc1",
    });

    expect(getChildDocsMock).toHaveBeenCalledTimes(1);
    expect(getChildDocsMock).toHaveBeenCalledWith("doc1");
    expect(exportMdContentMock).toHaveBeenCalledTimes(3);
    expect(exportMdContentMock).toHaveBeenNthCalledWith(1, "doc1", {
      refMode: 3,
      embedMode: 0,
      addTitle: false,
      yfm: false,
    });
    expect(exportMdContentMock).toHaveBeenNthCalledWith(2, "child-1", {
      refMode: 3,
      embedMode: 0,
      addTitle: false,
      yfm: false,
    });
    expect(exportMdContentMock).toHaveBeenNthCalledWith(3, "child-2", {
      refMode: 3,
      embedMode: 0,
      addTitle: false,
      yfm: false,
    });
    expect(putFileMock).toHaveBeenCalledTimes(3);
    expect(putBlobFileMock).toHaveBeenCalledTimes(2);
    const exportPaths = exportResourcesMock.mock.calls[0][0] as string[];
    expect(exportPaths.some((path) => path.endsWith("/主文档.md"))).toBe(true);
    expect(exportPaths.some((path) => path.endsWith("/子文档一.md"))).toBe(true);
    expect(exportPaths.some((path) => path.endsWith("/子文档二.md"))).toBe(true);
    expect(exportPaths.some((path) => path.endsWith("/assets"))).toBe(true);
    expect(exportResourcesMock).toHaveBeenCalledWith(expect.any(Array), "主文档");
    expect(result).toEqual({
      name: "主文档",
      zip: "temp/export/my-pack.zip",
      docCount: 3,
      skippedDocCount: 0,
      skippedAssetCount: 0,
    });
  });

  test("does not export code items when using the default key info filter", async () => {
    getChildDocsMock.mockResolvedValue([]);
    getDocKeyInfoMock.mockResolvedValue({
      docId: "doc1",
      docTitle: "主文档",
      items: [
        { type: "bold", raw: "**A**", text: "A", id: "1", blockSort: 1, order: 1 },
        { type: "underline", raw: "<u>U</u>", text: "U", id: "2", blockSort: 1, order: 2 },
        { type: "code", raw: "`C`", text: "C", id: "3", blockSort: 1, order: 3 },
      ],
    } as any);

    const result = await exportDocAndChildKeyInfoAsZip({
      docId: "doc1",
      filter: buildDefaultKeyInfoFilter(),
    });

    expect(putFileMock).toHaveBeenCalledTimes(1);
    expect(String(putFileMock.mock.calls[0]?.[1] || "")).toContain("**A**");
    expect(String(putFileMock.mock.calls[0]?.[1] || "")).toContain("<u>U</u>");
    expect(String(putFileMock.mock.calls[0]?.[1] || "")).not.toContain("`C`");
    expect(result.itemCount).toBe(2);
  });

  test("exports heading highlight when title filter is off and suppresses it when title is on", async () => {
    getChildDocsMock.mockResolvedValue([]);
    getDocKeyInfoMock.mockResolvedValue({
      docId: "doc1",
      docTitle: "主文档",
      items: [
        { type: "title", raw: "# 标题", text: "标题", id: "h1-heading-0", blockId: "h1", blockSort: 1, order: 1 },
        { type: "highlight", raw: "==标题==", text: "标题", id: "h1-inline-1", blockId: "h1", blockSort: 1, order: 2 },
      ],
    } as any);

    await exportDocAndChildKeyInfoAsZip({
      docId: "doc1",
      filter: ["title", "highlight"],
    });
    expect(String(putFileMock.mock.calls.at(-1)?.[1] || "")).toBe("# 标题");

    await exportDocAndChildKeyInfoAsZip({
      docId: "doc1",
      filter: ["highlight"],
    });
    expect(String(putFileMock.mock.calls.at(-1)?.[1] || "")).toBe("==标题==");
  });
});
