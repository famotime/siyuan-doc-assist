import { createDocAssistantLogger } from "@/core/logger-core";
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
  extractParentDir,
  formatFileNamesSummary,
  IncomingClipboardEntry,
  mergeClipboardItems,
  normalizeClipboardStorageIndex,
  normalizeLocalFilePath,
  toggleClipboardItemFavorite,
  upsertClipboardHistoryItem
} from "@/core/clipboard-core";

const logger = createDocAssistantLogger("Clipboard");

export const CLIPBOARD_STORAGE_FILE = "clipboard-history.json";
const CLIPBOARD_POLL_INTERVAL_MS = 700;

type ClipboardDataItemLike = {
  types: readonly string[];
  getType: (type: string) => Promise<unknown>;
};

type ElectronNativeImageInstanceLike = {
  isEmpty: () => boolean;
  toPNG: () => Uint8Array;
  getSize: () => { width: number; height: number };
};

type ElectronClipboardLike = {
  readText?: () => string | Promise<string>;
  writeText?: (text: string) => void | Promise<void>;
  readImage?: () => ElectronNativeImageInstanceLike | Promise<ElectronNativeImageInstanceLike>;
  writeImage?: (image: unknown) => void | Promise<void>;
  readBuffer?: (format: string) => Uint8Array | Promise<Uint8Array>;
  writeBuffer?: (format: string, buffer: Uint8Array) => void | Promise<void>;
  read?: ((format?: string) => string | Promise<ClipboardDataItemLike[]>);
  availableFormats?: () => string[] | Promise<string[]>;
};

type ElectronNativeImageLike = {
  createFromPath: (path: string) => { isEmpty: () => boolean };
  createFromBuffer: (buf: Uint8Array) => { isEmpty: () => boolean };
};

type ElectronShellLike = {
  showItemInFolder?: (fullPath: string) => void;
  openPath?: (path: string) => Promise<string>;
};

type NodeFsLike = {
  existsSync: (path: string) => boolean;
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
  writeFileSync: (path: string, data: Uint8Array) => void;
  readFileSync: (path: string) => Uint8Array;
  unlinkSync: (path: string) => void;
};

type NodePathLike = {
  join: (...parts: string[]) => string;
};

export function parseWindowsCfHdropBuffer(raw: Uint8Array): string[] {
  if (!raw || raw.length < 20) {
    return [];
  }
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const pFiles = view.getUint32(0, true);
  const fWide = view.getUint32(16, true);
  if (pFiles < 20 || pFiles >= raw.length) {
    return [];
  }

  const slice = raw.subarray(pFiles);
  if (fWide !== 0) {
    const codeUnits: number[] = [];
    for (let i = 0; i + 1 < slice.length; i += 2) {
      const unit = slice[i] | (slice[i + 1] << 8);
      if (unit === 0) {
        if (codeUnits.length === 0 || codeUnits[codeUnits.length - 1] === 0) {
          break;
        }
        codeUnits.push(0);
      } else {
        codeUnits.push(unit);
      }
    }
    const decoded = String.fromCharCode(...codeUnits);
    return decoded
      .split("\0")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  let end = slice.length;
  for (let i = 0; i < slice.length; i += 1) {
    if (slice[i] === 0 && (i + 1 >= slice.length || slice[i + 1] === 0)) {
      end = i;
      break;
    }
  }
  const ascii = new TextDecoder("utf-8", { fatal: false }).decode(slice.subarray(0, end));
  return ascii
    .split("\0")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function encodeWindowsCfHdropBuffer(paths: string[]): Uint8Array {
  const cleaned = paths.map((p) => p.trim()).filter(Boolean);
  const payloadText = `${cleaned.join("\0")}\0\0`;
  const byteLength = 20 + payloadText.length * 2;
  const result = new Uint8Array(byteLength);
  const view = new DataView(result.buffer);
  view.setUint32(0, 20, true); // pFiles
  view.setUint32(16, 1, true); // fWide = 1 (UTF-16LE)
  for (let i = 0; i < payloadText.length; i += 1) {
    const code = payloadText.charCodeAt(i);
    result[20 + i * 2] = code & 0xFF;
    result[20 + i * 2 + 1] = (code >>> 8) & 0xFF;
  }
  return result;
}

export function parseLinuxUriList(raw: string): string[] {
  if (!raw) {
    return [];
  }
  const paths: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    if (trimmed.startsWith("file://")) {
      try {
        paths.push(normalizeLocalFilePath(decodeURIComponent(trimmed.slice(7))));
      } catch {
        paths.push(normalizeLocalFilePath(trimmed.slice(7)));
      }
    }
  }
  return paths;
}

export function encodeLinuxUriList(paths: string[]): string {
  return paths
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `file://${encodeURI(p)}`)
    .join("\r\n");
}

