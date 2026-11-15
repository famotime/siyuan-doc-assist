import {
  FloatingTextConfig,
  hasImageMarkdown
} from "@/core/floating-text-core";
import { renderMarkdownToHtml } from "@/core/markdown-render-core";
import {
  buildFloatingWindowHtml
} from "@/ui/floating-text/floating-window-template";
import {
  loadFloatingTextConfig,
  saveFloatingTextConfig
} from "@/services/floating-text/floating-text-storage";
import { triggerSystemPaste } from "@/services/floating-text/floating-paste-helper";
import { bindPipWindowEvents } from "@/services/floating-text/floating-window-pip-events";
import { openInAppFloatingFallback } from "@/services/floating-text/floating-window-fallback";

let currentPipWindow: Window | null = null;
let currentPopupWindow: Window | null = null;

function isElectron(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).require?.("electron"));
}

function isDocPipSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    !isElectron() &&
    "documentPictureInPicture" in window &&
    typeof (window as any).documentPictureInPicture?.requestWindow === "function"
  );
}

function getElectronRemote(): any {
  if (typeof window === "undefined") return null;
  try {
    const electron = (window as any).require?.("electron");
    const remote = (window as any).require?.("@electron/remote") || electron?.remote;
    if (remote?.BrowserWindow) {
      return remote;
    }
  } catch {
    return null;
  }
  return null;
}

let currentElectronWindow: any = null;

function isSiYuanDarkTheme(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const mode = document.documentElement.getAttribute("data-theme-mode");
  if (mode === "dark") {
    return true;
  }
  return document.body?.classList.contains("body--dark") || false;
}

function closeWebFallbackWindows(...windows: Array<Window | null>): void {
  for (const candidate of windows) {
    if (candidate && !candidate.closed) {
      try {
        candidate.close();
      } catch {}
    }
  }
}

if (typeof window !== "undefined") {
  (window as any).__saveDocAssistantFloatingConfig = (patch: Partial<FloatingTextConfig>) => {
    return saveFloatingTextConfig(patch);
  };
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const bc = new BroadcastChannel("siyuan-doc-assist-floating-channel");
      bc.onmessage = (event) => {
        if (event.data?.type === "save-config" && event.data.patch) {
          saveFloatingTextConfig(event.data.patch);
        }
      };
      (window as any).__docAssistantFloatingBroadcastChannel = bc;
    } catch {}
  }
}

/**
 * 插件卸载时移除模块级全局绑定并关闭存活的悬浮窗口，避免禁用插件后
 * 子窗口的 IPC/BroadcastChannel 消息仍驱动配置写盘（僵尸态）。
 */
export function disposeFloatingWindowHostGlobals(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    delete (window as any).__saveDocAssistantFloatingConfig;
  } catch {
    (window as any).__saveDocAssistantFloatingConfig = undefined;
  }
  const bc = (window as any).__docAssistantFloatingBroadcastChannel;
  if (bc && typeof bc.close === "function") {
    try {
      bc.close();
    } catch {}
  }
  (window as any).__docAssistantFloatingBroadcastChannel = undefined;

  if (currentElectronWindow) {
    try {
      if (!currentElectronWindow.isDestroyed?.()) {
        currentElectronWindow.close();
      }
    } catch {}
    currentElectronWindow = null;
  }
  if (currentPipWindow) {
    try {
      if (!currentPipWindow.closed) {
        currentPipWindow.close();
      }
    } catch {}
    currentPipWindow = null;
  }
  if (currentPopupWindow) {
    try {
      if (!currentPopupWindow.closed) {
        currentPopupWindow.close();
      }
    } catch {}
    currentPopupWindow = null;
  }
}

function writeFloatingHtmlToTempFile(html: string): string | null {
  try {
    const electron = (window as any).require?.("electron");
    const remote = (window as any).require?.("@electron/remote") || electron?.remote;
    const path = (window as any).require?.("path");
    const os = (window as any).require?.("os");
    const fs = (window as any).require?.("fs");
    if (!fs || !path) return null;

    let tempDir = "";
    if (remote?.app && typeof remote.app.getPath === "function") {
      try {
        tempDir = remote.app.getPath("temp");
      } catch {}
    }
    if (!tempDir && os && typeof os.tmpdir === "function") {
      tempDir = os.tmpdir();
    }
    if (!tempDir && typeof process !== "undefined" && process.env) {
      tempDir = process.env.TEMP || process.env.TMP || "";
    }
    if (!tempDir) return null;

    const targetPath = path.join(tempDir, "siyuan-doc-assist-floating-window.html");
    fs.writeFileSync(targetPath, html, "utf-8");
    return targetPath;
  } catch (err) {
    console.warn("[DocAssistant][FloatingText] write temp html file failed:", err);
    return null;
  }
}

