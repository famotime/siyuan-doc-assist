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
  exportDocIdsAsMarkdownZip,
  exportDocAndChildKeyInfoAsZip,
} from "@/services/exporter";
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
    });
  });

  test("uses sanitized preferred title as download filename", async () => {
    await (exportDocIdsAsMarkdownZip as any)(["doc1"], "当前/文档:标题");

    const anchor = (globalThis as any).document.createElement.mock.results[0].value;
    expect(anchor.download).toBe("当前_文档_标题.zip");
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
    });
  });
});
