import {
  escapeHtml,
  FloatingTextConfig,
  simpleMarkdownToHtml,
} from "@/core/floating-text-core";

export function getFloatingWindowStyles(): string {
  return `
    :root {
      --ft-font-size: 15px;
      --ft-opacity: 0.85;
      --ft-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --ft-bg-color: 255, 255, 255;
      --ft-text-color: #222222;
      --ft-border-color: rgba(0, 0, 0, 0.12);
      --ft-header-bg: rgba(0, 0, 0, 0.05);
      --ft-button-hover: rgba(0, 0, 0, 0.08);
      --ft-code-bg: rgba(0, 0, 0, 0.06);
    }

    [data-theme="dark"] {
      --ft-bg-color: 30, 32, 36;
      --ft-text-color: #e0e0e0;
      --ft-border-color: rgba(255, 255, 255, 0.14);
      --ft-header-bg: rgba(255, 255, 255, 0.06);
      --ft-button-hover: rgba(255, 255, 255, 0.12);
      --ft-code-bg: rgba(255, 255, 255, 0.08);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: transparent !important;
      font-family: var(--ft-font-family);
      color: var(--ft-text-color);
      user-select: text;
    }

    #ft-app {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      background: rgba(var(--ft-bg-color), var(--ft-opacity));
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid var(--ft-border-color);
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.28);
      transition: background 0.15s ease;
    }

    /* 顶部操作条 */
    .ft-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 36px;
      padding: 0 10px;
      background: var(--ft-header-bg);
      border-bottom: 1px solid var(--ft-border-color);
      user-select: none;
      flex-shrink: 0;
      -webkit-app-region: drag;
    }

    .ft-title-area {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 12px;
      font-weight: 600;
      opacity: 0.9;
    }

    .ft-pin-icon {
      font-size: 13px;
      opacity: 0.85;
    }

    .ft-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
      -webkit-app-region: no-drag;
    }

    .ft-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 24px;
      padding: 0 6px;
      border: none;
      background: transparent;
      color: var(--ft-text-color);
      font-size: 12px;
      border-radius: 4px;
      cursor: pointer;
      opacity: 0.75;
      transition: opacity 0.15s, background 0.15s;
    }

    .ft-btn:hover {
      opacity: 1;
      background: var(--ft-button-hover);
    }

    .ft-btn.ft-btn-active {
      opacity: 1;
      font-weight: bold;
      background: var(--ft-button-hover);
    }

    /* 快捷抽屉设置条 */
    .ft-drawer {
      display: none;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      background: var(--ft-header-bg);
      border-bottom: 1px solid var(--ft-border-color);
      font-size: 12px;
      flex-shrink: 0;
      -webkit-app-region: no-drag;
    }

    .ft-drawer.ft-drawer-open {
      display: flex;
    }

    .ft-drawer-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .ft-slider {
      width: 80px;
      cursor: pointer;
      accent-color: #1890ff;
    }

    /* 主内容展示区 */
    .ft-body {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px 14px;
      font-size: var(--ft-font-size);
      line-height: 1.6;
      word-break: break-word;
      -webkit-app-region: no-drag;
    }

    .ft-body::-webkit-scrollbar {
      width: 6px;
    }
    .ft-body::-webkit-scrollbar-thumb {
      background: rgba(128, 128, 128, 0.35);
      border-radius: 3px;
    }
    .ft-body::-webkit-scrollbar-thumb:hover {
      background: rgba(128, 128, 128, 0.6);
    }

    /* 纯文本视图 */
    .ft-text-view {
      white-space: pre-wrap;
      word-break: break-word;
      outline: none;
    }

    /* Markdown 视图 */
    .ft-markdown-view {
      display: none;
    }

    .ft-markdown-view h1, .ft-h1 { font-size: 1.4em; font-weight: bold; margin: 0.6em 0 0.3em; }
    .ft-markdown-view h2, .ft-h2 { font-size: 1.25em; font-weight: bold; margin: 0.5em 0 0.3em; }
    .ft-markdown-view h3, .ft-h3 { font-size: 1.1em; font-weight: bold; margin: 0.4em 0 0.2em; }
    .ft-markdown-view p, .ft-p { margin-bottom: 0.5em; }
    .ft-markdown-view strong { font-weight: bold; }
    .ft-markdown-view em { font-style: italic; }
    .ft-markdown-view blockquote, .ft-blockquote {
      border-left: 3px solid rgba(128, 128, 128, 0.5);
      padding-left: 8px;
      margin: 0.5em 0;
      opacity: 0.85;
    }
    .ft-markdown-view ul, .ft-markdown-view ol {
      padding-left: 20px;
      margin-bottom: 0.5em;
    }
    .ft-markdown-view li, .ft-list-item { margin-bottom: 0.25em; }
    .ft-code-block {
      background: var(--ft-code-bg);
      border-radius: 4px;
      padding: 8px 10px;
      margin: 0.5em 0;
      font-family: monospace;
      font-size: 0.9em;
      overflow-x: auto;
    }
    .ft-inline-code {
      background: var(--ft-code-bg);
      padding: 1px 4px;
      border-radius: 3px;
      font-family: monospace;
      font-size: 0.9em;
    }
    .ft-todo-item {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 0.3em;
    }
    .ft-blank-line {
      height: 0.8em;
    }

    /* 快捷提示浮条 */
    .ft-toast {
      position: fixed;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.78);
      color: #fff;
      padding: 4px 12px;
      border-radius: 14px;
      font-size: 11px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s ease;
      z-index: 100;
    }
    .ft-toast.ft-toast-show {
      opacity: 1;
    }
  `;
}