/**
 * 启动桌面置顶悬浮文本窗口
 */
export async function openFloatingTextWindow(options: {
  title: string;
  text: string;
}): Promise<void> {
  const { title, text } = options;
  const config = loadFloatingTextConfig();
  const isDark = isSiYuanDarkTheme();
  const hasImage = hasImageMarkdown(text);
  // 若包含图片内容，自动以 Markdown 模式展示，让用户首屏即可直观看到图片
  const effectiveConfig: FloatingTextConfig = hasImage ?
      { ...config, viewMode: "markdown" } :
    config;
  const initialHtml = renderMarkdownToHtml(text);
  const baseUrl =
    typeof window !== "undefined" && window.location?.origin ?
      window.location.origin :
      "";

  const remote = getElectronRemote();
  let hostWebContentsId: number | null = null;
  if (remote) {
    try {
      hostWebContentsId =
        remote.getCurrentWebContents?.()?.id ??
        remote.getCurrentWindow?.()?.webContents?.id ??
        null;
    } catch {}
  }

  const html = buildFloatingWindowHtml({
    title,
    text,
    config: effectiveConfig,
    isDark,
    initialHtml,
    hostWebContentsId,
    baseUrl
  });
  // Web 环境（Document PiP / window.open）无法真正置顶：pin 按钮是假状态机，
  // 单独构建隐藏 pin 的 HTML（审计低危项）。
  const webWindowHtml = buildFloatingWindowHtml({
    title,
    text,
    config: effectiveConfig,
    isDark,
    initialHtml,
    hostWebContentsId,
    baseUrl,
    pinControlDisabled: true
  });

  // 1. 方案一：在思源桌面端（Electron 环境），使用 @electron/remote.BrowserWindow
  //    创建无边框（frame: false）、真实透明（transparent: true）、全局置顶（alwaysOnTop: true）的原生顶层窗口
  //    彻底避免 siyuan-open-window 内部 windowNavigate 拦截导致的空白白屏
  if (remote?.BrowserWindow) {
    try {
      // 先建后关：旧窗口在新窗口就绪后才关闭；创建失败时不会丢失现有悬浮窗。
      const previousWindow = currentElectronWindow;

      const win = new remote.BrowserWindow({
        width: config.width || 420,
        height: config.height || 320,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: false,
        resizable: true,
        hasShadow: true,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          webSecurity: false
        }
      });

      if (typeof remote.enable === "function") {
        remote.enable(win.webContents);
      }

      // 挂载宿主代理对象供子窗口直接同步调用
      (win as any).__docAssistantHost = {
        close: () => {
          if (!win.isDestroyed()) {
            win.close();
          }
        },
        saveConfig: (patch: Partial<FloatingTextConfig>) => {
          return saveFloatingTextConfig(patch);
        },
        getConfig: () => {
          return loadFloatingTextConfig();
        },
        renderMarkdown: (md: string) => {
          return renderMarkdownToHtml(md);
        },
        setAlwaysOnTop: (pinned: boolean) => {
          if (!win.isDestroyed()) {
            win.setAlwaysOnTop(pinned);
            if (pinned) {
              win.moveTop?.();
              win.focus?.();
            }
          }
        },
        isAlwaysOnTop: () => {
          return !win.isDestroyed() && win.isAlwaysOnTop();
        },
        getPosition: (): [number, number] => {
          if (!win.isDestroyed()) {
            return win.getPosition();
          }
          return [0, 0];
        },
        setPosition: (x: number, y: number) => {
          if (!win.isDestroyed()) {
            win.setPosition(Math.round(x), Math.round(y));
          }
        },
        focus: () => {
          if (!win.isDestroyed()) {
            win.focus?.();
          }
        },
        minimizeAndPaste: (payload?: { isPinned?: boolean; delayMs?: number }) => {
          if (!win.isDestroyed()) {
            if (payload?.isPinned) {
              try {
                win.setAlwaysOnTop(true);
                win.blur?.();
              } catch (blurErr) {
                console.warn("[DocAssistant][FloatingText] win.blur error:", blurErr);
              }
              triggerSystemPaste(payload.delayMs ?? 260);
            } else {
              try {
                win.minimize?.();
              } catch (minErr) {
                console.warn("[DocAssistant][FloatingText] win.minimize error:", minErr);
              }
              triggerSystemPaste(payload?.delayMs ?? 180);
            }
          }
        }
      };

      // 监听来自置顶子窗口的 IPC 配置持久化、置顶切换与位置移动通知 (双通道监听保障可靠送达)
      const IPC_CHANNEL = "siyuan-doc-assist-save-floating-config";
      const IPC_PIN_CHANNEL = "siyuan-doc-assist-set-always-on-top";
      const IPC_MOVE_CHANNEL = "siyuan-doc-assist-move-window";
      const IPC_PASTE_CHANNEL = "siyuan-doc-assist-minimize-and-paste";
      const IPC_CLOSE_CHANNEL = "siyuan-doc-assist-close-window";
      try {
        const electron = (window as any).require?.("electron");
        if (electron?.ipcRenderer) {
          electron.ipcRenderer.removeAllListeners(IPC_CHANNEL);
          electron.ipcRenderer.on(IPC_CHANNEL, (_event: any, patch: Partial<FloatingTextConfig>) => {
            if (patch && typeof patch === "object") {
              saveFloatingTextConfig(patch);
            }
          });
          electron.ipcRenderer.removeAllListeners(IPC_PIN_CHANNEL);
          electron.ipcRenderer.on(IPC_PIN_CHANNEL, (_event: any, pinned: any) => {
            if (currentElectronWindow && !currentElectronWindow.isDestroyed()) {
              currentElectronWindow.setAlwaysOnTop(Boolean(pinned));
              if (pinned) {
                currentElectronWindow.moveTop?.();
                currentElectronWindow.focus?.();
              }
            }
          });
          electron.ipcRenderer.removeAllListeners(IPC_MOVE_CHANNEL);
          electron.ipcRenderer.on(IPC_MOVE_CHANNEL, (_event: any, pos: { x: number; y: number }) => {
            if (currentElectronWindow && !currentElectronWindow.isDestroyed() && pos && typeof pos.x === "number") {
              currentElectronWindow.setPosition(Math.round(pos.x), Math.round(pos.y));
            }
          });
          electron.ipcRenderer.removeAllListeners(IPC_PASTE_CHANNEL);
          electron.ipcRenderer.on(IPC_PASTE_CHANNEL, (_event: any, payload?: { isPinned?: boolean; delayMs?: number }) => {
            if (currentElectronWindow && !currentElectronWindow.isDestroyed()) {
              if (payload?.isPinned) {
                try {
                  currentElectronWindow.setAlwaysOnTop(true);
                  currentElectronWindow.blur?.();
                } catch {}
                triggerSystemPaste(payload.delayMs ?? 260);
              } else {
                try {
                  currentElectronWindow.minimize?.();
                } catch {}
                triggerSystemPaste(payload?.delayMs ?? 180);
              }
            }
          });
          electron.ipcRenderer.removeAllListeners(IPC_CLOSE_CHANNEL);
          electron.ipcRenderer.on(IPC_CLOSE_CHANNEL, () => {
            if (currentElectronWindow && !currentElectronWindow.isDestroyed()) {
              currentElectronWindow.close();
            }
          });
        }
      } catch (ipcBindErr) {
        console.warn("[DocAssistant][FloatingText] ipcRenderer bind warning:", ipcBindErr);
      }

      if (win.webContents?.on) {
        win.webContents.on("ipc-message", (_event: any, channel: string, payload: any) => {
          if (channel === IPC_CHANNEL && payload && typeof payload === "object") {
            saveFloatingTextConfig(payload);
          } else if (channel === IPC_PIN_CHANNEL) {
            if (!win.isDestroyed()) {
              win.setAlwaysOnTop(Boolean(payload));
              if (payload) {
                win.moveTop?.();
                win.focus?.();
              }
            }
          } else if (channel === IPC_MOVE_CHANNEL && payload && typeof payload.x === "number") {
            if (!win.isDestroyed()) {
              win.setPosition(Math.round(payload.x), Math.round(payload.y));
            }
          } else if (channel === IPC_PASTE_CHANNEL) {
            if (!win.isDestroyed()) {
              if (payload?.isPinned) {
                try {
                  win.setAlwaysOnTop(true);
                  win.blur?.();
                } catch {}
                triggerSystemPaste(payload?.delayMs ?? 260);
              } else {
                try {
                  win.minimize?.();
                } catch {}
                triggerSystemPaste(payload?.delayMs ?? 180);
              }
            }
          } else if (channel === IPC_CLOSE_CHANNEL) {
            if (!win.isDestroyed()) {
              win.close();
            }
          }
        });
      }

      // 监听原生窗口 resize 与 close 事件，自动持久化尺寸（若开启记忆尺寸）
      let resizeTimer: any = null;
      win.on("resize", () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (!win.isDestroyed()) {
            const [w, h] = win.getSize();
            const cur = loadFloatingTextConfig();
            if (cur.rememberSize) {
              saveFloatingTextConfig({ width: w, height: h });
            }
          }
        }, 300);
      });

      win.on("close", () => {
        if (!win.isDestroyed()) {
          const [w, h] = win.getSize();
          const cur = loadFloatingTextConfig();
          if (cur.rememberSize) {
            saveFloatingTextConfig({ width: w, height: h });
          }
        }
      });

      currentElectronWindow = win;

      const closePreviousWindow = () => {
        if (
          previousWindow &&
          previousWindow !== win &&
          typeof previousWindow.isDestroyed === "function" &&
          !previousWindow.isDestroyed()
        ) {
          try {
            previousWindow.close();
          } catch {}
        }
      };

      // 优先通过本地临时 HTML 文件加载，彻底消除长文档 data URL 超限崩溃
      const tempPath = writeFloatingHtmlToTempFile(html);
      let loaded = false;
      if (tempPath) {
        try {
          if (typeof win.loadFile === "function") {
            win.loadFile(tempPath).catch((loadErr: unknown) => {
              console.warn("[DocAssistant][FloatingText] loadFile rejected:", loadErr);
            });
            loaded = true;
          } else {
            const fileUrl = `file:///${tempPath.replace(/\\/g, "/")}`;
            win.loadURL(fileUrl);
            loaded = true;
          }
        } catch (loadErr) {
          console.warn("[DocAssistant][FloatingText] loadFile failed, fallback to data URL:", loadErr);
        }
      }
      if (!loaded) {
        win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      }

      win.once("ready-to-show", () => {
        if (!win.isDestroyed()) {
          win.show();
          win.focus();
        }
        closePreviousWindow();
      });
      setTimeout(() => {
        if (!win.isDestroyed()) {
          win.show();
          win.focus();
        }
        closePreviousWindow();
      }, 60);
      return;
    } catch (remoteErr) {
      console.warn("[DocAssistant][FloatingText] remote.BrowserWindow failed:", remoteErr);
    }
  }

  // 2. 方案二：在现代标准浏览器中（Web 端 Chrome/Edge），使用 Document Picture-in-Picture API
  if (isDocPipSupported()) {
    try {
      closeWebFallbackWindows(currentPipWindow, currentPopupWindow);

      const pipWindow = await (window as any).documentPictureInPicture.requestWindow({
        width: config.width || 420,
        height: config.height || 320
      });

      currentPipWindow = pipWindow;
      currentPopupWindow = null;

      // 写入完整 HTML
      pipWindow.document.open();
      pipWindow.document.write(webWindowHtml);
      pipWindow.document.close();

      // 挂载交互事件
      bindPipWindowEvents(pipWindow, text, effectiveConfig);
      return;
    } catch (error) {
      console.warn("[DocAssistant][FloatingText] PiP request failed, falling back:", error);
    }
  }

  // 3. 方案三：在普通 Web 浏览器环境中，尝试标准 window.open 弹出窗口
  if (typeof window !== "undefined" && typeof window.open === "function") {
    try {
      closeWebFallbackWindows(currentPopupWindow, currentPipWindow);

      const popup = window.open(
        "",
        "siyuan-doc-assist-floating",
        `width=${effectiveConfig.width || 420},height=${effectiveConfig.height || 320},menubar=no,toolbar=no,location=no,status=no`
      );
      if (popup) {
        currentPopupWindow = popup;
        currentPipWindow = null;
        popup.document.open();
        popup.document.write(webWindowHtml);
        popup.document.close();
        popup.focus();
        bindPipWindowEvents(popup, text, effectiveConfig);
        return;
      }
    } catch (openErr) {
      console.warn("[DocAssistant][FloatingText] window.open failed:", openErr);
    }
  }

  // 4. 降级方案：受限环境（如移动端）下使用思源内置 Dialog 浮窗
  openInAppFloatingFallback(title, text, config, isDark);
}
