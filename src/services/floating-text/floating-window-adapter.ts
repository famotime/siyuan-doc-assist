import {
  calculateSteppedFontSize,
  FloatingTextConfig,
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
  const initialHtml = renderMarkdownToHtml(text);

  const html = buildFloatingWindowHtml({
    title,
    text,
    config,
    isDark,
    initialHtml,
  });

  // 1. 方案一：在思源桌面端（Electron 环境），使用 @electron/remote.BrowserWindow
  //    创建无边框（frame: false）、真实透明（transparent: true）、全局置顶（alwaysOnTop: true）的原生顶层窗口
  //    彻底避免 siyuan-open-window 内部 windowNavigate 拦截导致的空白白屏
  const remote = getElectronRemote();
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
      bindPipWindowEvents(pipWindow, text, config);
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
        `width=${config.width || 420},height=${config.height || 320},menubar=no,toolbar=no,location=no,status=no`
      );
      if (popup) {
        popup.document.open();
        popup.document.write(html);
        popup.document.close();
        popup.focus();
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
  const drawerEl = doc.getElementById("ft-drawer");
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
  }

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
      showToast(isPartial ? "已复制选中内容" : "已复制全部内容");
    } else {
      showToast("复制失败");
    }
  };

  // 1. Esc 快捷键关闭 & Ctrl + C 复制 & Ctrl + 滚轮缩放字号
  doc.addEventListener("keydown", async (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      pipWindow.close();
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
    currentViewMode = currentViewMode === "text" ? "markdown" : "text";
    if (viewBtn) {
      viewBtn.textContent = currentViewMode === "markdown" ? "MD" : "纯文本";
    }
    if (currentViewMode === "markdown") {
      if (mdViewEl) {
        mdViewEl.innerHTML = renderMarkdownToHtml(getCurrentText());
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
  });

  // 5. 设置抽屉折叠
  settingsBtn?.addEventListener("click", () => {
    drawerEl?.classList.toggle("ft-drawer-open");
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
  const initialHtml = renderMarkdownToHtml(text);
  const dialogHtml = buildFloatingWindowHtml({
    title,
    text,
    config,
    isDark,
    initialHtml,
  });

  new Dialog({
    title: `📌 ${title}`,
    content: `<div style="height: 100%; min-height: 260px;">${dialogHtml}</div>`,
    width: `${config.width}px`,
    height: `${config.height}px`,
    transparent: true,
  });

  showMessage("当前环境已在应用内打开悬浮窗", 3000, "info");
}
