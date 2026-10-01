import {
  calculateSteppedFontSize,
  FloatingTextConfig,
  hasImageMarkdown,
  resolveFloatingCopyText,
} from "@/core/floating-text-core";
import { renderMarkdownToHtml } from "@/core/markdown-render-core";
import {
  buildFloatingWindowHtml,
} from "@/ui/floating-text/floating-window-template";
import {
  loadFloatingTextConfig,
  saveFloatingTextConfig,
} from "@/services/floating-text/floating-text-storage";
import { triggerSystemPaste } from "@/services/floating-text/floating-paste-helper";
import { Dialog, showMessage } from "siyuan";

let currentPipWindow: Window | null = null;

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
    } catch {}
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
  const effectiveConfig: FloatingTextConfig = hasImage
    ? { ...config, viewMode: "markdown" }
    : config;
  const initialHtml = renderMarkdownToHtml(text);
  const baseUrl =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";

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
    baseUrl,
  });

  // 1. 方案一：在思源桌面端（Electron 环境），使用 @electron/remote.BrowserWindow
  //    创建无边框（frame: false）、真实透明（transparent: true）、全局置顶（alwaysOnTop: true）的原生顶层窗口
  //    彻底避免 siyuan-open-window 内部 windowNavigate 拦截导致的空白白屏
  if (remote?.BrowserWindow) {
    try {
      if (currentElectronWindow && !currentElectronWindow.isDestroyed()) {
        currentElectronWindow.close();
      }

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
          webSecurity: false,
        },
      });

      if (typeof remote.enable === "function") {
        remote.enable(win.webContents);
      }

      // 挂载宿主代理对象供子窗口直接同步调用
      (win as any).__docAssistantHost = {
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
        },
      };

      // 监听来自置顶子窗口的 IPC 配置持久化、置顶切换与位置移动通知 (双通道监听保障可靠送达)
      const IPC_CHANNEL = "siyuan-doc-assist-save-floating-config";
      const IPC_PIN_CHANNEL = "siyuan-doc-assist-set-always-on-top";
      const IPC_MOVE_CHANNEL = "siyuan-doc-assist-move-window";
      const IPC_PASTE_CHANNEL = "siyuan-doc-assist-minimize-and-paste";
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
                } catch (e) {}
                triggerSystemPaste(payload.delayMs ?? 260);
              } else {
                try {
                  currentElectronWindow.minimize?.();
                } catch (minErr) {}
                triggerSystemPaste(payload?.delayMs ?? 180);
              }
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
                } catch (e) {}
                triggerSystemPaste(payload?.delayMs ?? 260);
              } else {
                try {
                  win.minimize?.();
                } catch (minErr) {}
                triggerSystemPaste(payload?.delayMs ?? 180);
              }
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

      // 使用 data URL 直接在内存中加载自包含的完整 HTML，不依赖任何 HTTP 路由或鉴权
      win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
      win.once("ready-to-show", () => {
        if (!win.isDestroyed()) {
          win.show();
          win.focus();
        }
      });
      setTimeout(() => {
        if (!win.isDestroyed()) {
          win.show();
          win.focus();
        }
      }, 60);
      return;
    } catch (remoteErr) {
      console.warn("[DocAssistant][FloatingText] remote.BrowserWindow failed:", remoteErr);
    }
  }

  // 2. 方案二：在现代标准浏览器中（Web 端 Chrome/Edge），使用 Document Picture-in-Picture API
  if (isDocPipSupported()) {
    try {
      if (currentPipWindow && !currentPipWindow.closed) {
        currentPipWindow.close();
      }

      const pipWindow = await (window as any).documentPictureInPicture.requestWindow({
        width: config.width || 420,
        height: config.height || 320,
      });

      currentPipWindow = pipWindow;

      // 写入完整 HTML
      pipWindow.document.open();
      pipWindow.document.write(html);
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
      const popup = window.open(
        "",
        "siyuan-doc-assist-floating",
        `width=${effectiveConfig.width || 420},height=${effectiveConfig.height || 320},menubar=no,toolbar=no,location=no,status=no`
      );
      if (popup) {
        popup.document.open();
        popup.document.write(html);
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

function bindPipWindowEvents(
  pipWindow: Window,
  text: string,
  initialConfig: FloatingTextConfig
) {
  const doc = pipWindow.document;
  const appEl = doc.getElementById("ft-app");
  const popoverEl = doc.getElementById("ft-popover");
  const textViewEl = doc.getElementById("ft-text-view");
  const mdViewEl = doc.getElementById("ft-markdown-view");
  const viewBtn = doc.getElementById("ft-btn-view");
  const pinBtn = doc.getElementById("ft-btn-pin");
  const pinIconUse = pinBtn?.querySelector("use");
  const pinTooltip = doc.getElementById("ft-pin-tooltip");
  const copyBtn = doc.getElementById("ft-btn-copy");
  const settingsBtn = doc.getElementById("ft-btn-settings");
  const closeBtn = doc.getElementById("ft-btn-close");
  const slider = doc.getElementById("ft-opacity-slider") as HTMLInputElement | null;
  const opacityLabel = doc.getElementById("ft-opacity-label");
  const fontLabel = doc.getElementById("ft-font-label");
  const fontIncBtn = doc.getElementById("ft-font-inc");
  const fontDecBtn = doc.getElementById("ft-font-dec");
  const wordCountEl = doc.getElementById("ft-word-count");
  const toast = doc.getElementById("ft-toast");

  let currentFontSize = initialConfig.fontSize;
  let currentViewMode = initialConfig.viewMode;
  let isPinned = true;

  const updatePinUI = () => {
    if (pinBtn) {
      if (isPinned) {
        pinBtn.classList.add("ft-btn-active", "ft-btn-pinned");
        pinBtn.setAttribute("aria-label", "取消置顶");
      } else {
        pinBtn.classList.remove("ft-btn-active", "ft-btn-pinned");
        pinBtn.setAttribute("aria-label", "恢复置顶");
      }
    }
    if (pinIconUse) {
      pinIconUse.setAttribute("href", isPinned ? "#ft-icon-pin" : "#ft-icon-pin-off");
    }
    if (pinTooltip) {
      pinTooltip.innerHTML = `${isPinned ? "取消置顶" : "恢复置顶"} <kbd>Alt+P</kbd>`;
    }
  };

  const togglePin = () => {
    isPinned = !isPinned;
    updatePinUI();
    showToast(isPinned ? "已恢复置顶" : "已取消置顶");
  };

  const showToast = (msg: string) => {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("ft-toast-show");
    pipWindow.setTimeout(() => {
      toast.classList.remove("ft-toast-show");
    }, 1500);
  };

  const updateWordCount = () => {
    if (!wordCountEl) return;
    const cur = getCurrentText();
    const len = cur ? cur.trim().replace(/\s+/g, "").length : 0;
    if (len > 0) {
      wordCountEl.textContent = `${len} 字`;
      wordCountEl.style.display = "inline-block";
    } else {
      wordCountEl.textContent = "";
      wordCountEl.style.display = "none";
    }
  };

  let copyFeedbackTimer: any = null;
  const triggerCopyFeedback = (isPartial: boolean) => {
    if (!copyBtn) return;
    copyBtn.classList.add("ft-btn-success");
    const copyIconUse = copyBtn.querySelector("use");
    if (copyIconUse) copyIconUse.setAttribute("href", "#ft-icon-check");
    const copyTooltip = doc.getElementById("ft-copy-tooltip");
    if (copyTooltip) {
      copyTooltip.innerHTML = `${isPartial ? "已复制选中内容" : "已复制全部内容"} ✓`;
    }
    if (copyFeedbackTimer) pipWindow.clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = pipWindow.setTimeout(() => {
      copyBtn.classList.remove("ft-btn-success");
      if (copyIconUse) copyIconUse.setAttribute("href", "#ft-icon-copy");
      if (copyTooltip) {
        copyTooltip.innerHTML = '复制全部内容 <kbd>Ctrl+C</kbd>';
      }
    }, 1500);
  };

  const updateFontSize = (newSize: number) => {
    currentFontSize = newSize;
    if (appEl) {
      appEl.style.setProperty("--ft-font-size", `${newSize}px`);
    }
    if (fontLabel) {
      fontLabel.textContent = `${newSize}px`;
    }
    saveFloatingTextConfig({ fontSize: newSize });
  };

  const updateOpacity = (newOpacity: number) => {
    if (appEl) {
      appEl.style.setProperty("--ft-opacity", `${newOpacity}`);
    }
    if (opacityLabel) {
      opacityLabel.textContent = `${Math.round(newOpacity * 100)}%`;
    }
    saveFloatingTextConfig({ opacity: newOpacity });
  };

  if (textViewEl) {
    try {
      textViewEl.setAttribute("contenteditable", "plaintext-only");
    } catch {
      textViewEl.setAttribute("contenteditable", "true");
    }
    textViewEl.setAttribute("spellcheck", "false");
    textViewEl.setAttribute("data-placeholder", "在此处编辑文本...");
    textViewEl.addEventListener("input", updateWordCount);
  }

  const ensureImageSources = (container: HTMLElement | null) => {
    if (!container) return;
    try {
      const imgs = container.querySelectorAll("img");
      imgs.forEach((img) => {
        if (!img.getAttribute("src") && img.getAttribute("data-src")) {
          img.setAttribute("src", img.getAttribute("data-src") || "");
        }
      });
    } catch {}
  };

  ensureImageSources(mdViewEl);
  updateWordCount();

  mdViewEl?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    if (target && target.tagName === "IMG") {
      target.classList.toggle("ft-img-expanded");
    }
  });

  const getCurrentText = (): string => {
    if (!textViewEl) return text;
    const val = textViewEl.innerText;
    if (typeof val === "string") return val;
    return textViewEl.textContent ?? "";
  };

  function getSelectedText(): string {
    try {
      const sel = pipWindow.getSelection ? pipWindow.getSelection() : null;
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        return "";
      }
      return sel.toString();
    } catch {
      return "";
    }
  }

  const performCopy = async (targetText: string, isPartial: boolean) => {
    let copied = false;
    try {
      if (pipWindow.navigator?.clipboard?.writeText) {
        await pipWindow.navigator.clipboard.writeText(targetText);
        copied = true;
      }
    } catch {
      // 画中画窗口可能没有剪贴板焦点或权限，尝试降级
    }

    if (!copied) {
      try {
        if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(targetText);
          copied = true;
        }
      } catch {
        // 尝试 execCommand 降级
      }
    }

    if (!copied) {
      try {
        const ta = pipWindow.document.createElement("textarea");
        ta.value = targetText;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        ta.style.opacity = "0";
        pipWindow.document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copied = Boolean(pipWindow.document.execCommand("copy"));
        pipWindow.document.body.removeChild(ta);
      } catch {
        copied = false;
      }
    }

    if (copied) {
      triggerCopyFeedback(isPartial);
    } else {
      showToast("复制失败");
    }
  };

  const toggleViewMode = () => {
    currentViewMode = currentViewMode === "text" ? "markdown" : "text";
    const viewIconUse = viewBtn?.querySelector("use");
    const viewTooltip = doc.getElementById("ft-view-tooltip");
    if (viewIconUse) {
      viewIconUse.setAttribute(
        "href",
        currentViewMode === "markdown" ? "#ft-icon-text" : "#ft-icon-preview"
      );
    }
    if (viewTooltip) {
      viewTooltip.innerHTML = `${
        currentViewMode === "markdown" ? "切换源码编辑" : "切换 Markdown 预览"
      } <kbd>Ctrl+M</kbd>`;
    }
    if (currentViewMode === "markdown") {
      if (mdViewEl) {
        mdViewEl.innerHTML = renderMarkdownToHtml(getCurrentText());
        ensureImageSources(mdViewEl);
      }
      if (textViewEl) {
        textViewEl.style.display = "none";
      }
      if (mdViewEl) {
        mdViewEl.style.display = "block";
      }
    } else {
      if (textViewEl) {
        textViewEl.style.display = "block";
        textViewEl.focus();
      }
      if (mdViewEl) {
        mdViewEl.style.display = "none";
      }
    }
    saveFloatingTextConfig({ viewMode: currentViewMode });
  };

  const closePopover = () => {
    popoverEl?.classList.remove("ft-popover-open");
    settingsBtn?.classList.remove("ft-btn-active");
  };

  doc.addEventListener("click", (e) => {
    if (!popoverEl || !popoverEl.classList.contains("ft-popover-open")) return;
    const target = e.target as Node;
    if (!popoverEl.contains(target) && (!settingsBtn || !settingsBtn.contains(target))) {
      closePopover();
    }
  });

  // 1. Esc 快捷键关闭 & Ctrl + C 复制 & Ctrl + M 切换视图 & Ctrl + 滚轮缩放字号
  doc.addEventListener("keydown", async (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (popoverEl && popoverEl.classList.contains("ft-popover-open")) {
        closePopover();
        return;
      }
      pipWindow.close();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "m" || e.key === "M")) {
      e.preventDefault();
      toggleViewMode();
      return;
    }
    if ((e.altKey && (e.key === "p" || e.key === "P")) || ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "p" || e.key === "P"))) {
      e.preventDefault();
      togglePin();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
      const selected = getSelectedText();
      if (selected && selected.trim().length > 0) {
        e.preventDefault();
        await performCopy(selected, true);
      }
    }
  });

  doc.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const direction = e.deltaY < 0 ? "up" : "down";
        const nextSize = calculateSteppedFontSize(currentFontSize, direction, 1);
        updateFontSize(nextSize);
      }
    },
    { passive: false }
  );

  // 2. 关闭按钮
  closeBtn?.addEventListener("click", () => {
    pipWindow.close();
  });

  // 3. 复制按钮
  copyBtn?.addEventListener("mousedown", (e) => {
    e.preventDefault();
  });

  copyBtn?.addEventListener("click", async () => {
    const { text: targetText, isSelected } = resolveFloatingCopyText(
      getSelectedText(),
      getCurrentText()
    );
    await performCopy(targetText, isSelected);
  });

  // 4. 置顶切换
  pinBtn?.addEventListener("click", () => {
    togglePin();
  });

  // 5. 视图切换（纯文本 / Markdown）
  viewBtn?.addEventListener("click", () => {
    toggleViewMode();
  });

  // 5. 外观 Popover 折叠
  settingsBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    popoverEl?.classList.toggle("ft-popover-open");
    settingsBtn.classList.toggle("ft-btn-active");
  });

  // 6. 不透明度滑块
  slider?.addEventListener("input", () => {
    const val = parseInt(slider.value, 10);
    const op = val / 100;
    if (appEl) {
      appEl.style.setProperty("--ft-opacity", `${op}`);
    }
    if (opacityLabel) {
      opacityLabel.textContent = `${val}%`;
    }
  });

  slider?.addEventListener("change", () => {
    const val = parseInt(slider.value, 10);
    updateOpacity(val / 100);
  });

  // 7. 字号按钮
  fontIncBtn?.addEventListener("click", () => {
    updateFontSize(calculateSteppedFontSize(currentFontSize, "up", 1));
  });

  fontDecBtn?.addEventListener("click", () => {
    updateFontSize(calculateSteppedFontSize(currentFontSize, "down", 1));
  });

  // 8. 窗口尺寸记忆
  let resizeTimer: number | null = null;
  pipWindow.addEventListener("resize", () => {
    if (resizeTimer) {
      pipWindow.clearTimeout(resizeTimer);
    }
    resizeTimer = pipWindow.setTimeout(() => {
      const cur = loadFloatingTextConfig();
      if (cur.rememberSize) {
        saveFloatingTextConfig({
          width: pipWindow.innerWidth,
          height: pipWindow.innerHeight,
        });
      }
    }, 400);
  });

  // 9. 标题栏鼠标拖拽增强 (针对 PiP / window.open 浏览器环境)
  const headerEl = doc.querySelector(".ft-header") as HTMLElement | null;
  const actionsEl = doc.querySelector(".ft-actions") as HTMLElement | null;
  if (headerEl) {
    let isDragging = false;
    let startMouseX = 0;
    let startMouseY = 0;
    let startWinX = 0;
    let startWinY = 0;
    let hasMoved = false;

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.screenX - startMouseX;
      const dy = e.screenY - startMouseY;
      if (!hasMoved && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
        hasMoved = true;
        appEl?.classList.add("is-dragging");
      }
      if (hasMoved && typeof pipWindow.moveTo === "function") {
        try {
          pipWindow.moveTo(Math.round(startWinX + dx), Math.round(startWinY + dy));
        } catch {}
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!isDragging) return;
      isDragging = false;
      doc.removeEventListener("mousemove", onMouseMove, true);
      doc.removeEventListener("mouseup", onMouseUp, true);
      appEl?.classList.remove("is-dragging");
      if (hasMoved) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    headerEl.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (actionsEl && actionsEl.contains(e.target as Node)) return;
      try {
        pipWindow.focus?.();
      } catch {}
      isDragging = true;
      hasMoved = false;
      startMouseX = e.screenX;
      startMouseY = e.screenY;
      startWinX = typeof pipWindow.screenX === "number" ? pipWindow.screenX : 0;
      startWinY = typeof pipWindow.screenY === "number" ? pipWindow.screenY : 0;
      doc.addEventListener("mousemove", onMouseMove, true);
      doc.addEventListener("mouseup", onMouseUp, true);
    });
  }
}