export function buildFloatingWindowHtml(options: {
  title: string;
  text: string;
  config: FloatingTextConfig;
  isDark: boolean;
}): string {
  const { title, text, config, isDark } = options;
  const safeTitle = escapeHtml(title || "悬浮文本");
  const markdownHtml = simpleMarkdownToHtml(text);
  const themeAttr =
    config.themeMode === "dark"
      ? 'data-theme="dark"'
      : config.themeMode === "light"
      ? 'data-theme="light"'
      : isDark
      ? 'data-theme="dark"'
      : 'data-theme="light"';

  const fontFamStyle = config.fontFamily ? `font-family: ${escapeHtml(config.fontFamily)};` : "";

  return `
    <!DOCTYPE html>
    <html lang="zh-CN" ${themeAttr}>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${safeTitle}</title>
      <style>${getFloatingWindowStyles()}</style>
    </head>
    <body>
      <div id="ft-app" style="--ft-opacity: ${config.opacity}; --ft-font-size: ${config.fontSize}px; ${fontFamStyle}">
        <header class="ft-header">
          <div class="ft-title-area" title="${safeTitle}">
            <span class="ft-pin-icon">📌</span>
            <span id="ft-title-text">${safeTitle}</span>
          </div>
          <div class="ft-actions">
            <button id="ft-btn-view" class="ft-btn" title="切换纯文本 / Markdown 预览">
              ${config.viewMode === "markdown" ? "MD" : "纯文本"}
            </button>
            <button id="ft-btn-copy" class="ft-btn" title="复制文本">复制</button>
            <button id="ft-btn-settings" class="ft-btn" title="悬浮设置">⚙️</button>
            <button id="ft-btn-close" class="ft-btn" title="关闭 (Esc)">✕</button>
          </div>
        </header>

        <div id="ft-drawer" class="ft-drawer">
          <div class="ft-drawer-group">
            <span>透明度</span>
            <input type="range" id="ft-opacity-slider" class="ft-slider" min="10" max="100" value="${Math.round(config.opacity * 100)}" />
            <span id="ft-opacity-label">${Math.round(config.opacity * 100)}%</span>
          </div>
          <div class="ft-drawer-group">
            <span>字号</span>
            <button id="ft-font-dec" class="ft-btn" title="缩小字号 (Ctrl+滚轮下)">A-</button>
            <span id="ft-font-label">${config.fontSize}px</span>
            <button id="ft-font-inc" class="ft-btn" title="放大字号 (Ctrl+滚轮上)">A+</button>
          </div>
        </div>

        <main class="ft-body" id="ft-scroll-body">
          <div id="ft-text-view" class="ft-text-view" style="${config.viewMode === 'markdown' ? 'display:none;' : 'display:block;'}">${escapeHtml(text)}</div>
          <div id="ft-markdown-view" class="ft-markdown-view" style="${config.viewMode === 'markdown' ? 'display:block;' : 'display:none;'}">${markdownHtml}</div>
        </main>

        <div id="ft-toast" class="ft-toast">已复制</div>
      </div>

      <script>
        (function() {
          const originalText = ${JSON.stringify(text)};
          let currentFontSize = ${config.fontSize};
          let currentOpacity = ${config.opacity};
          let isMarkdown = ${config.viewMode === "markdown"};

          const appEl = document.getElementById("ft-app");
          const drawer = document.getElementById("ft-drawer");
          const textView = document.getElementById("ft-text-view");
          const mdView = document.getElementById("ft-markdown-view");
          const viewBtn = document.getElementById("ft-btn-view");
          const copyBtn = document.getElementById("ft-btn-copy");
          const settingsBtn = document.getElementById("ft-btn-settings");
          const closeBtn = document.getElementById("ft-btn-close");
          const slider = document.getElementById("ft-opacity-slider");
          const opacityLabel = document.getElementById("ft-opacity-label");
          const fontLabel = document.getElementById("ft-font-label");
          const fontIncBtn = document.getElementById("ft-font-inc");
          const fontDecBtn = document.getElementById("ft-font-dec");
          const toast = document.getElementById("ft-toast");

          let electronWin = null;
          try {
            const electron = window.require ? window.require("electron") : null;
            const remote = (window.require && window.require("@electron/remote")) || (electron && electron.remote);
            if (remote && remote.getCurrentWindow) {
              electronWin = remote.getCurrentWindow();
            }
          } catch (e) {}

          function saveConfig(patch) {
            try {
              const raw = localStorage.getItem("doc-assistant.floating-text.config");
              const cur = raw ? JSON.parse(raw) : {};
              const next = Object.assign({}, cur, patch);
              localStorage.setItem("doc-assistant.floating-text.config", JSON.stringify(next));
            } catch (e) {}
          }

          function showToast(msg) {
            if (!toast) return;
            toast.textContent = msg;
            toast.classList.add("ft-toast-show");
            setTimeout(function() {
              toast.classList.remove("ft-toast-show");
            }, 1500);
          }

          function updateFontSize(size) {
            size = Math.max(11, Math.min(42, size));
            currentFontSize = size;
            if (appEl) appEl.style.setProperty("--ft-font-size", size + "px");
            if (fontLabel) fontLabel.textContent = size + "px";
            saveConfig({ fontSize: size });
          }

          function updateOpacity(op) {
            currentOpacity = op;
            if (appEl) appEl.style.setProperty("--ft-opacity", String(op));
            if (opacityLabel) opacityLabel.textContent = Math.round(op * 100) + "%";
            saveConfig({ opacity: op });
          }

          document.addEventListener("keydown", function(e) {
            if (e.key === "Escape") {
              if (electronWin) electronWin.close();
              else window.close();
            }
          });

          document.addEventListener("wheel", function(e) {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              const delta = e.deltaY < 0 ? 1 : -1;
              updateFontSize(currentFontSize + delta);
            }
          }, { passive: false });

          if (closeBtn) {
            closeBtn.addEventListener("click", function() {
              if (electronWin) electronWin.close();
              else window.close();
            });
          }

          if (copyBtn) {
            copyBtn.addEventListener("click", function() {
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(originalText).then(function() {
                  showToast("已复制");
                }).catch(function() {
                  showToast("复制失败");
                });
              } else {
                showToast("剪贴板不可用");
              }
            });
          }

          if (viewBtn) {
            viewBtn.addEventListener("click", function() {
              isMarkdown = !isMarkdown;
              viewBtn.textContent = isMarkdown ? "MD" : "纯文本";
              if (textView) textView.style.display = isMarkdown ? "none" : "block";
              if (mdView) mdView.style.display = isMarkdown ? "block" : "none";
              saveConfig({ viewMode: isMarkdown ? "markdown" : "text" });
            });
          }

          if (settingsBtn && drawer) {
            settingsBtn.addEventListener("click", function() {
              drawer.classList.toggle("ft-drawer-open");
              settingsBtn.classList.toggle("ft-btn-active");
            });
          }

          if (slider) {
            slider.addEventListener("input", function() {
              const val = parseInt(slider.value, 10);
              const op = val / 100;
              if (appEl) appEl.style.setProperty("--ft-opacity", String(op));
              if (opacityLabel) opacityLabel.textContent = val + "%";
            });
            slider.addEventListener("change", function() {
              const val = parseInt(slider.value, 10);
              updateOpacity(val / 100);
            });
          }

          if (fontDecBtn) {
            fontDecBtn.addEventListener("click", function() {
              updateFontSize(currentFontSize - 1);
            });
          }
          if (fontIncBtn) {
            fontIncBtn.addEventListener("click", function() {
              updateFontSize(currentFontSize + 1);
            });
          }

          let resizeTimer = null;
          window.addEventListener("resize", function() {
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function() {
              saveConfig({
                width: window.innerWidth,
                height: window.innerHeight,
              });
            }, 400);
          });
        })();
      </script>
    </body>
    </html>
  `;
}
