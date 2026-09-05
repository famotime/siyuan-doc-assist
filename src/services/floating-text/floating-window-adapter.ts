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
      };

      // 监听来自置顶子窗口的 IPC 配置持久化通知 (双通道监听保障可靠送达)
      const IPC_CHANNEL = "siyuan-doc-assist-save-floating-config";
      try {
        const electron = (window as any).require?.("electron");
        if (electron?.ipcRenderer) {
          electron.ipcRenderer.removeAllListeners(IPC_CHANNEL);
          electron.ipcRenderer.on(IPC_CHANNEL, (_event: any, patch: Partial<FloatingTextConfig>) => {
            if (patch && typeof patch === "object") {
              saveFloatingTextConfig(patch);
            }
          });
        }
      } catch (ipcBindErr) {
        console.warn("[DocAssistant][FloatingText] ipcRenderer bind warning:", ipcBindErr);
      }

      if (win.webContents?.on) {
        win.webContents.on("ipc-message", (_event: any, channel: string, patch: any) => {
          if (channel === IPC_CHANNEL && patch && typeof patch === "object") {
            saveFloatingTextConfig(patch);
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
    return textViewEl?.innerText || textViewEl?.textContent || text;
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

  // 4. 视图切换（纯文本 / Markdown）
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

  new Dialog({
    title: `📌 ${title}`,
    content: `<div style="height: 100%; min-height: 260px;">${dialogHtml}</div>`,
    width: `${effectiveConfig.width}px`,
    height: `${effectiveConfig.height}px`,
    transparent: true,
  });

  showMessage("当前环境已在应用内打开悬浮窗", 3000, "info");
}
