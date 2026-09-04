import {
  DEFAULT_FLOATING_TEXT_CONFIG,
  FloatingTextConfig,
  normalizeFloatingConfig,
} from "@/core/floating-text-core";

const FLOATING_TEXT_STORAGE_KEY = "doc-assistant.floating-text.config";

type PluginPersistenceHandler = (config: FloatingTextConfig) => Promise<void> | void;
let pluginPersistenceHandler: PluginPersistenceHandler | null = null;
let memoryConfigCache: FloatingTextConfig | null = null;

/**
 * 绑定思源插件的官方持久化函数 (plugin.saveData)
 */
export function bindPluginFloatingPersistence(handler: PluginPersistenceHandler | null): void {
  pluginPersistenceHandler = handler;
}

function getElectronRemote(): any {
  if (typeof window === "undefined") return null;
  try {
    const electron = (window as any).require?.("electron");
    const remote = (window as any).require?.("@electron/remote") || electron?.remote;
    return remote || null;
  } catch {
    return null;
  }
}

function getElectronDiskConfigPath(): string | null {
  try {
    const req =
      (typeof window !== "undefined" && (window as any).require) ||
      (typeof require === "function" ? require : null);
    if (!req) return null;
    const path = req("path");
    if (!path || typeof path.join !== "function") return null;

    const remote = getElectronRemote();
    let userData = "";
    if (remote?.app && typeof remote.app.getPath === "function") {
      userData = remote.app.getPath("userData");
    }
    if (!userData && typeof process !== "undefined" && process.env) {
      userData = process.env.APPDATA || process.env.HOME || "";
    }
    if (!userData) return null;
    return path.join(userData, "siyuan-doc-assist-floating-config.json");
  } catch {
    return null;
  }
}

function readDiskConfig(): Partial<FloatingTextConfig> | null {
  try {
    const cfgPath = getElectronDiskConfigPath();
    if (!cfgPath) return null;
    const req =
      (typeof window !== "undefined" && (window as any).require) ||
      (typeof require === "function" ? require : null);
    const fs = req?.("fs");
    if (!fs || typeof fs.existsSync !== "function" || !fs.existsSync(cfgPath)) return null;
    const raw = fs.readFileSync(cfgPath, "utf-8");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeDiskConfig(config: FloatingTextConfig): void {
  try {
    const cfgPath = getElectronDiskConfigPath();
    if (!cfgPath) return;
    const req =
      (typeof window !== "undefined" && (window as any).require) ||
      (typeof require === "function" ? require : null);
    const fs = req?.("fs");
    if (!fs || typeof fs.writeFileSync !== "function") return;
    fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), "utf-8");
  } catch {
    // 忽略文件写入异常
  }
}

function getProcessSharedConfig(): Partial<FloatingTextConfig> | null {
  try {
    const remote = getElectronRemote();
    if (remote && remote.process && remote.process.__siyuan_doc_assist_floating_config) {
      return remote.process.__siyuan_doc_assist_floating_config;
    }
  } catch {}
  return null;
}

function setProcessSharedConfig(config: FloatingTextConfig): void {
  try {
    const remote = getElectronRemote();
    if (remote && remote.process) {
      remote.process.__siyuan_doc_assist_floating_config = { ...config };
    }
  } catch {}
}

/**
 * 读取本地持久化的悬浮文本配置
 */
export function loadFloatingTextConfig(
  storage: Pick<Storage, "getItem"> | null | undefined = typeof window !== "undefined"
    ? window.localStorage
    : null
): FloatingTextConfig {
  const isDefaultStorage =
    !storage || (typeof window !== "undefined" && storage === window.localStorage);

  // 若处于默认环境，可利用主进程跨窗口共享内存和内存缓存加速
  if (isDefaultStorage) {
    const shared = getProcessSharedConfig();
    if (shared) {
      const normalized = normalizeFloatingConfig(shared);
      memoryConfigCache = normalized;
      return normalized;
    }

    const disk = readDiskConfig();
    if (disk) {
      const normalized = normalizeFloatingConfig(disk);
      memoryConfigCache = normalized;
      setProcessSharedConfig(normalized);
      return normalized;
    }

    if (memoryConfigCache) {
      return memoryConfigCache;
    }
  }

  // 从指定 storage 读取
  if (storage && typeof storage.getItem === "function") {
    try {
      const raw = storage.getItem(FLOATING_TEXT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const normalized = normalizeFloatingConfig(parsed);
        if (isDefaultStorage) {
          memoryConfigCache = normalized;
          setProcessSharedConfig(normalized);
        }
        return normalized;
      }
    } catch {}
  }

  const def = { ...DEFAULT_FLOATING_TEXT_CONFIG };
  if (isDefaultStorage) {
    memoryConfigCache = def;
  }
  return def;
}

/**
 * 重置内存缓存（主要用于测试隔离与生命周期重置）
 */
export function resetFloatingTextConfigCache(): void {
  memoryConfigCache = null;
  try {
    const remote = getElectronRemote();
    if (remote && remote.process) {
      delete remote.process.__siyuan_doc_assist_floating_config;
    }
  } catch {}
}

/**
 * 设置当前全局悬浮文本配置（由插件主生命周期在 loadData 后注入）
 */
export function setCachedFloatingTextConfig(config: FloatingTextConfig): void {
  const normalized = normalizeFloatingConfig(config);
  memoryConfigCache = normalized;
  setProcessSharedConfig(normalized);
  writeDiskConfig(normalized);
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(FLOATING_TEXT_STORAGE_KEY, JSON.stringify(normalized));
    } catch {}
  }
}

/**
 * 保存悬浮文本配置到多级本地存储
 */
export function saveFloatingTextConfig(
  patch: Partial<FloatingTextConfig>,
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined = typeof window !== "undefined"
    ? window.localStorage
    : null
): FloatingTextConfig {
  const current = loadFloatingTextConfig(storage);
  const next = normalizeFloatingConfig({ ...current, ...patch });
  memoryConfigCache = next;

  // 1. 同步到主进程跨窗口共享对象
  setProcessSharedConfig(next);

  // 2. 同步到本地磁盘独立 JSON 备份文件
  writeDiskConfig(next);

  // 3. 同步到 localStorage
  if (storage && typeof storage.setItem === "function") {
    try {
      storage.setItem(FLOATING_TEXT_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  // 4. 触发思源插件官方持久化通道 (plugin.saveData)
  if (pluginPersistenceHandler) {
    try {
      void pluginPersistenceHandler(next);
    } catch (e) {
      console.warn("[DocAssistant][FloatingText] plugin persistence failed:", e);
    }
  }

  return next;
}
