import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ClipboardMonitorService,
  encodeLinuxUriList,
  encodeMacOsPlistFileList,
  encodeWindowsCfHdropBuffer,
  parseLinuxUriList,
  parseMacOsPlistFileList,
  parseWindowsCfHdropBuffer
} from "@/services/clipboard-monitor";
import { normalizeDynamicOutlineViewModes } from "@/core/dynamic-outline-core";
import { ClipboardHistoryItem, ClipboardStorageIndex } from "@/core/clipboard-core";

describe("clipboard-monitor file buffer codecs", () => {
  test("round-trips Windows CF_HDROP UTF-16LE buffer with Chinese paths", () => {
    const paths = ["C:\\Users\\测试\\文档.md", "D:\\Projects\\logo.png"];
    const buf = encodeWindowsCfHdropBuffer(paths);
    expect(parseWindowsCfHdropBuffer(buf)).toEqual(paths);
  });

  test("returns empty array for malformed or short CF_HDROP buffers", () => {
    expect(parseWindowsCfHdropBuffer(new Uint8Array(10))).toEqual([]);
    expect(parseWindowsCfHdropBuffer(new Uint8Array(20))).toEqual([]);
  });

  test("round-trips Linux text/uri-list", () => {
    const paths = ["/home/user/My Notes.md", "/tmp/a.png"];
    const encoded = encodeLinuxUriList(paths);
    expect(parseLinuxUriList(`# comment\n${encoded}\n`)).toEqual(paths);
  });

  test("round-trips macOS NSFilenamesPboardType plist", () => {
    const paths = ["/Users/test/A & B.md", "/Users/test/c.png"];
    const xml = encodeMacOsPlistFileList(paths);
    expect(parseMacOsPlistFileList(xml)).toEqual(paths);
  });

  test("normalizes dynamic outline view modes with fallback", () => {
    expect(normalizeDynamicOutlineViewModes(undefined)).toEqual(["outline", "open-docs"]);
    expect(normalizeDynamicOutlineViewModes([])).toEqual(["outline", "open-docs"]);
    expect(
      normalizeDynamicOutlineViewModes(["clipboard", "outline", "clipboard", "invalid"])
    ).toEqual(["clipboard", "outline"]);
  });
});

describe("clipboardMonitorService batch operations & openFileLocation", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
    vi.restoreAllMocks();
  });

  function setupMockElectronEnv(options?: { existingPaths?: string[]; openPathError?: string }) {
    const writeText = vi.fn();
    const writeBuffer = vi.fn();
    const showItemInFolder = vi.fn();
    const openPath = vi.fn(async () => options?.openPathError || "");
    const existingSet = new Set(options?.existingPaths || []);
    const req = (id: string) => {
      if (id === "electron") {
        return {
          clipboard: {
            readText: () => "",
            writeText,
            writeBuffer
          },
          shell: {
            showItemInFolder,
            openPath
          }
        };
      }
      if (id === "fs") {
        return {
          existsSync: (p: string) => existingSet.has(p),
          mkdirSync: vi.fn(),
          writeFileSync: vi.fn(),
          readFileSync: vi.fn(() => new Uint8Array()),
          unlinkSync: vi.fn()
        };
      }
      if (id === "os") {
        return { platform: () => "win32", tmpdir: () => "C:\\tmp" };
      }
      return undefined;
    };
    (globalThis as { window?: unknown }).window = { require: req };
    return { writeText, writeBuffer, showItemInFolder, openPath };
  }

  function createService(initialItems: ClipboardHistoryItem[]) {
    let saved: ClipboardStorageIndex | null = null;
    const service = new ClipboardMonitorService({
      loadData: async () => ({ version: 1, items: initialItems }),
      saveData: async (_name, data) => {
        saved = data;
      }
    });
    return { service, getSaved: () => saved };
  }

  test("copyMergedItems writes merged text and aggregateItems replaces originals", async () => {
    const { writeText } = setupMockElectronEnv();
    const initial: ClipboardHistoryItem[] = [
      {
        id: "a",
        kind: "text",
        createdAt: 1,
        updatedAt: 1,
        favorited: false,
        signature: "s1",
        previewText: "A",
        text: "Hello"
      },
      {
        id: "b",
        kind: "text",
        createdAt: 2,
        updatedAt: 2,
        favorited: true,
        signature: "s2",
        previewText: "B",
        text: "World"
      }
    ];
    const { service } = createService(initial);

    const copyRes = await service.copyMergedItems(["a", "b"]);
    expect(copyRes.ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith("Hello\n\nWorld");

    const aggRes = await service.aggregateItems(["a", "b"]);
    expect(aggRes.ok).toBe(true);
    expect(aggRes.items).toHaveLength(1);
    expect(aggRes.items?.[0].text).toBe("Hello\n\nWorld");
    expect(aggRes.items?.[0].favorited).toBe(true);

    const afterDelete = await service.deleteItems([aggRes.items![0].id]);
    expect(afterDelete).toHaveLength(0);
  });

  test("openFileLocation calls showItemInFolder when file exists and falls back to parent dir", async () => {
    const { showItemInFolder, openPath } = setupMockElectronEnv({
      existingPaths: [
        "C:\\docs\\report.pdf",
        "C:\\docs",
        "D:\\MyCodingProjects\\siyuan-doc-assist\\.env"
      ]
    });
    const { service } = createService([]);

    const res1 = await service.openFileLocation("C:\\docs\\report.pdf");
    expect(res1.ok).toBe(true);
    expect(showItemInFolder).toHaveBeenCalledWith("C:\\docs\\report.pdf");

    const resWinUri = await service.openFileLocation("/D:/MyCodingProjects/siyuan-doc-assist/.env");
    expect(resWinUri.ok).toBe(true);
    expect(showItemInFolder).toHaveBeenCalledWith("D:\\MyCodingProjects\\siyuan-doc-assist\\.env");

    const res2 = await service.openFileLocation("C:\\docs\\missing.pdf");
    expect(res2.ok).toBe(true);
    expect(openPath).toHaveBeenCalledWith("C:\\docs");

    const res3 = await service.openFileLocation("Z:\\nonexistent\\file.txt");
    expect(res3.ok).toBe(false);
  });
});
