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

  test("polls system clipboard, deduplicates unchanged entries, suppresses self-copy loop, and flushes on stop", async () => {
    vi.useFakeTimers();
    let currentText = "first clip";
    const writeText = vi.fn();
    const onChange = vi.fn();
    const saveData = vi.fn(async () => undefined);

    (globalThis as { window?: unknown }).window = {
      require: (id: string) => {
        if (id === "electron") {
          return {
            clipboard: {
              readText: () => currentText,
              writeText
            }
          };
        }
        if (id === "os") {
          return { platform: () => "win32", tmpdir: () => "C:\\tmp" };
        }
        return undefined;
      }
    };

    const service = new ClipboardMonitorService({
      loadData: async () => ({ version: 1, items: [] }),
      saveData,
      onChange
    });

    await service.start();
    expect(service.getItems()).toHaveLength(1);
    expect(service.getItems()[0].text).toBe("first clip");
    expect(onChange).toHaveBeenCalledTimes(1);

    // 相同内容轮询不重复触发
    await vi.advanceTimersByTimeAsync(750);
    expect(onChange).toHaveBeenCalledTimes(1);

    // 新内容被捕获
    currentText = "second clip";
    await vi.advanceTimersByTimeAsync(750);
    expect(service.getItems()).toHaveLength(2);
    expect(onChange).toHaveBeenCalledTimes(2);

    // 自写入后系统剪贴板变为该内容时，suppressedSignature 防止回环重复记录
    const firstItem = service.getItems()[1];
    await service.copyItem(firstItem);
    expect(writeText).toHaveBeenCalledWith("first clip");
    currentText = "first clip";
    await vi.advanceTimersByTimeAsync(750);
    expect(onChange).toHaveBeenCalledTimes(2);

    // stop() 立即触发待保存数据刷盘
    service.stop();
    await Promise.resolve();
    expect(saveData).toHaveBeenCalled();
    vi.useRealTimers();
  });

  test("falls back to async clipboard.read() and reads image data URL from disk", async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71]);
    const writtenFiles = new Map<string, Uint8Array>();

    (globalThis as { window?: unknown }).window = {
      siyuan: { config: { system: { dataDir: "C:\\siyuan-data" } } },
      require: (id: string) => {
        if (id === "electron") {
          return {
            clipboard: {
              readText: () => "",
              read: async () => [
                {
                  types: ["image/png"],
                  getType: async () => ({
                    arrayBuffer: async () => pngBytes.buffer
                  })
                }
              ]
            }
          };
        }
        if (id === "fs") {
          return {
            existsSync: (p: string) => p.endsWith("clipboard-images") || writtenFiles.has(p),
            mkdirSync: vi.fn(),
            writeFileSync: (p: string, data: Uint8Array) => {
              writtenFiles.set(p, data);
            },
            readFileSync: (p: string) => writtenFiles.get(p) || new Uint8Array(),
            unlinkSync: (p: string) => {
              writtenFiles.delete(p);
            }
          };
        }
        if (id === "path") {
          return {
            join: (...parts: string[]) => parts.join("\\")
          };
        }
        if (id === "os") {
          return { platform: () => "win32", tmpdir: () => "C:\\tmp" };
        }
        return undefined;
      }
    };

    const service = new ClipboardMonitorService({
      loadData: async () => ({ version: 1, items: [] }),
      saveData: async () => undefined
    });

    await service.start();
    const items = service.getItems();
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("image");
    expect(items[0].imageFileName).toBeTruthy();

    const dataUrl = service.getImageDataUrl(items[0].imageFileName);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(service.getImageDataUrl("missing.png")).toBeNull();

    service.stop();
  });

  test("stop during async start prevents zombie interval and deduplicates concurrent ensureLoaded", async () => {
    vi.useFakeTimers();
    let readCount = 0;
    let releaseLoad!: (val: any) => void;
    const loadData = vi.fn(
      () => new Promise((resolve) => {
        releaseLoad = resolve;
      })
    );

    (globalThis as { window?: unknown }).window = {
      require: (id: string) => {
        if (id === "electron") {
          return {
            clipboard: {
              readText: () => {
                readCount += 1;
                return `clip-${readCount}`;
              }
            }
          };
        }
        if (id === "os") {
          return { platform: () => "win32", tmpdir: () => "C:\\tmp" };
        }
        return undefined;
      }
    };

    const service = new ClipboardMonitorService({
      loadData,
      saveData: async () => undefined
    });

    const loadA = service.ensureLoaded();
    const startPromise = service.start();
    expect(loadData).toHaveBeenCalledTimes(1);

    // stop() while start() is suspended in loadData/pollOnce
    service.stop();
    releaseLoad({ version: 1, items: [] });
    await Promise.all([loadA, startPromise]);

    const countAtStop = readCount;
    await vi.advanceTimersByTimeAsync(2500);
    expect(readCount).toBe(countAtStop);
    vi.useRealTimers();
  });

  test("copies files on Windows via PowerShell Set-Clipboard when writeBuffer is removed (Electron 44)", async () => {
    const execFile = vi.fn((_file: string, _args: string[], _opts: Record<string, unknown>, cb: (e: Error | null, o: string, s: string) => void) => {
      cb(null, "", "");
    });
    (globalThis as { window?: unknown }).window = {
      require: (id: string) => {
        if (id === "electron") {
          return { clipboard: { readText: () => "", writeText: vi.fn() } };
        }
        if (id === "child_process") {
          return { execFile };
        }
        if (id === "fs") {
          return { existsSync: () => true, mkdirSync: vi.fn(), writeFileSync: vi.fn(), readFileSync: vi.fn(), unlinkSync: vi.fn() };
        }
        if (id === "os") {
          return { platform: () => "win32", tmpdir: () => "C:\\tmp" };
        }
        return undefined;
      }
    };
    const { service } = createService([
      {
        id: "f1",
        kind: "file",
        createdAt: 1,
        updatedAt: 1,
        favorited: false,
        signature: "file:1:x",
        previewText: "报告.pdf",
        filePaths: ["C:\\docs\\报告.pdf"]
      }
    ]);
    await service.ensureLoaded();

    const res = await service.copyItem(service.getItems()[0]);
    expect(res.ok).toBe(true);
    expect(execFile).toHaveBeenCalledTimes(1);
    const [file, args, opts] = execFile.mock.calls[0];
    expect(file).toBe("powershell.exe");
    expect(args.join(" ")).toContain("Set-Clipboard -LiteralPath");
    const env = opts.env as Record<string, string>;
    expect(JSON.parse(env.DOC_ASSIST_CLIP_PATHS)).toEqual(["C:\\docs\\报告.pdf"]);
  });

  test("copies images through navigator.clipboard when clipboard.writeImage is removed (Electron 44)", async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71]);
    const write = vi.fn(async () => undefined);
    class FakeClipboardItem {
      constructor(public readonly data: Record<string, Blob>) {}
    }
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const originalItem = (globalThis as { ClipboardItem?: unknown }).ClipboardItem;
    Object.defineProperty(globalThis, "navigator", {
      value: { clipboard: { write } },
      configurable: true
    });
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = FakeClipboardItem;

    try {
      (globalThis as { window?: unknown }).window = {
        siyuan: { config: { system: { dataDir: "C:\\siyuan-data" } } },
        require: (id: string) => {
          if (id === "electron") {
            return { clipboard: { readText: () => "" } };
          }
          if (id === "fs") {
            return {
              existsSync: () => true,
              mkdirSync: vi.fn(),
              writeFileSync: vi.fn(),
              readFileSync: () => pngBytes,
              unlinkSync: vi.fn()
            };
          }
          if (id === "path") {
            return { join: (...parts: string[]) => parts.join("\\") };
          }
          if (id === "os") {
            return { platform: () => "win32", tmpdir: () => "C:\\tmp" };
          }
          return undefined;
        }
      };
      const { service } = createService([
        {
          id: "i1",
          kind: "image",
          createdAt: 1,
          updatedAt: 1,
          favorited: false,
          signature: "image:1x1:4:x",
          previewText: "图像",
          imageFileName: "img-1.png"
        }
      ]);
      await service.ensureLoaded();

      const res = await service.copyItem(service.getItems()[0]);
      expect(res.ok).toBe(true);
      expect(write).toHaveBeenCalledTimes(1);
      const [items] = write.mock.calls[0] as unknown as [FakeClipboardItem[]];
      expect(items[0].data["image/png"]).toBeInstanceOf(Blob);
    } finally {
      if (originalNavigator) {
        Object.defineProperty(globalThis, "navigator", originalNavigator);
      } else {
        delete (globalThis as { navigator?: unknown }).navigator;
      }
      (globalThis as { ClipboardItem?: unknown }).ClipboardItem = originalItem;
    }
  });
});
