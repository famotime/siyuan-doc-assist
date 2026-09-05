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

    /* 纯文本编辑视图 */
    .ft-text-view {
      white-space: pre-wrap;
      word-break: break-word;
      outline: none;
      min-height: 100%;
      cursor: text;
      caret-color: var(--ft-text-color);
    }

    .ft-text-view:empty::before {
      content: attr(data-placeholder);
      color: rgba(128, 128, 128, 0.55);
      pointer-events: none;
    }

    /* Markdown 视图 */
    .ft-markdown-view {
      display: none;
    }

    .ft-markdown-view h1, .ft-h1 { font-size: 1.4em; font-weight: bold; margin: 0.6em 0 0.3em; border-bottom: 1px solid var(--ft-border-color); padding-bottom: 0.2em; }
    .ft-markdown-view h2, .ft-h2 { font-size: 1.25em; font-weight: bold; margin: 0.5em 0 0.3em; }
    .ft-markdown-view h3, .ft-h3 { font-size: 1.1em; font-weight: bold; margin: 0.4em 0 0.2em; }
    .ft-markdown-view h4, .ft-h4 { font-size: 1.05em; font-weight: bold; margin: 0.3em 0 0.2em; }
    .ft-markdown-view p, .ft-p { margin-bottom: 0.5em; }
    .ft-markdown-view strong { font-weight: bold; }
    .ft-markdown-view em { font-style: italic; }
    .ft-markdown-view del { text-decoration: line-through; opacity: 0.75; }
    .ft-markdown-view hr { border: none; border-top: 1px solid var(--ft-border-color); margin: 0.8em 0; }
    .ft-markdown-view a { color: #1890ff; text-decoration: underline; word-break: break-all; }

    .ft-markdown-view blockquote, .ft-blockquote {
      border-left: 3px solid rgba(128, 128, 128, 0.5);
      padding-left: 10px;
      margin: 0.6em 0;
      opacity: 0.88;
    }

    /* 列表与嵌套列表样式 */
    .ft-markdown-view ul, .ft-ul {
      list-style-type: disc;
      padding-left: 1.6em;
      margin: 0.4em 0 0.6em;
    }
    .ft-markdown-view ol, .ft-ol {
      list-style-type: decimal;
      padding-left: 1.6em;
      margin: 0.4em 0 0.6em;
    }
    .ft-markdown-view ul ul { list-style-type: circle; margin: 0.2em 0; }
    .ft-markdown-view ul ul ul { list-style-type: square; }
    .ft-markdown-view ol ol { list-style-type: lower-alpha; margin: 0.2em 0; }

    .ft-markdown-view li, .ft-list-item {
      display: list-item;
      margin-bottom: 0.25em;
      line-height: 1.6;
    }
    .ft-list-item-ordered {
      list-style-type: decimal;
    }

    /* 待办列表/复选框 */
    .ft-markdown-view input[type="checkbox"] {
      margin-right: 6px;
      vertical-align: middle;
      cursor: default;
    }
    .ft-markdown-view li:has(input[type="checkbox"]),
    .ft-markdown-view li.protyle-task--done {
      list-style-type: none;
      margin-left: -1em;
    }
    .ft-todo-item {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: 0.25em;
      margin-bottom: 0.35em;
    }

    /* 表格样式 */
    .ft-markdown-view table {
      border-collapse: collapse;
      width: 100%;
      margin: 0.6em 0;
      font-size: 0.95em;
    }
    .ft-markdown-view th, .ft-markdown-view td {
      border: 1px solid var(--ft-border-color);
      padding: 6px 10px;
      text-align: left;
    }
    .ft-markdown-view th {
      background: var(--ft-header-bg);
      font-weight: 600;
    }
    .ft-markdown-view tr:nth-child(even) {
      background: rgba(128, 128, 128, 0.04);
    }

    .ft-code-block, .ft-markdown-view pre {
      background: var(--ft-code-bg);
      border-radius: 4px;
      padding: 8px 10px;
      margin: 0.5em 0;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 0.9em;
      overflow-x: auto;
      white-space: pre;
    }
    .ft-inline-code, .ft-markdown-view code:not(pre code) {
      background: var(--ft-code-bg);
      padding: 1px 5px;
      border-radius: 3px;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 0.9em;
    }
    .ft-blank-line {
      height: 0.8em;
    }

    /* 图片自适应展示与缩放 */
    .ft-markdown-view img, .ft-image {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 8px auto;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
      object-fit: contain;
      cursor: zoom-in;
      transition: transform 0.2s ease, max-width 0.2s ease;
    }

    .ft-markdown-view img.ft-img-expanded {
      max-width: none;
      cursor: zoom-out;
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
  initialHtml?: string;
  hostWebContentsId?: number | null;
  baseUrl?: string;
}): string {
  const { title, text, config, isDark, initialHtml, hostWebContentsId, baseUrl } = options;
  const safeTitle = escapeHtml(title || "悬浮文本");
  const markdownHtml =
    typeof initialHtml === "string" && initialHtml.trim()
      ? initialHtml
      : simpleMarkdownToHtml(text);
  const themeAttr =
    config.themeMode === "dark"
      ? 'data-theme="dark"'
      : config.themeMode === "light"
      ? 'data-theme="light"'
      : isDark
      ? 'data-theme="dark"'
      : 'data-theme="light"';

  const fontFamStyle = config.fontFamily ? `font-family: ${escapeHtml(config.fontFamily)};` : "";

  const rawBaseUrl =
    baseUrl ||
    (typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "");
  const safeBaseUrl = rawBaseUrl
    ? rawBaseUrl.endsWith("/")
      ? rawBaseUrl
      : `${rawBaseUrl}/`
    : "";

  return `
    <!DOCTYPE html>
    <html lang="zh-CN" ${themeAttr}>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      ${safeBaseUrl ? `<base href="${escapeHtml(safeBaseUrl)}">` : ""}
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
            <span>不透明度</span>
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
          <div id="ft-text-view" class="ft-text-view" contenteditable="plaintext-only" spellcheck="false" data-placeholder="在此处编辑文本..." style="${config.viewMode === 'markdown' ? 'display:none;' : 'display:block;'}">${escapeHtml(text)}</div>
          <div id="ft-markdown-view" class="ft-markdown-view" style="${config.viewMode === 'markdown' ? 'display:block;' : 'display:none;'}">${markdownHtml}</div>
        </main>

        <div id="ft-toast" class="ft-toast">已复制</div>
      </div>

      <script>
        (function() {
          const originalText = ${JSON.stringify(text)};
          const targetHostWebContentsId = ${typeof hostWebContentsId === "number" ? hostWebContentsId : "null"};
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

          let electron = null;
          let remote = null;
          let electronWin = null;
          let electronClipboard = null;

          function ensureImageSources(container) {
            if (!container) return;
            try {
              var imgs = container.querySelectorAll("img");
              for (var i = 0; i < imgs.length; i++) {
                var img = imgs[i];
                if (!img.getAttribute("src") && img.getAttribute("data-src")) {
                  img.setAttribute("src", img.getAttribute("data-src"));
                }
              }
            } catch (e) {}
          }

          ensureImageSources(mdView);

          if (mdView) {
            mdView.addEventListener("click", function(e) {
              var target = e.target;
              if (target && target.tagName === "IMG") {
                target.classList.toggle("ft-img-expanded");
              }
            });
          }
          try {
            const req =
              (typeof window !== "undefined" && window.require) ||
              (typeof require === "function" ? require : null);
            if (req) {
              electron = req("electron");
              remote = req("@electron/remote") || (electron && electron.remote) || null;
            }
            if (remote && remote.getCurrentWindow) {
              electronWin = remote.getCurrentWindow();
            }
            if (electron && electron.clipboard) {
              electronClipboard = electron.clipboard;
            } else if (remote && remote.clipboard) {
              electronClipboard = remote.clipboard;
            }
          } catch (e) {
            console.warn("[DocAssistant][FloatingText] electron init warning:", e);
          }

          function fallbackExecCopy(str) {
            try {
              const ta = document.createElement("textarea");
              ta.value = str;
              ta.setAttribute("readonly", "");
              ta.style.position = "fixed";
              ta.style.left = "-9999px";
              ta.style.top = "0";
              ta.style.opacity = "0";
              document.body.appendChild(ta);
              ta.focus();
              ta.select();
              const ok = document.execCommand("copy");
              document.body.removeChild(ta);
              return Boolean(ok);
            } catch (err) {
              return false;
            }
          }

          function copyText(str) {
            if (electronClipboard && typeof electronClipboard.writeText === "function") {
              try {
                electronClipboard.writeText(str);
                return Promise.resolve(true);
              } catch (e) {}
            }

            if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
              return navigator.clipboard.writeText(str).then(function() {
                return true;
              }).catch(function() {
                return fallbackExecCopy(str);
              });
            }

            return Promise.resolve(fallbackExecCopy(str));
          }

          function saveConfig(patch) {
            if (!patch || typeof patch !== "object") return;

            // 1. Electron 原生环境：优先通过内置核心模块 electron.ipcRenderer 极速通知宿主主窗口
            try {
              const req =
                (typeof window !== "undefined" && window.require) ||
                (typeof require === "function" ? require : null);
              if (req) {
                const electronModule = req("electron");
                const ipc = electronModule && electronModule.ipcRenderer;
                if (ipc && typeof ipc.send === "function") {
                  ipc.send("siyuan-doc-assist-save-floating-config", patch);
                  if (typeof targetHostWebContentsId === "number" && typeof ipc.sendTo === "function") {
                    try {
                      ipc.sendTo(targetHostWebContentsId, "siyuan-doc-assist-save-floating-config", patch);
                    } catch (e) {}
                  }
                }
              }
            } catch (ipcErr) {
              console.warn("[DocAssistant][FloatingText] IPC notification failed:", ipcErr);
            }

            // 2. 尝试调用 opener (如果是普通 window.open 弹出)
            try {
              if (window.opener && typeof window.opener.__saveDocAssistantFloatingConfig === "function") {
                window.opener.__saveDocAssistantFloatingConfig(patch);
              }
            } catch (openerErr) {}

            // 3. 尝试 BroadcastChannel (Web 同源环境)
            try {
              if (typeof BroadcastChannel !== "undefined") {
                const bc = new BroadcastChannel("siyuan-doc-assist-floating-channel");
                bc.postMessage({ type: "save-config", patch: patch });
                bc.close();
              }
            } catch (bcErr) {}

            // 4. 本地存储尝试写入（带异常保护）
            try {
              if (typeof localStorage !== "undefined" && localStorage && typeof localStorage.getItem === "function") {
                const raw = localStorage.getItem("doc-assistant.floating-text.config");
                const cur = raw ? JSON.parse(raw) : {};
                const next = Object.assign({}, cur, patch);
                localStorage.setItem("doc-assistant.floating-text.config", JSON.stringify(next));
              }
            } catch (e) {}

            // 5. 主进程跨窗口内存共享（若环境可用）
            try {
              if (remote && remote.process) {
                const curShared = remote.process.__siyuan_doc_assist_floating_config || {};
                remote.process.__siyuan_doc_assist_floating_config = Object.assign({}, curShared, patch);
              }
            } catch (e) {}

            // 6. Electron 磁盘 JSON 备份（防思源极端异常崩溃冷重启）
            try {
              const req =
                (typeof window !== "undefined" && window.require) ||
                (typeof require === "function" ? require : null);
              if (req) {
                const fs = req("fs");
                const path = req("path");
                let userData = "";
                if (remote && remote.app && typeof remote.app.getPath === "function") {
                  try { userData = remote.app.getPath("userData"); } catch (e) {}
                }
                if (!userData && typeof process !== "undefined" && process.env) {
                  userData = process.env.APPDATA || process.env.HOME || "";
                }
                if (fs && path && userData) {
                  const cfgPath = path.join(userData, "siyuan-doc-assist-floating-config.json");
                  let diskData = {};
                  if (fs.existsSync(cfgPath)) {
                    try {
                      diskData = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
                    } catch (err) {}
                  }
                  const merged = Object.assign({}, diskData, patch);
                  fs.writeFileSync(cfgPath, JSON.stringify(merged, null, 2), "utf-8");
                }
              }
            } catch (fsErr) {
              console.warn("[DocAssistant][FloatingText] disk write failed:", fsErr);
            }
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

          function getSelectedText() {
            try {
              const sel = window.getSelection ? window.getSelection() : null;
              if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
                return "";
              }
              return sel.toString();
            } catch (e) {
              return "";
            }
          }

          document.addEventListener("keydown", function(e) {
            if (e.key === "Escape") {
              if (electronWin) electronWin.close();
              else window.close();
              return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
              const selected = getSelectedText();
              if (selected && selected.trim().length > 0) {
                e.preventDefault();
                copyText(selected).then(function(ok) {
                  if (ok) {
                    showToast("已复制选中内容");
                  }
                });
              }
            }
          });

          document.addEventListener("wheel", function(e) {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              const delta = e.deltaY < 0 ? 1 : -1;
              updateFontSize(currentFontSize + delta);
            }
          }, { passive: false });

          function getCurrentText() {
            if (!textView) return "";
            return textView.innerText || textView.textContent || "";
          }

          function renderInline(str) {
            let res = str.split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
            res = res.replace(/\x60([^\x60]+)\x60/g, '<code class="ft-inline-code">$1</code>');
            res = res.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
            res = res.replace(/\*([^*]+)\*/g, "<em>$1</em>");
            res = res.replace(/~~([^~]+)~~/g, "<del>$1</del>");
            res = res.replace(/!\\[([^\\]]*)\\]\\(([^)]+)\\)/g, '<img src="$2" alt="$1" class="ft-image" loading="lazy" />');
            res = res.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
            return res;
          }

          function simpleMarkdownToHtml(md) {
            if (!md) return "";
            const LF = String.fromCharCode(10);
            const CR = String.fromCharCode(13);
            const lines = md.split(LF);
            const parts = [];
            let inCode = false;
            let codeLines = [];
            let codeLang = "";
            let currentListMode = "none";

            function closeList() {
              if (currentListMode === "ul") {
                parts.push("</ul>");
                currentListMode = "none";
              } else if (currentListMode === "ol") {
                parts.push("</ol>");
                currentListMode = "none";
              }
            }

            for (let i = 0; i < lines.length; i++) {
              let line = lines[i];
              if (line.endsWith(CR)) line = line.slice(0, -1);
              const trimmed = line.trim();

              if (trimmed.startsWith("\x60\x60\x60")) {
                closeList();
                if (!inCode) {
                  inCode = true;
                  codeLang = trimmed.slice(3).trim();
                  codeLines = [];
                } else {
                  inCode = false;
                  const codeEsc = codeLines.join(LF).split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
                  parts.push('<pre class="ft-code-block"><code class="language-' + codeLang + '">' + codeEsc + '</code></pre>');
                }
                continue;
              }

              if (inCode) {
                codeLines.push(line);
                continue;
              }

              if (!trimmed) {
                closeList();
                parts.push('<div class="ft-blank-line"></div>');
                continue;
              }

              // 标题
              if (trimmed.startsWith("#")) {
                closeList();
                let level = 0;
                while (level < 6 && trimmed.charAt(level) === "#") level++;
                if (level > 0 && (trimmed.charAt(level) === " " || trimmed.charAt(level) === "\t")) {
                  parts.push('<h' + level + ' class="ft-h' + level + '">' + renderInline(trimmed.slice(level).trim()) + '</h' + level + '>');
                  continue;
                }
              }

              // 待办项
              if (trimmed.startsWith("- [ ] ") || trimmed.startsWith("- [x] ") || trimmed.startsWith("- [X] ")) {
                closeList();
                const isChecked = trimmed.startsWith("- [x] ") || trimmed.startsWith("- [X] ");
                parts.push('<div class="ft-todo-item"><input type="checkbox" disabled ' + (isChecked ? "checked" : "") + '/> <span>' + renderInline(trimmed.slice(6)) + '</span></div>');
                continue;
              }

              // 无序列表
              if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("+ ")) {
                if (currentListMode === "ol") {
                  parts.push("</ol>");
                  currentListMode = "none";
                }
                if (currentListMode !== "ul") {
                  parts.push('<ul class="ft-ul">');
                  currentListMode = "ul";
                }
                parts.push('<li class="ft-list-item">' + renderInline(trimmed.slice(2)) + '</li>');
                continue;
              }

              // 有序列表
              const dotIdx = trimmed.indexOf(". ");
              if (dotIdx > 0 && !isNaN(Number(trimmed.slice(0, dotIdx)))) {
                if (currentListMode === "ul") {
                  parts.push("</ul>");
                  currentListMode = "none";
                }
                if (currentListMode !== "ol") {
                  parts.push('<ol class="ft-ol">');
                  currentListMode = "ol";
                }
                parts.push('<li class="ft-list-item ft-list-item-ordered">' + renderInline(trimmed.slice(dotIdx + 2)) + '</li>');
                continue;
              }

              // 引用块
              if (trimmed.startsWith(">")) {
                closeList();
                parts.push('<blockquote class="ft-blockquote">' + renderInline(trimmed.slice(1).trim()) + '</blockquote>');
                continue;
              }

              closeList();
              parts.push('<p class="ft-p">' + renderInline(line) + '</p>');
            }

            closeList();

            if (inCode && codeLines.length) {
              const codeEsc = codeLines.join(LF).split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
              parts.push('<pre class="ft-code-block"><code>' + codeEsc + '</code></pre>');
            }

            return parts.join(LF);
          }

          if (textView) {
            textView.addEventListener("paste", function(e) {
              e.preventDefault();
              const clipText = (e.clipboardData || window.clipboardData)?.getData("text/plain") || "";
              if (document.queryCommandSupported && document.queryCommandSupported("insertText")) {
                document.execCommand("insertText", false, clipText);
              } else {
                const sel = window.getSelection ? window.getSelection() : null;
                if (sel && sel.rangeCount > 0) {
                  const range = sel.getRangeAt(0);
                  range.deleteContents();
                  range.insertNode(document.createTextNode(clipText));
                  range.collapse(false);
                }
              }
            });
          }

          if (closeBtn) {
            closeBtn.addEventListener("click", function() {
              if (electronWin) electronWin.close();
              else window.close();
            });
          }

          if (copyBtn) {
            // 阻止 mousedown 导致内容选区失焦被清空
            copyBtn.addEventListener("mousedown", function(e) {
              e.preventDefault();
            });

            copyBtn.addEventListener("click", function() {
              const selected = getSelectedText();
              const hasSelection = Boolean(selected && selected.trim().length > 0);
              const target = hasSelection ? selected : getCurrentText();

              copyText(target).then(function(ok) {
                if (ok) {
                  showToast(hasSelection ? "已复制选中内容" : "已复制全部内容");
                } else {
                  showToast("复制失败");
                }
              });
            });
          }

          if (viewBtn) {
            viewBtn.addEventListener("click", function() {
              isMarkdown = !isMarkdown;
              viewBtn.textContent = isMarkdown ? "MD" : "纯文本";
              if (isMarkdown) {
                if (mdView) {
                  var curText = getCurrentText();
                  // 若文本未经修改且 mdView 已有内容，直接复用首屏由思源宿主 Lute 原生渲染的 initialHtml，确保 100% 渲染精度
                  if (curText !== originalText || !mdView.innerHTML.trim()) {
                    var renderedHtml = "";

                    // 1. 优先尝试跨窗口调用主窗口挂载的 Lute / marked 渲染服务
                    try {
                      if (electronWin && electronWin.__docAssistantHost && typeof electronWin.__docAssistantHost.renderMarkdown === "function") {
                        renderedHtml = electronWin.__docAssistantHost.renderMarkdown(curText);
                      }
                    } catch (e) {}

                    if (!renderedHtml && remote && remote.BrowserWindow) {
                      try {
                        var allWins = remote.BrowserWindow.getAllWindows();
                        for (var i = 0; i < allWins.length; i++) {
                          var w = allWins[i];
                          if (electronWin && w.id === electronWin.id) continue;
                          if (!w.isDestroyed() && w.__docAssistantHost && typeof w.__docAssistantHost.renderMarkdown === "function") {
                            renderedHtml = w.__docAssistantHost.renderMarkdown(curText);
                            if (renderedHtml) break;
                          }
                        }
                      } catch (e) {}
                    }

                    // 2. 降级：使用内置增强的 simpleMarkdownToHtml
                    if (!renderedHtml) {
                      renderedHtml = simpleMarkdownToHtml(getCurrentText());
                    }
                    mdView.innerHTML = renderedHtml;
                    ensureImageSources(mdView);
                  }
                }
                if (textView) textView.style.display = "none";
                if (mdView) mdView.style.display = "block";
              } else {
                if (textView) {
                  textView.style.display = "block";
                  textView.focus();
                }
                if (mdView) mdView.style.display = "none";
              }
              saveConfig({ viewMode: isMarkdown ? "markdown" : "text" });
            });
          }

          if (settingsBtn && drawer) {
            settingsBtn.addEventListener("click", function() {
              drawer.classList.toggle("ft-drawer-open");
              settingsBtn.classList.toggle("ft-btn-active");
            });
          }

          let opacityDebounceTimer = null;
          if (slider) {
            slider.addEventListener("input", function() {
              const val = parseInt(slider.value, 10);
              const op = val / 100;
              if (appEl) appEl.style.setProperty("--ft-opacity", String(op));
              if (opacityLabel) opacityLabel.textContent = val + "%";
              if (opacityDebounceTimer) clearTimeout(opacityDebounceTimer);
              opacityDebounceTimer = setTimeout(function() {
                saveConfig({ opacity: op });
              }, 200);
            });
            slider.addEventListener("change", function() {
              if (opacityDebounceTimer) clearTimeout(opacityDebounceTimer);
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

          const shouldRememberSize = ${Boolean(config.rememberSize)};
          let resizeTimer = null;
          window.addEventListener("resize", function() {
            if (!shouldRememberSize) return;
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function() {
              saveConfig({
                width: window.innerWidth,
                height: window.innerHeight,
              });
            }, 300);
          });
        })();
      </script>
    </body>
    </html>
  `;
}
