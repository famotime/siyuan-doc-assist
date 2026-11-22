import {
  encodeLinuxUriList,
  encodeMacOsPlistFileList,
  encodeWindowsCfHdropBuffer
} from "@/core/clipboard-codec-core";
import { extractParentDir, normalizeLocalFilePath } from "@/core/clipboard-core";
import { requestApi } from "@/services/request";

export type ClipboardDataItemLike = {
  types: readonly string[];
  getType: (type: string) => Promise<unknown>;
};

export type ElectronNativeImageInstanceLike = {
  isEmpty: () => boolean;
  toPNG: () => Uint8Array;
  getSize: () => { width: number; height: number };
};

export type ClipboardItemCtorLike = new (data: Record<string, string | Blob>) => unknown;

export type ChildProcessLike = {
  execFile: (
    file: string,
    args: string[],
    options: Record<string, unknown>,
    callback: (error: Error | null, stdout: string, stderr: string) => void
  ) => unknown;
};

export type ElectronClipboardLike = {
  readText?: () => string | Promise<string>;
  writeText?: (text: string) => void | Promise<void>;
  readImage?: () => ElectronNativeImageInstanceLike | Promise<ElectronNativeImageInstanceLike>;
  writeImage?: (image: unknown) => void | Promise<void>;
  readBuffer?: (format: string) => Uint8Array | Promise<Uint8Array>;
  writeBuffer?: (format: string, buffer: Uint8Array) => void | Promise<void>;
  read?: ((format?: string) => string | Promise<ClipboardDataItemLike[]>);
  write?: (items: unknown[]) => void | Promise<void>;
  availableFormats?: () => string[] | Promise<string[]>;
};

export type ElectronNativeImageLike = {
  createFromPath: (path: string) => { isEmpty: () => boolean };
  createFromBuffer: (buf: Uint8Array) => { isEmpty: () => boolean };
};

export type ElectronShellLike = {
  showItemInFolder?: (fullPath: string) => void;
  openPath?: (path: string) => Promise<string>;
};

export type NodeFsLike = {
  existsSync: (path: string) => boolean;
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
  writeFileSync: (path: string, data: Uint8Array) => void;
  readFileSync: (path: string) => Uint8Array;
  unlinkSync: (path: string) => void;
};

export type NodePathLike = {
  join: (...parts: string[]) => string;
};

