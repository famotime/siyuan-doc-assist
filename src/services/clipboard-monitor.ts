import { createGenerationGuard } from "@/core/generation-guard-core";
import { createDocAssistantLogger } from "@/core/logger-core";
import {
  parseLinuxUriList,
  parseMacOsPlistFileList,
  parseWindowsCfHdropBuffer
} from "@/core/clipboard-codec-core";
import {
  aggregateClipboardItems,
  buildClipboardFileSignature,
  buildClipboardImageSignature,
  buildClipboardTextPreview,
  buildClipboardTextSignature,
  clearNonFavoriteClipboardItems,
  ClipboardHistoryItem,
  ClipboardStorageIndex,
  deleteClipboardItem,
  deleteClipboardItems,
  formatFileNamesSummary,
  IncomingClipboardEntry,
  mergeClipboardItems,
  normalizeClipboardStorageIndex,
  toggleClipboardItemFavorite,
  upsertClipboardHistoryItem
} from "@/core/clipboard-core";
import {
  ClipboardRuntimeModules,
  getClipboardRuntimeModules,
  isDesktopElectronClipboardSupported,
  openClipboardFileLocation,
  readClipboardImageDataUrl,
  removeClipboardImageFile,
  resolveClipboardImagePath,
  writeClipboardImageFile,
  writeFilesToSystemClipboard,
  writeTextToSystemClipboard
} from "@/services/clipboard-runtime";

export {
  encodeLinuxUriList,
  encodeMacOsPlistFileList,
  encodeWindowsCfHdropBuffer,
  parseLinuxUriList,
  parseMacOsPlistFileList,
  parseWindowsCfHdropBuffer
} from "@/core/clipboard-codec-core";
export { isDesktopElectronClipboardSupported } from "@/services/clipboard-runtime";

const logger = createDocAssistantLogger("Clipboard");

export const CLIPBOARD_STORAGE_FILE = "clipboard-history.json";
const CLIPBOARD_POLL_INTERVAL_MS = 700;

export type ClipboardMonitorDeps = {
  loadData: (storageName: string) => Promise<unknown>;
  saveData: (storageName: string, data: ClipboardStorageIndex) => Promise<void>;
  onChange?: (items: ClipboardHistoryItem[]) => void;
};

type PolledClipboardEntry = {
  signature: string;
  incoming: IncomingClipboardEntry;
  kind: "text" | "image" | "file";
  imageBytes?: Uint8Array;
};

export class ClipboardMonitorService {
  private items: ClipboardHistoryItem[] = [];
  private loaded = false;
  private loadPromise: Promise<ClipboardHistoryItem[]> | null = null;
  private running = false;
  private isPolling = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastPolledSignature = "";
  private suppressedSignature = "";
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly startGuard = createGenerationGuard();

  constructor(private readonly deps: ClipboardMonitorDeps) {}

  public isSupported(): boolean {
    return isDesktopElectronClipboardSupported();
  }