export function parseMacOsPlistFileList(xml: string): string[] {
  if (!xml) {
    return [];
  }
  const results: string[] = [];
  const regex = /<string>([\s\S]*?)<\/string>/g;
  for (let match = regex.exec(xml); match !== null; match = regex.exec(xml)) {
    const decoded = match[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .trim();
    if (decoded) {
      results.push(decoded);
    }
  }
  return results;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function encodeMacOsPlistFileList(paths: string[]): string {
  const entries = paths
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `  <string>${escapeXml(p)}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<array>\n${entries}\n</array>\n</plist>`;
}

export type ClipboardMonitorDeps = {
  loadData: (storageName: string) => Promise<unknown>;
  saveData: (storageName: string, data: ClipboardStorageIndex) => Promise<void>;
  onChange?: (items: ClipboardHistoryItem[]) => void;
};

function resolveNodeRequire(): ((id: string) => unknown) | null {
  if (typeof window !== "undefined") {
    const winReq = (window as unknown as { require?: (id: string) => unknown }).require;
    if (typeof winReq === "function") {
      return winReq;
    }
  }
  const globalReq = (globalThis as unknown as { require?: (id: string) => unknown }).require;
  if (typeof globalReq === "function") {
    return globalReq;
  }
  return null;
}

function resolveElectronClipboardModules(req: (id: string) => unknown): {
  clipboard?: ElectronClipboardLike;
  nativeImage?: ElectronNativeImageLike;
  shell?: ElectronShellLike;
} {
  let electronMod: {
    clipboard?: ElectronClipboardLike;
    nativeImage?: ElectronNativeImageLike;
    shell?: ElectronShellLike;
    remote?: {
      clipboard?: ElectronClipboardLike;
      nativeImage?: ElectronNativeImageLike;
      shell?: ElectronShellLike;
    };
  } | undefined;
  let remoteMod: {
    clipboard?: ElectronClipboardLike;
    nativeImage?: ElectronNativeImageLike;
    shell?: ElectronShellLike;
  } | undefined;
  try {
    electronMod = req("electron") as typeof electronMod;
  } catch {
    electronMod = undefined;
  }
  try {
    remoteMod = (req("@electron/remote") as typeof remoteMod) || electronMod?.remote;
  } catch {
    remoteMod = electronMod?.remote;
  }
  return {
    clipboard: electronMod?.clipboard || remoteMod?.clipboard,
    nativeImage: electronMod?.nativeImage || remoteMod?.nativeImage,
    shell: electronMod?.shell || remoteMod?.shell
  };
}

function inferPlatformFallback(): string {
  if (typeof navigator !== "undefined") {
    const p = (navigator.platform || navigator.userAgent || "").toLowerCase();
    if (p.includes("win")) {
      return "win32";
    }
    if (p.includes("mac")) {
      return "darwin";
    }
  }
  return "linux";
}

export function isDesktopElectronClipboardSupported(): boolean {
  const req = resolveNodeRequire();
  if (!req) {
    return false;
  }
  const { clipboard } = resolveElectronClipboardModules(req);
  return Boolean(
    clipboard &&
    (typeof clipboard.readText === "function" || typeof clipboard.read === "function")
  );
}

export class ClipboardMonitorService {
  private items: ClipboardHistoryItem[] = [];
  private loaded = false;
  private running = false;
  private isPolling = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastPolledSignature = "";
  private suppressedSignature = "";
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: ClipboardMonitorDeps) {}

  public isSupported(): boolean {
    return isDesktopElectronClipboardSupported();
  }

  public async ensureLoaded(): Promise<ClipboardHistoryItem[]> {
    if (this.loaded) {
      return this.items;
    }
    try {
      const raw = await this.deps.loadData(CLIPBOARD_STORAGE_FILE);
      this.items = normalizeClipboardStorageIndex(raw);
    } catch {
      this.items = [];
    }
    this.loaded = true;
    return this.items;
  }

  public getItems(): ClipboardHistoryItem[] {
    return this.items;
  }

  public async start(): Promise<void> {
    if (this.running) {
      logger.debug("start skipped: already running");
      return;
    }
    const env = this.getRuntimeModules();
    if (!env) {
      logger.warn("Electron clipboard API unavailable, monitor not started", {
        hasWindowRequire: typeof window !== "undefined" && typeof (window as unknown as { require?: unknown }).require === "function",
        hasGlobalRequire: typeof (globalThis as unknown as { require?: unknown }).require === "function"
      });
      return;
    }
    this.running = true;
    logger.debug("monitor starting", {
      platform: env.platform,
      hasNativeImage: Boolean(env.nativeImage),
      hasFs: Boolean(env.fs),
      hasPath: Boolean(env.path)
    });
    await this.ensureLoaded();
    if (!this.running) {
      return;
    }
    logger.debug("monitor loaded history", { count: this.items.length });
    await this.pollOnce();
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
    this.items = toggleClipboardItemFavorite(this.items, id);
    this.scheduleSave();
    this.deps.onChange?.(this.items);
    return this.items;
  }

  public async deleteItem(id: string): Promise<ClipboardHistoryItem[]> {
    await this.ensureLoaded();
    const { nextItems, removedImageFile } = deleteClipboardItem(this.items, id);
    this.items = nextItems;
    if (removedImageFile) {
      this.removeImageFile(removedImageFile);
    }
    this.scheduleSave();
    this.deps.onChange?.(this.items);
    return this.items;
  }

  public async deleteItems(ids: readonly string[]): Promise<ClipboardHistoryItem[]> {
    await this.ensureLoaded();
    const { nextItems, removedImageFiles } = deleteClipboardItems(this.items, ids);
    this.items = nextItems;
    for (const fileName of removedImageFiles) {
      this.removeImageFile(fileName);
    }
    this.scheduleSave();
    this.deps.onChange?.(this.items);
    return this.items;
  }

  public async clearNonFavorites(): Promise<ClipboardHistoryItem[]> {
    await this.ensureLoaded();
    const { nextItems, removedImageFiles } = clearNonFavoriteClipboardItems(this.items);
    this.items = nextItems;
    for (const fileName of removedImageFiles) {
      this.removeImageFile(fileName);
    }
    this.scheduleSave();
    this.deps.onChange?.(this.items);
    return this.items;
  }

  public async copyItem(item: ClipboardHistoryItem): Promise<{ ok: boolean; reason?: string }> {
    const env = this.getRuntimeModules();
    if (!env) {
      return { ok: false, reason: "仅支持桌面端剪贴板" };
    }
    const { clipboard, nativeImage, fs } = env;
    this.suppressedSignature = item.signature;
    this.lastPolledSignature = item.signature;

    if (item.kind === "text") {
      return this.writeTextToClipboard(env, item.text || "");
    }

    if (item.kind === "image") {
      if (!item.imageFileName || !nativeImage || typeof clipboard.writeImage !== "function") {
        return { ok: false, reason: "图片数据不可用" };
      }
      const imgPath = this.resolveImagePath(item.imageFileName);
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
      return this.writeFilesToClipboard(env, item.filePaths || []);
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
    const env = this.getRuntimeModules();
    if (!env) {
      return { ok: false, reason: "仅支持桌面端剪贴板" };
    }
    this.suppressedSignature = merged.signature;
    this.lastPolledSignature = merged.signature;

    const writeRes =
      merged.kind === "file" ?
          await this.writeFilesToClipboard(env, merged.filePaths) :
          await this.writeTextToClipboard(env, merged.text);
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
    this.items = result.nextItems;
    for (const fileName of result.removedImageFiles) {
      this.removeImageFile(fileName);
    }
    this.scheduleSave();
    this.deps.onChange?.(this.items);
    return {
      ok: true,
      items: this.items,
      skippedImageCount: result.skippedImageCount
    };
  }

  public async openFileLocation(filePath: string): Promise<{ ok: boolean; reason?: string }> {
    const trimmed = normalizeLocalFilePath(filePath);
    if (!trimmed) {
      return { ok: false, reason: "文件路径为空" };
    }
    const req = resolveNodeRequire();
    if (!req) {
      return { ok: false, reason: "仅支持桌面端打开本地目录" };
    }
    const { shell } = resolveElectronClipboardModules(req);
    if (!shell) {
      return { ok: false, reason: "当前环境不支持打开系统目录" };
    }
    let fs: NodeFsLike | undefined;
    try {
      fs = req("fs") as NodeFsLike | undefined;
    } catch {
      fs = undefined;
    }

    const fileExists = fs ? fs.existsSync(trimmed) : true;
    if (fileExists && typeof shell.showItemInFolder === "function") {
      shell.showItemInFolder(trimmed);
      return { ok: true };
    }

    const parentDir = extractParentDir(trimmed);
    const dirExists = parentDir ? (fs ? fs.existsSync(parentDir) : true) : false;
    if (dirExists && typeof shell.openPath === "function") {
      const errMsg = await shell.openPath(parentDir);
      if (errMsg) {
        return { ok: false, reason: errMsg };
      }
      return { ok: true };
    }

    return { ok: false, reason: "文件或所在目录不存在" };
  }

  private async writeTextToClipboard(
    env: RuntimeModules,
    text: string
  ): Promise<{ ok: boolean; reason?: string }> {
    if (typeof env.clipboard.writeText === "function") {
      await Promise.resolve(env.clipboard.writeText(text));
      return { ok: true };
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { ok: true };
    }
    return { ok: false, reason: "剪贴板写入不可用" };
  }

  private async writeFilesToClipboard(
    env: RuntimeModules,
    rawPaths: string[]
  ): Promise<{ ok: boolean; reason?: string }> {
    const { clipboard, fs, platform } = env;
    const normalizedPaths = rawPaths.map((p) => normalizeLocalFilePath(p)).filter(Boolean);
    const paths = fs ? normalizedPaths.filter((p) => fs.existsSync(p)) : normalizedPaths;
    if (paths.length === 0) {
      return { ok: false, reason: "原文件不存在或已被移动" };
    }
    if (typeof clipboard.writeBuffer !== "function") {
      return { ok: false, reason: "当前环境不支持文件剪贴板写回" };
    }
    if (platform === "win32") {
      await Promise.resolve(clipboard.writeBuffer("CF_HDROP", encodeWindowsCfHdropBuffer(paths)));
      return { ok: true };
    }
    if (platform === "darwin") {
      const xml = encodeMacOsPlistFileList(paths);
      await Promise.resolve(clipboard.writeBuffer("NSFilenamesPboardType", new TextEncoder().encode(xml)));
      return { ok: true };
    }
    const uriList = encodeLinuxUriList(paths);
    await Promise.resolve(clipboard.writeBuffer("text/uri-list", new TextEncoder().encode(uriList)));
    return { ok: true };
  }

  public getImageDataUrl(imageFileName?: string): string | null {
    if (!imageFileName) {
      return null;
    }
    const env = this.getRuntimeModules();
    if (!env || !env.fs) {
      return null;
    }
    const fullPath = this.resolveImagePath(imageFileName);
    if (!fullPath || !env.fs.existsSync(fullPath)) {
      return null;
    }
    try {
      const bytes = env.fs.readFileSync(fullPath);
      const base64 = this.uint8ArrayToBase64(bytes);
      return `data:image/png;base64,${base64}`;
    } catch {
      return null;
    }
  }

  private async pollOnce(verbose = false): Promise<void> {
    if (this.isPolling) {
      return;
    }
    this.isPolling = true;
    try {
      const env = this.getRuntimeModules();
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
      if (entry.signature === this.suppressedSignature) {
        this.suppressedSignature = "";
        return;
      }

      const existing = this.items.find((item) => item.signature === entry.signature);
      if (entry.kind === "image" && !existing && entry.imageBytes) {
        const fileName = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
        if (this.writeImageFile(fileName, entry.imageBytes)) {
          entry.incoming.imageFileName = fileName;
        } else {
          return;
        }
      }

      const result = upsertClipboardHistoryItem(this.items, entry.incoming);
      this.items = result.nextItems;
      for (const removed of result.removedImageFiles) {
        this.removeImageFile(removed);
      }
      logger.debug("captured clipboard entry", {
        kind: entry.kind,
        added: result.added,
        total: this.items.length,
        preview: entry.incoming.previewText.slice(0, 40)
      });
      this.scheduleSave();
      this.deps.onChange?.(this.items);
    } finally {
      this.isPolling = false;
    }
  }

  private async readCurrentSystemEntry(
    env: RuntimeModules,
    verbose = false
  ): Promise<{
    signature: string;
    incoming: IncomingClipboardEntry;
    kind: "text" | "image" | "file";
    imageBytes?: Uint8Array;
  } | null> {
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
                  const signature = buildClipboardFileSignature(uriPaths);
                  return {
                    kind: "file",
                    signature,
                    incoming: {
                      kind: "file",
                      signature,
                      previewText: formatFileNamesSummary(uriPaths),
                      filePaths: uriPaths
                    }
                  };
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

  private getImageDir(): string | null {
    const env = this.getRuntimeModules();
    if (!env || !env.fs || !env.path) {
      return null;
    }
    const dataDir = (window as unknown as {
      siyuan?: { config?: { system?: { dataDir?: string } } };
    }).siyuan?.config?.system?.dataDir;
    const baseDir = dataDir ?
        env.path.join(dataDir, "storage", "petal", "siyuan-doc-assist") :
        env.path.join(env.tmpdir, "siyuan-doc-assist");
    const imageDir = env.path.join(baseDir, "clipboard-images");
    if (!env.fs.existsSync(imageDir)) {
      env.fs.mkdirSync(imageDir, { recursive: true });
    }
    return imageDir;
  }

  private resolveImagePath(fileName: string): string | null {
    const env = this.getRuntimeModules();
    const dir = this.getImageDir();
    if (!env || !env.path || !dir) {
      return null;
    }
    return env.path.join(dir, fileName);
  }

  private writeImageFile(fileName: string, bytes: Uint8Array): boolean {
    const env = this.getRuntimeModules();
    const fullPath = this.resolveImagePath(fileName);
    if (!env || !env.fs || !fullPath) {
      console.warn("[DocAssistant][Clipboard] writeImageFile skipped: fs/path unavailable");
      return false;
    }
    try {
      env.fs.writeFileSync(fullPath, bytes);
      return true;
    } catch (err) {
      console.warn("[DocAssistant][Clipboard] writeImageFile failed:", err);
      return false;
    }
  }

  private removeImageFile(fileName: string): void {
    const env = this.getRuntimeModules();
    const fullPath = this.resolveImagePath(fileName);
    if (!env || !env.fs || !fullPath) {
      return;
    }
    try {
      if (env.fs.existsSync(fullPath)) {
        env.fs.unlinkSync(fullPath);
      }
    } catch {
      // Ignore cleanup failure
    }
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

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    const chunkSize = 0x8000;
    const parts: string[] = [];
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      parts.push(String.fromCharCode(...chunk));
    }
    return btoa(parts.join(""));
  }

  private getRuntimeModules(): RuntimeModules | null {
    const req = resolveNodeRequire();
    if (!req) {
      return null;
    }
    const { clipboard, nativeImage } = resolveElectronClipboardModules(req);
    if (
      !clipboard ||
      (typeof clipboard.readText !== "function" && typeof clipboard.read !== "function")
    ) {
      return null;
    }
    let fs: NodeFsLike | undefined;
    let path: NodePathLike | undefined;
    let os: { platform?: () => string; tmpdir?: () => string } | undefined;
    try {
      fs = req("fs") as NodeFsLike | undefined;
    } catch {
      fs = undefined;
    }
    try {
      path = req("path") as NodePathLike | undefined;
    } catch {
      path = undefined;
    }
    try {
      os = req("os") as { platform?: () => string; tmpdir?: () => string } | undefined;
    } catch {
      os = undefined;
    }
    return {
      clipboard,
      nativeImage,
      fs,
      path,
      platform: typeof os?.platform === "function" ? os.platform() : inferPlatformFallback(),
      tmpdir: typeof os?.tmpdir === "function" ? os.tmpdir() : ""
    };
  }
}

type RuntimeModules = {
  clipboard: ElectronClipboardLike;
  nativeImage?: ElectronNativeImageLike;
  fs?: NodeFsLike;
  path?: NodePathLike;
  platform: string;
  tmpdir: string;
};