export type ClipboardRuntimeModules = {
  clipboard: ElectronClipboardLike;
  nativeImage?: ElectronNativeImageLike;
  fs?: NodeFsLike;
  path?: NodePathLike;
  childProcess?: ChildProcessLike;
  ClipboardItem?: ClipboardItemCtorLike;
  platform: string;
  tmpdir: string;
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

function tryRequire<T>(req: (id: string) => unknown, id: string): T | undefined {
  try {
    return req(id) as T | undefined;
  } catch {
    return undefined;
  }
}

function resolveElectronClipboardModules(req: (id: string) => unknown): {
  clipboard?: ElectronClipboardLike;
  nativeImage?: ElectronNativeImageLike;
  shell?: ElectronShellLike;
  ClipboardItem?: ClipboardItemCtorLike;
} {
  type ElectronModShape = {
    clipboard?: ElectronClipboardLike;
    nativeImage?: ElectronNativeImageLike;
    shell?: ElectronShellLike;
    ClipboardItem?: ClipboardItemCtorLike;
    remote?: {
      clipboard?: ElectronClipboardLike;
      nativeImage?: ElectronNativeImageLike;
      shell?: ElectronShellLike;
      ClipboardItem?: ClipboardItemCtorLike;
    };
  };
  const electronMod = tryRequire<ElectronModShape>(req, "electron");
  const remoteMod =
    tryRequire<ElectronModShape["remote"]>(req, "@electron/remote") || electronMod?.remote;
  return {
    clipboard: electronMod?.clipboard || remoteMod?.clipboard,
    nativeImage: electronMod?.nativeImage || remoteMod?.nativeImage,
    shell: electronMod?.shell || remoteMod?.shell,
    ClipboardItem: electronMod?.ClipboardItem || remoteMod?.ClipboardItem
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

export function getClipboardRuntimeModules(): ClipboardRuntimeModules | null {
  const req = resolveNodeRequire();
  if (!req) {
    return null;
  }
  const { clipboard, nativeImage, ClipboardItem } = resolveElectronClipboardModules(req);
  if (
    !clipboard ||
    (typeof clipboard.readText !== "function" && typeof clipboard.read !== "function")
  ) {
    return null;
  }
  const fs = tryRequire<NodeFsLike>(req, "fs");
  const path = tryRequire<NodePathLike>(req, "path");
  const childProcess = tryRequire<ChildProcessLike>(req, "child_process");
  const os = tryRequire<{ platform?: () => string; tmpdir?: () => string }>(req, "os");
  return {
    clipboard,
    nativeImage,
    fs,
    path,
    childProcess,
    ClipboardItem,
    platform: typeof os?.platform === "function" ? os.platform() : inferPlatformFallback(),
    tmpdir: typeof os?.tmpdir === "function" ? os.tmpdir() : ""
  };
}

export async function openClipboardFileLocation(
  filePath: string
): Promise<{ ok: boolean; reason?: string }> {
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
  const fs = tryRequire<NodeFsLike>(req, "fs");

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

export async function writeTextToSystemClipboard(
  env: ClipboardRuntimeModules,
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

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function execFileAsync(
  cp: ChildProcessLike,
  file: string,
  args: string[],
  env?: Record<string, string | undefined>
): Promise<{ ok: boolean; reason?: string }> {
  return new Promise((resolve) => {
    try {
      cp.execFile(file, args, { env, windowsHide: true, timeout: 10000 }, (error, _stdout, stderr) => {
        if (error) {
          resolve({ ok: false, reason: String(stderr || error.message).trim() });
          return;
        }
        resolve({ ok: true });
      });
    } catch (err) {
      resolve({ ok: false, reason: describeError(err) });
    }
  });
}

// Electron 44 移除了 writeBuffer，Windows 下改用 PowerShell 的 Set-Clipboard 写入标准 CF_HDROP。
function writeFilesViaPowerShell(cp: ChildProcessLike, paths: string[]) {
  const baseEnv =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const script =
    "$ErrorActionPreference='Stop';" +
    "$p=[string[]](ConvertFrom-Json $env:DOC_ASSIST_CLIP_PATHS);" +
    "Set-Clipboard -LiteralPath $p";
  return execFileAsync(
    cp,
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-STA", "-Command", script],
    { ...baseEnv, DOC_ASSIST_CLIP_PATHS: JSON.stringify(paths) }
  );
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function writeFilesViaOsaScript(cp: ChildProcessLike, paths: string[]) {
  const list = paths.map((p) => `POSIX file "${escapeAppleScriptString(p)}"`).join(", ");
  return execFileAsync(cp, "osascript", ["-e", `set the clipboard to {${list}}`]);
}

export async function writeFilesToSystemClipboard(
  env: ClipboardRuntimeModules,
  rawPaths: string[]
): Promise<{ ok: boolean; reason?: string }> {
  const { clipboard, fs, platform, childProcess, ClipboardItem } = env;
  const normalizedPaths = rawPaths.map((p) => normalizeLocalFilePath(p)).filter(Boolean);
  const paths = fs ? normalizedPaths.filter((p) => fs.existsSync(p)) : normalizedPaths;
  if (paths.length === 0) {
    return { ok: false, reason: "原文件不存在或已被移动" };
  }
  const errors: string[] = [];

  if (childProcess && platform === "win32") {
    const res = await writeFilesViaPowerShell(childProcess, paths);
    if (res.ok) {
      return res;
    }
    errors.push(res.reason || "PowerShell 写入失败");
  }
  if (childProcess && platform === "darwin") {
    const res = await writeFilesViaOsaScript(childProcess, paths);
    if (res.ok) {
      return res;
    }
    errors.push(res.reason || "osascript 写入失败");
  }

  // Electron 44+：ClipboardItem + text/uri-list（只传字符串，可安全跨 remote 传递）
  if (ClipboardItem && typeof clipboard.write === "function") {
    try {
      const item = new ClipboardItem({ "text/uri-list": encodeLinuxUriList(paths) });
      await Promise.resolve(clipboard.write([item]));
      return { ok: true };
    } catch (err) {
      errors.push(describeError(err));
    }
  }

  // 旧版 Electron：writeBuffer
  if (typeof clipboard.writeBuffer === "function") {
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

  const detail = errors.filter(Boolean).join("；");
  return { ok: false, reason: detail ? `文件写入剪贴板失败：${detail}` : "当前环境不支持文件剪贴板写回" };
}

export async function writeImageToSystemClipboard(
  env: ClipboardRuntimeModules,
  params: { bytes: Uint8Array; filePath: string }
): Promise<{ ok: boolean; reason?: string }> {
  const { clipboard, nativeImage } = env;
  const errors: string[] = [];

  // 标准 Web 异步剪贴板：Electron 44 已移除 clipboard.writeImage，思源自身也走此通道。
  // 需在用户手势内同步发起，因此调用前不能有 await。
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard?.write &&
    typeof ClipboardItem !== "undefined"
  ) {
    try {
      const blob = new Blob([params.bytes as BlobPart], { type: "image/png" });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return { ok: true };
    } catch (err) {
      errors.push(describeError(err));
    }
  }

  // 旧版 Electron：nativeImage + writeImage
  if (nativeImage && typeof clipboard.writeImage === "function") {
    const img = nativeImage.createFromPath(params.filePath);
    if (!img || img.isEmpty()) {
      return { ok: false, reason: "读取图片失败" };
    }
    await Promise.resolve(clipboard.writeImage(img));
    return { ok: true };
  }

  const detail = errors.filter(Boolean).join("；");
  return { ok: false, reason: detail ? `图片写入剪贴板失败：${detail}` : "图片数据不可用" };
}

export async function readFilePathsFromKernel(platform: string): Promise<string[]> {
  if (platform === "linux") {
    return [];
  }
  try {
    const files = await requestApi<Array<{ path?: string }>>("/api/clipboard/readFilePaths", {});
    if (!Array.isArray(files)) {
      return [];
    }
    return files.map((f) => normalizeLocalFilePath(f?.path || "")).filter(Boolean);
  } catch {
    return [];
  }
}

function readPngSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) {
    return { width: 0, height: 0 };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}

export async function readImageFromWebClipboard(): Promise<{
  bytes: Uint8Array;
  width: number;
  height: number;
} | null> {
  if (typeof navigator === "undefined" || typeof navigator.clipboard?.read !== "function") {
    return null;
  }
  if (typeof document !== "undefined" && typeof document.hasFocus === "function" && !document.hasFocus()) {
    return null;
  }
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      if (!item.types.includes("image/png")) {
        continue;
      }
      const blob = await item.getType("image/png");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.length > 0) {
        return { bytes, ...readPngSize(bytes) };
      }
    }
  } catch {
    // 窗口失焦或权限被拒时静默跳过
  }
  return null;
}

function getClipboardImageDir(env: ClipboardRuntimeModules): string | null {
  if (!env.fs || !env.path) {
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

export function resolveClipboardImagePath(
  env: ClipboardRuntimeModules | null,
  fileName: string
): string | null {
  if (!env || !env.path) {
    return null;
  }
  const dir = getClipboardImageDir(env);
  if (!dir) {
    return null;
  }
  return env.path.join(dir, fileName);
}

export function writeClipboardImageFile(
  env: ClipboardRuntimeModules | null,
  fileName: string,
  bytes: Uint8Array
): boolean {
  const fullPath = resolveClipboardImagePath(env, fileName);
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

export function removeClipboardImageFile(
  env: ClipboardRuntimeModules | null,
  fileName: string
): void {
  const fullPath = resolveClipboardImagePath(env, fileName);
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

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    parts.push(String.fromCharCode(...chunk));
  }
  return btoa(parts.join(""));
}

export function readClipboardImageDataUrl(
  env: ClipboardRuntimeModules | null,
  imageFileName?: string
): string | null {
  if (!imageFileName || !env || !env.fs) {
    return null;
  }
  const fullPath = resolveClipboardImagePath(env, imageFileName);
  if (!fullPath || !env.fs.existsSync(fullPath)) {
    return null;
  }
  try {
    const bytes = env.fs.readFileSync(fullPath);
    return `data:image/png;base64,${uint8ArrayToBase64(bytes)}`;
  } catch {
    return null;
  }
}
