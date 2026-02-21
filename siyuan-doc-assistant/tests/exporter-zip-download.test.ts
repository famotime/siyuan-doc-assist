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

import { exportDocIdsAsMarkdownZip } from "@/services/exporter";
import { exportMds } from "@/services/kernel";

describe("export docs zip download", () => {
  const exportMdsMock = vi.mocked(exportMds);
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
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.URL = originalURL;
    globalThis.fetch = originalFetch;
    (globalThis as any).document = originalDocument;
  });

  test("exports zip and triggers browser save dialog flow", async () => {
    exportMdsMock.mockResolvedValue({
      name: "my-docs",
      zip: "temp/export/my-docs.zip",
    });

    const result = await exportDocIdsAsMarkdownZip(["doc1", "doc2"]);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/file/getFile",
      expect.objectContaining({
        method: "POST",
      })
    );

    const fetchArg = (globalThis.fetch as any).mock.calls[0][1];
    expect(JSON.parse(fetchArg.body).path).toBe("/temp/export/my-docs.zip");

    const anchor = (globalThis as any).document.createElement.mock.results[0].value;
    expect(anchor.download).toBe("my-docs.zip");
    expect(anchor.click).toHaveBeenCalledTimes(1);

    expect(result).toEqual({
      name: "my-docs",
      zip: "temp/export/my-docs.zip",
    });
  });

  test("downloads /export route zip directly for v3.5.7 exportMds", async () => {
    exportMdsMock.mockResolvedValue({
      name: "my-docs",
      zip: "/export/my-docs.md.zip",
    });

    await exportDocIdsAsMarkdownZip(["doc1"]);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/export/my-docs.md.zip",
      expect.objectContaining({
        method: "GET",
      })
    );
  });

  test("uses decoded chinese filename when /export zip path is url-encoded", async () => {
    exportMdsMock.mockResolvedValue({
      name: "OpenClaw",
      zip: "/export/OpenClaw%20%E6%97%A5%E5%B8%B8%E6%93%8D%E4%BD%9C%202026-02-20.md.zip",
    });

    await exportDocIdsAsMarkdownZip(["doc1"]);

    const anchor = (globalThis as any).document.createElement.mock.results[0].value;
    expect(anchor.download).toBe("OpenClaw 日常操作 2026-02-20.md.zip");
  });

  test("uses preferred current-doc title as zip filename when provided", async () => {
    exportMdsMock.mockResolvedValue({
      name: "my-docs",
      zip: "/export/my-docs.md.zip",
    });

    await (exportDocIdsAsMarkdownZip as any)(["doc1"], "当前文档标题");

    const anchor = (globalThis as any).document.createElement.mock.results[0].value;
    expect(anchor.download).toBe("当前文档标题.zip");
  });
});