function openInAppFloatingFallback(
  title: string,
  text: string,
  config: FloatingTextConfig,
  isDark: boolean
) {
  const hasImage = hasImageMarkdown(text);
  const effectiveConfig: FloatingTextConfig = hasImage
    ? { ...config, viewMode: "markdown" }
    : config;
  const initialHtml = renderMarkdownToHtml(text);
  const baseUrl =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";
  const dialogHtml = buildFloatingWindowHtml({
    title,
    text,
    config: effectiveConfig,
    isDark,
    initialHtml,
    baseUrl,
  });

  const dialog = new Dialog({
    title: `📌 ${title}`,
    content: `<div class="doc-assistant-floating-dialog-wrapper" style="height: 100%; min-height: 260px;">${dialogHtml}</div>`,
    width: `${effectiveConfig.width}px`,
    height: `${effectiveConfig.height}px`,
    transparent: true,
  });

  // 支持通过拖动内层标题栏联动拖拽思源 Dialog 容器
  const dialogEl = dialog.element;
  const dialogContainer = dialogEl?.querySelector(".b3-dialog__container") as HTMLElement | null;
  const innerHeader = dialogEl?.querySelector(".ft-header") as HTMLElement | null;
  const innerActions = dialogEl?.querySelector(".ft-actions") as HTMLElement | null;
  if (dialogContainer && innerHeader) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initLeft = 0;
    let initTop = 0;
    let hasMoved = false;

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!hasMoved && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
        hasMoved = true;
      }
      if (hasMoved) {
        dialogContainer.style.left = `${initLeft + dx}px`;
        dialogContainer.style.top = `${initTop + dy}px`;
        dialogContainer.style.position = "absolute";
        dialogContainer.style.transform = "none";
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!isDragging) return;
      isDragging = false;
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mouseup", onMouseUp, true);
      if (hasMoved) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    innerHeader.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (innerActions && innerActions.contains(e.target as Node)) return;
      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = dialogContainer.getBoundingClientRect();
      initLeft = rect.left;
      initTop = rect.top;
      document.addEventListener("mousemove", onMouseMove, true);
      document.addEventListener("mouseup", onMouseUp, true);
    });
  }

  showMessage("当前环境已在应用内打开悬浮窗", 3000, "info");
}