  public async ensureLoaded(): Promise<ClipboardHistoryItem[]> {
    if (this.loaded) {
      return this.items;
    }
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        try {
          const raw = await this.deps.loadData(CLIPBOARD_STORAGE_FILE);
          this.items = normalizeClipboardStorageIndex(raw);
        } catch {
          this.items = [];
        }
        this.loaded = true;
        this.loadPromise = null;
        return this.items;
      })();
    }
    return this.loadPromise;
  }

  public getItems(): ClipboardHistoryItem[] {
    return this.items;
  }

  public async start(): Promise<void> {
    if (this.running) {
      logger.debug("start skipped: already running");
      return;
    }
    const env = getClipboardRuntimeModules();
    if (!env) {
      logger.warn("Electron clipboard API unavailable, monitor not started", {
        hasWindowRequire:
          typeof window !== "undefined" &&
          typeof (window as unknown as { require?: unknown }).require === "function",
        hasGlobalRequire:
          typeof (globalThis as unknown as { require?: unknown }).require === "function"
      });
      return;
    }
    this.running = true;
    const generation = this.startGuard.begin();
    logger.debug("monitor starting", {
      platform: env.platform,
      hasNativeImage: Boolean(env.nativeImage),
      hasFs: Boolean(env.fs),
      hasPath: Boolean(env.path)
    });
    await this.ensureLoaded();
    if (!this.running || !this.startGuard.isCurrent(generation)) {
      return;
    }
    logger.debug("monitor loaded history", { count: this.items.length });
    await this.pollOnce();
    if (!this.running || !this.startGuard.isCurrent(generation)) {
      return;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    this.pollTimer = setInterval(() => {
      void this.pollOnce();
    }, CLIPBOARD_POLL_INTERVAL_MS);
  }

  public syncNow(): void {
    logger.debug("syncNow triggered", { running: this.running });
    if (!this.running) {
      void this.start();
      return;
    }
    void this.pollOnce(true);
  }

  public stop(): void {
    if (this.running) {
      logger.debug("monitor stopped");
    }
    this.running = false;
    this.startGuard.invalidateAll();
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      void this.flushSave();
    }
  }

  public async toggleFavorite(id: string): Promise<ClipboardHistoryItem[]> {
    await this.ensureLoaded();
    return this.commitItems(toggleClipboardItemFavorite(this.items, id));
  }

  public async deleteItem(id: string): Promise<ClipboardHistoryItem[]> {
    await this.ensureLoaded();
    const { nextItems, removedImageFile } = deleteClipboardItem(this.items, id);
    return this.commitItems(nextItems, removedImageFile ? [removedImageFile] : undefined);
  }

  public async deleteItems(ids: readonly string[]): Promise<ClipboardHistoryItem[]> {
    await this.ensureLoaded();
    const { nextItems, removedImageFiles } = deleteClipboardItems(this.items, ids);
    return this.commitItems(nextItems, removedImageFiles);
  }

  public async clearNonFavorites(): Promise<ClipboardHistoryItem[]> {
    await this.ensureLoaded();
    const { nextItems, removedImageFiles } = clearNonFavoriteClipboardItems(this.items);
    return this.commitItems(nextItems, removedImageFiles);
  }

  public async copyItem(item: ClipboardHistoryItem): Promise<{ ok: boolean; reason?: string }> {
    const env = getClipboardRuntimeModules();
    if (!env) {
      return { ok: false, reason: "仅支持桌面端剪贴板" };
    }
    const { clipboard, nativeImage, fs } = env;
    this.suppressedSignature = item.signature;
    this.lastPolledSignature = item.signature;

    if (item.kind === "text") {
      return writeTextToSystemClipboard(env, item.text || "");
    }

    if (item.kind === "image") {
      if (!item.imageFileName || !nativeImage || typeof clipboard.writeImage !== "function") {
        return { ok: false, reason: "图片数据不可用" };
      }
      const imgPath = resolveClipboardImagePath(env, item.imageFileName);
      if (!imgPath || !fs || !fs.existsSync(imgPath)) {
        return { ok: false, reason: "图片文件已被清理" };
      }
      const img = nativeImage.createFromPath(imgPath);
      if (!img || img.isEmpty()) {
        return { ok: false, reason: "读取图片失败" };
      }
      await Promise.resolve(clipboard.writeImage(img));
      return { ok: true };
    }

    if (item.kind === "file") {
      return writeFilesToSystemClipboard(env, item.filePaths || []);
    }

    return { ok: false, reason: "不支持的剪贴板类型" };
  }

  public async copyMergedItems(
    orderedIds: readonly string[]
  ): Promise<{ ok: boolean; reason?: string; skippedImageCount?: number }> {
    await this.ensureLoaded();
    const merged = mergeClipboardItems(this.items, orderedIds);
    if (!merged.ok) {
      return { ok: false, reason: merged.reason };
    }
    if (merged.kind === "image") {
      const res = await this.copyItem(merged.item);
      return { ...res, skippedImageCount: 0 };
    }
    const env = getClipboardRuntimeModules();
    if (!env) {
      return { ok: false, reason: "仅支持桌面端剪贴板" };
    }
    this.suppressedSignature = merged.signature;
    this.lastPolledSignature = merged.signature;

    const writeRes =
      merged.kind === "file" ?
          await writeFilesToSystemClipboard(env, merged.filePaths) :
          await writeTextToSystemClipboard(env, merged.text);
    if (!writeRes.ok) {
      return writeRes;
    }
    return {
      ok: true,
      skippedImageCount: merged.skippedImageCount
    };
  }

  public async aggregateItems(orderedIds: readonly string[]): Promise<{
    ok: boolean;
    items?: ClipboardHistoryItem[];
    reason?: string;
    skippedImageCount?: number;
  }> {
    await this.ensureLoaded();
    const result = aggregateClipboardItems(this.items, orderedIds);
    if (!result.ok) {
      return { ok: false, reason: result.reason };
    }
    const items = this.commitItems(result.nextItems, result.removedImageFiles);
    return {
      ok: true,
      items,
      skippedImageCount: result.skippedImageCount
    };
  }

  public async openFileLocation(filePath: string): Promise<{ ok: boolean; reason?: string }> {
    return openClipboardFileLocation(filePath);
  }

  public getImageDataUrl(imageFileName?: string): string | null {
    return readClipboardImageDataUrl(getClipboardRuntimeModules(), imageFileName);
  }

  private commitItems(
    nextItems: ClipboardHistoryItem[],
    removedImageFiles?: readonly string[]
  ): ClipboardHistoryItem[] {
    this.items = nextItems;
    if (removedImageFiles && removedImageFiles.length > 0) {
      const env = getClipboardRuntimeModules();
      for (const fileName of removedImageFiles) {
        removeClipboardImageFile(env, fileName);
      }
    }
    this.scheduleSave();
    this.deps.onChange?.(this.items);
    return this.items;
  }

  private async pollOnce(verbose = false): Promise<void> {
    if (this.isPolling) {
      return;
    }
    this.isPolling = true;
    try {
      const env = getClipboardRuntimeModules();
      if (!env) {
        if (verbose) {
          logger.debug("pollOnce skipped: runtime modules unavailable");
        }
        return;
      }
      const entry = await this.readCurrentSystemEntry(env, verbose);
      if (!entry) {
        if (verbose) {
          logger.debug("pollOnce: no entry read from system clipboard");
        }
        return;
      }
      if (entry.signature === this.lastPolledSignature) {
        if (verbose) {
          logger.debug("pollOnce: signature unchanged", { signature: entry.signature });
        }
        return;
      }
      this.lastPolledSignature = entry.signature;
      if (this.suppressedSignature) {
        const suppressed = this.suppressedSignature;
        this.suppressedSignature = "";
        if (entry.signature === suppressed) {
          return;
        }
      }

      const existing = this.items.find((item) => item.signature === entry.signature);
      if (entry.kind === "image" && !existing && entry.imageBytes) {
        const fileName = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
        if (writeClipboardImageFile(env, fileName, entry.imageBytes)) {
          entry.incoming.imageFileName = fileName;
        } else {
          return;
        }
      }

      const result = upsertClipboardHistoryItem(this.items, entry.incoming);
      this.commitItems(result.nextItems, result.removedImageFiles);
      logger.debug("captured clipboard entry", {
        kind: entry.kind,
        added: result.added,
        total: this.items.length,
        preview: entry.incoming.previewText.slice(0, 40)
      });
    } finally {
      this.isPolling = false;
    }
  }

  private async readCurrentSystemEntry(
    env: ClipboardRuntimeModules,
    verbose = false
  ): Promise<PolledClipboardEntry | null> {
    const { clipboard, platform } = env;

    // 1. 优先检测文件列表（资源管理器复制文件时往往同时带文本或缩略图）
    let filePaths: string[] = [];
    try {
      if (platform === "win32" && typeof clipboard.readBuffer === "function") {
        const buf = await Promise.resolve(clipboard.readBuffer("CF_HDROP"));
        filePaths = parseWindowsCfHdropBuffer(buf);
      } else if (platform === "darwin" && typeof clipboard.read === "function") {
        const raw = await Promise.resolve(clipboard.read("NSFilenamesPboardType"));
        if (typeof raw === "string") {
          filePaths = parseMacOsPlistFileList(raw);
        }
      } else if (typeof clipboard.readBuffer === "function") {
        const buf = await Promise.resolve(clipboard.readBuffer("text/uri-list"));
        if (buf && buf.length > 0) {
          const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
          filePaths = parseLinuxUriList(text);
        }
      }
    } catch (err) {
      if (verbose) {
        logger.debug("read file buffer error", err);
      }
      filePaths = [];
    }

    if (filePaths.length > 0) {
      return buildFileEntry(filePaths);
    }

    // 2. 检测图像（兼容同步/异步 readImage）
    if (typeof clipboard.readImage === "function") {
      try {
        const img = await Promise.resolve(clipboard.readImage());
        if (img && typeof img.isEmpty === "function" && !img.isEmpty()) {
          const pngBytes = img.toPNG();
          if (pngBytes && pngBytes.length > 0) {
            const size = img.getSize();
            const signature = buildClipboardImageSignature(pngBytes, size.width, size.height);
            return {
              kind: "image",
              signature,
              imageBytes: pngBytes,
              incoming: {
                kind: "image",
                signature,
                previewText: `图像 ${size.width}×${size.height}`,
                imageWidth: size.width,
                imageHeight: size.height
              }
            };
          }
        }
      } catch (err) {
        if (verbose) {
          logger.debug("readImage error", err);
        }
      }
    }

    // 3. 检测文本（兼容同步/异步 readText）
    if (typeof clipboard.readText === "function") {
      try {
        const text = await Promise.resolve(clipboard.readText());
        if (typeof text === "string" && text.trim().length > 0) {
          return buildTextEntry(text);
        }
      } catch (err) {
        if (verbose) {
          logger.debug("readText error", err);
        }
      }
    }

    // 4. 兼容 Electron 新版异步 clipboard.read() (ClipboardItem[])
    if (typeof clipboard.read === "function") {
      try {
        const rawItems = await Promise.resolve(clipboard.read());
        if (Array.isArray(rawItems) && rawItems.length > 0) {
          for (const item of rawItems) {
            if (!item || !Array.isArray(item.types) || typeof item.getType !== "function") {
              continue;
            }
            if (item.types.includes("text/uri-list")) {
              const blob = (await item.getType("text/uri-list")) as Blob | undefined;
              if (blob && typeof blob.text === "function") {
                const uriPaths = parseLinuxUriList(await blob.text());
                if (uriPaths.length > 0) {
                  return buildFileEntry(uriPaths);
                }
              }
            }
            if (item.types.includes("image/png")) {
              const blob = (await item.getType("image/png")) as Blob | undefined;
              if (blob && typeof blob.arrayBuffer === "function") {
                const bytes = new Uint8Array(await blob.arrayBuffer());
                if (bytes.length > 0) {
                  const signature = buildClipboardImageSignature(bytes, 0, 0);
                  return {
                    kind: "image",
                    signature,
                    imageBytes: bytes,
                    incoming: {
                      kind: "image",
                      signature,
                      previewText: "图像"
                    }
                  };
                }
              }
            }
            if (item.types.includes("text/plain")) {
              const blob = (await item.getType("text/plain")) as Blob | undefined;
              if (blob && typeof blob.text === "function") {
                const text = await blob.text();
                if (text && text.trim().length > 0) {
                  return buildTextEntry(text);
                }
              }
            }
          }
        }
      } catch (err) {
        if (verbose) {
          logger.debug("clipboard.read() fallback error", err);
        }
      }
    }

    return null;
  }

  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flushSave();
    }, 300);
  }

  private async flushSave(): Promise<void> {
    try {
      await this.deps.saveData(CLIPBOARD_STORAGE_FILE, {
        version: 1,
        items: this.items
      });
    } catch {
      // Ignore storage write errors
    }
  }
}

function buildFileEntry(filePaths: string[]): PolledClipboardEntry {
  const signature = buildClipboardFileSignature(filePaths);
  return {
    kind: "file",
    signature,
    incoming: {
      kind: "file",
      signature,
      previewText: formatFileNamesSummary(filePaths),
      filePaths
    }
  };
}

function buildTextEntry(text: string): PolledClipboardEntry {
  const signature = buildClipboardTextSignature(text);
  return {
    kind: "text",
    signature,
    incoming: {
      kind: "text",
      signature,
      previewText: buildClipboardTextPreview(text),
      text
    }
  };
}
