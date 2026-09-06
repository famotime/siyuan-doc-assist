import {
  escapeHtml,
  FloatingTextConfig,
  simpleMarkdownToHtml,
} from "@/core/floating-text-core";
import { MARKED_UMD_SOURCE } from "./marked-source";

export function getFloatingWindowStyles(): string {
  return `
    :root {
      --ft-font-size: 15px;
      --ft-opacity: 0.88;
      --ft-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", sans-serif;
      --ft-bg-color: 255, 255, 255;
      --ft-text-color: #1f2328;
      --ft-text-secondary: rgba(0, 0, 0, 0.45);
      --ft-border-color: rgba(0, 0, 0, 0.1);
      --ft-inner-border: rgba(255, 255, 255, 0.6);
      --ft-header-bg: rgba(255, 255, 255, 0.65);
      --ft-button-hover: rgba(0, 0, 0, 0.06);
      --ft-button-active: rgba(0, 0, 0, 0.1);
      --ft-code-bg: rgba(0, 0, 0, 0.05);
      --ft-popover-bg: rgba(255, 255, 255, 0.95);
      --ft-tooltip-bg: rgba(20, 22, 25, 0.95);
      --ft-tooltip-color: #ffffff;
      --ft-accent: #2ea043;
    }

    [data-theme="dark"] {
      --ft-bg-color: 24, 26, 30;
      --ft-text-color: #e6edf3;
      --ft-text-secondary: rgba(255, 255, 255, 0.45);
      --ft-border-color: rgba(255, 255, 255, 0.12);
      --ft-inner-border: rgba(255, 255, 255, 0.06);
      --ft-header-bg: rgba(24, 26, 30, 0.65);
      --ft-button-hover: rgba(255, 255, 255, 0.08);
      --ft-button-active: rgba(255, 255, 255, 0.14);
      --ft-code-bg: rgba(255, 255, 255, 0.07);
      --ft-popover-bg: rgba(30, 33, 38, 0.96);
      --ft-tooltip-bg: rgba(10, 12, 16, 0.96);
      --ft-tooltip-color: #f0f6fc;
      --ft-accent: #3fb950;
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
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    #ft-app {
      position: relative;
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      background: rgba(var(--ft-bg-color), var(--ft-opacity));
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--ft-border-color);
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 10px 32px rgba(0, 0, 0, 0.28), inset 0 1px 0 var(--ft-inner-border);
      transition: background 0.15s ease;
    }

    /* 顶部操作条 */
    .ft-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 38px;
      padding: 0 8px 0 10px;
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

    .ft-drag-handle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      opacity: 0.55;
      cursor: grab;
    }

    .ft-title-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 160px;
    }

    .ft-word-count {
      display: inline-block;
      font-size: 11px;
      font-weight: 500;
      color: var(--ft-text-secondary);
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(128, 128, 128, 0.1);
      margin-left: 2px;
    }

    .ft-actions {
      display: flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
      -webkit-app-region: no-drag;
    }

    /* 操作按钮 */
    .ft-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--ft-text-color);
      border-radius: 5px;
      cursor: pointer;
      opacity: 0.8;
      transition: opacity 0.15s, background 0.15s, transform 0.1s, color 0.15s;
    }

    .ft-btn:hover {
      opacity: 1;
      background: var(--ft-button-hover);
      transform: translateY(-0.5px);
    }

    .ft-btn:active {
      opacity: 0.9;
      background: var(--ft-button-active);
      transform: scale(0.93);
    }

    .ft-btn.ft-btn-active {
      opacity: 1;
      background: var(--ft-button-hover);
    }

    .ft-btn.ft-btn-success {
      opacity: 1;
      color: var(--ft-accent) !important;
    }

    .ft-btn.ft-btn-close:hover {
      color: #f85149;
      background: rgba(248, 81, 73, 0.12);
      opacity: 1;
    }

    /* 显式线框图标 */
    .ft-icon {
      width: 15px;
      height: 15px;
      stroke-width: 1.8;
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-linejoin: round;
      pointer-events: none;
      flex-shrink: 0;
    }

    .ft-pin-icon {
      opacity: 0.85;
    }

    .ft-grip-icon {
      width: 13px;
      height: 13px;
      stroke-width: 1.5;
    }

    /* 语义分隔条 */
    .ft-divider {
      width: 1px;
      height: 14px;
      background: var(--ft-border-color);
      margin: 0 3px;
      flex-shrink: 0;
    }

    /* 自研轻量瞬时 Tooltip */
    .ft-tooltip-wrapper {
      position: relative;
      display: inline-flex;
    }

    .ft-tooltip {
      position: absolute;
      top: calc(100% + 5px);
      left: 50%;
      transform: translate(-50%, -2px);
      padding: 4px 8px;
      background: var(--ft-tooltip-bg);
      color: var(--ft-tooltip-color);
      font-size: 11px;
      line-height: 1.2;
      white-space: nowrap;
      border-radius: 4px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
      pointer-events: none;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.12s ease 0.15s, transform 0.12s ease 0.15s;
      z-index: 999;
    }

    .ft-tooltip.ft-tooltip-right {
      left: auto;
      right: 0;
      transform: translate(0, -2px);
    }

    .ft-tooltip kbd {
      display: inline-block;
      padding: 1px 4px;
      margin-left: 5px;
      font-size: 10px;
      font-family: inherit;
      background: rgba(255, 255, 255, 0.18);
      border-radius: 3px;
      font-weight: normal;
    }

    .ft-tooltip-wrapper:hover .ft-tooltip {
      opacity: 1;
      visibility: visible;
      transform: translate(-50%, 0);
    }

    .ft-tooltip-wrapper:hover .ft-tooltip.ft-tooltip-right {
      transform: translate(0, 0);
    }

    /* 浮动 Popover 外观调节面板 */
    .ft-popover {
      position: absolute;
      top: 44px;
      right: 8px;
      width: 220px;
      padding: 12px 14px;
      background: var(--ft-popover-bg);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--ft-border-color);
      border-radius: 8px;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28), inset 0 1px 0 var(--ft-inner-border);
      display: flex;
      flex-direction: column;
      gap: 12px;
      opacity: 0;
      pointer-events: none;
      transform: translateY(-6px) scale(0.96);
      transition: opacity 0.18s cubic-bezier(0.16, 1, 0.3, 1), transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 200;
      user-select: none;
      -webkit-app-region: no-drag;
    }

    .ft-popover.ft-popover-open {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0) scale(1);
    }

    .ft-popover-item {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .ft-popover-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 500;
      opacity: 0.85;
    }

    .ft-badge {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 3px;
      background: rgba(128, 128, 128, 0.15);
      font-weight: 600;
      font-family: monospace;
    }

    .ft-slider-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .ft-slider {
      flex: 1;
      height: 4px;
      cursor: pointer;
      accent-color: #217346;
    }

    .ft-popover-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 500;
      opacity: 0.9;
    }

    .ft-stepper {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    .ft-step-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      padding: 0;
      border: 1px solid var(--ft-border-color);
      border-radius: 4px;
      background: var(--ft-button-hover);
      color: var(--ft-text-color);
      cursor: pointer;
      transition: background 0.15s, transform 0.1s;
    }

    .ft-step-btn .ft-icon {
      width: 11px;
      height: 11px;
      stroke-width: 2;
    }

    .ft-step-btn:hover {
      background: var(--ft-button-active);
    }

    .ft-step-btn:active {
      transform: scale(0.92);
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

    .ft-markdown-view h1, .ft-h1 { font-size: 1.35em; font-weight: bold; margin: 0.6em 0 0.3em; border-bottom: 1px solid var(--ft-border-color); padding-bottom: 0.2em; }
    .ft-markdown-view h2, .ft-h2 { font-size: 1.2em; font-weight: bold; margin: 0.5em 0 0.3em; }
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

    /* 快捷提示浮条 (备用) */
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
      <!-- 统一显式线框 SVG 符号库 -->
      <svg style="display:none;" xmlns="http://www.w3.org/2000/svg">
        <symbol id="ft-icon-grip" viewBox="0 0 24 24">
          <circle cx="9" cy="6" r="1.5" fill="currentColor"></circle>
          <circle cx="15" cy="6" r="1.5" fill="currentColor"></circle>
          <circle cx="9" cy="12" r="1.5" fill="currentColor"></circle>
          <circle cx="15" cy="12" r="1.5" fill="currentColor"></circle>
          <circle cx="9" cy="18" r="1.5" fill="currentColor"></circle>
          <circle cx="15" cy="18" r="1.5" fill="currentColor"></circle>
        </symbol>
        <symbol id="ft-icon-pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="17" x2="12" y2="22"></line>
          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
        </symbol>
        <symbol id="ft-icon-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </symbol>
        <symbol id="ft-icon-preview" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </symbol>
        <symbol id="ft-icon-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect width="13" height="13" x="9" y="9" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </symbol>
        <symbol id="ft-icon-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </symbol>
        <symbol id="ft-icon-sliders" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <line x1="4" y1="21" x2="4" y2="14"></line>
          <line x1="4" y1="10" x2="4" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12" y2="3"></line>
          <line x1="20" y1="21" x2="20" y2="16"></line>
          <line x1="20" y1="12" x2="20" y2="3"></line>
          <line x1="1" y1="14" x2="7" y2="14"></line>
          <line x1="9" y1="8" x2="15" y2="8"></line>
          <line x1="17" y1="16" x2="23" y2="16"></line>
        </symbol>
        <symbol id="ft-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </symbol>
        <symbol id="ft-icon-minus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </symbol>
        <symbol id="ft-icon-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </symbol>
      </svg>

      <div id="ft-app" style="--ft-opacity: ${config.opacity}; --ft-font-size: ${config.fontSize}px; ${fontFamStyle}">
        <header class="ft-header">
          <div class="ft-title-area" title="按住可拖动窗口">
            <span class="ft-drag-handle" aria-hidden="true">
              <svg class="ft-icon ft-grip-icon"><use href="#ft-icon-grip"></use></svg>
            </span>
            <svg class="ft-icon ft-pin-icon" aria-hidden="true"><use href="#ft-icon-pin"></use></svg>
            <span id="ft-title-text" class="ft-title-text">${safeTitle}</span>
            <span id="ft-word-count" class="ft-word-count"></span>
          </div>

          <div class="ft-actions">
            <!-- 视图切换 -->
            <div class="ft-tooltip-wrapper">
              <button id="ft-btn-view" class="ft-btn" aria-label="切换预览模式">
                <svg class="ft-icon" id="ft-view-icon"><use href="${config.viewMode === "markdown" ? "#ft-icon-text" : "#ft-icon-preview"}"></use></svg>
              </button>
              <div class="ft-tooltip" id="ft-view-tooltip">${config.viewMode === "markdown" ? "切换源码编辑" : "切换 Markdown 预览"} <kbd>Ctrl+M</kbd></div>
            </div>

            <!-- 复制操作 -->
            <div class="ft-tooltip-wrapper">
              <button id="ft-btn-copy" class="ft-btn" aria-label="复制全部内容">
                <svg class="ft-icon" id="ft-copy-icon"><use href="#ft-icon-copy"></use></svg>
              </button>
              <div class="ft-tooltip" id="ft-copy-tooltip">复制全部内容 <kbd>Ctrl+C</kbd></div>
            </div>

            <span class="ft-divider"></span>

            <!-- 外观调节触发器 -->
            <div class="ft-tooltip-wrapper">
              <button id="ft-btn-settings" class="ft-btn" aria-label="外观设置">
                <svg class="ft-icon"><use href="#ft-icon-sliders"></use></svg>
              </button>
              <div class="ft-tooltip">外观与透明度</div>
            </div>

            <!-- 关闭按钮 -->
            <div class="ft-tooltip-wrapper">
              <button id="ft-btn-close" class="ft-btn ft-btn-close" aria-label="关闭窗口">
                <svg class="ft-icon"><use href="#ft-icon-close"></use></svg>
              </button>
              <div class="ft-tooltip ft-tooltip-right">关闭窗口 <kbd>Esc</kbd></div>
            </div>
          </div>
        </header>

        <!-- 悬浮 Popover 调节面板 -->
        <div id="ft-popover" class="ft-popover" role="dialog" aria-label="外观设置">
          <div class="ft-popover-item">
            <div class="ft-popover-header">
              <span>不透明度</span>
              <span id="ft-opacity-label" class="ft-badge">${Math.round(config.opacity * 100)}%</span>
            </div>
            <div class="ft-slider-row">
              <input type="range" id="ft-opacity-slider" class="ft-slider" min="15" max="100" value="${Math.round(config.opacity * 100)}" />
            </div>
          </div>

          <div class="ft-popover-row">
            <span>字号</span>
            <div class="ft-stepper">
              <button id="ft-font-dec" class="ft-step-btn" title="缩小字号 (Ctrl+滚轮下)">
                <svg class="ft-icon"><use href="#ft-icon-minus"></use></svg>
              </button>
              <span id="ft-font-label" class="ft-badge">${config.fontSize}px</span>
              <button id="ft-font-inc" class="ft-step-btn" title="放大字号 (Ctrl+滚轮上)">
                <svg class="ft-icon"><use href="#ft-icon-plus"></use></svg>
              </button>
            </div>
          </div>
        </div>

        <main class="ft-body" id="ft-scroll-body">
          <div id="ft-text-view" class="ft-text-view" contenteditable="plaintext-only" spellcheck="false" data-placeholder="在此处编辑文本..." style="${config.viewMode === "markdown" ? "display:none;" : "display:block;"}">${escapeHtml(text)}</div>
          <div id="ft-markdown-view" class="ft-markdown-view" style="${config.viewMode === "markdown" ? "display:block;" : "display:none;"}">${markdownHtml}</div>
        </main>

        <div id="ft-toast" class="ft-toast">已复制</div>
      </div>

      <!-- 内置轻量安全沙箱 Marked 解析器 -->
      <script>
        (function() {
          var globalObj = typeof window !== "undefined" ? window : this;
          var dummyExports = {};
          var dummyModule = { exports: dummyExports };
          try {
            var initMarked = new Function("exports", "module", "globalThis", ${JSON.stringify(MARKED_UMD_SOURCE)});
            initMarked(dummyExports, dummyModule, globalObj);
            var m = dummyModule.exports.marked || dummyModule.exports || dummyExports.marked || dummyExports;
            if (m && typeof m.parse === "function") {
              globalObj.marked = m;
            }
          } catch (e) {
            console.warn("[DocAssistant][FloatingText] marked init error:", e);
          }
        })();
      </script>

      <script>
        (function() {
          const originalText = ${JSON.stringify(text)};
          let lastRenderedText = ${JSON.stringify(text)};
          const targetHostWebContentsId = ${typeof hostWebContentsId === "number" ? hostWebContentsId : "null"};
          let currentFontSize = ${config.fontSize};
          let currentOpacity = ${config.opacity};
          let isMarkdown = ${config.viewMode === "markdown"};

          const appEl = document.getElementById("ft-app");
          const popoverEl = document.getElementById("ft-popover");
          const textView = document.getElementById("ft-text-view");
          const mdView = document.getElementById("ft-markdown-view");
          const viewBtn = document.getElementById("ft-btn-view");
          const viewIconUse = document.querySelector("#ft-view-icon use");
          const viewTooltip = document.getElementById("ft-view-tooltip");
          const copyBtn = document.getElementById("ft-btn-copy");
          const copyIconUse = document.querySelector("#ft-copy-icon use");
          const copyTooltip = document.getElementById("ft-copy-tooltip");
          const settingsBtn = document.getElementById("ft-btn-settings");
          const closeBtn = document.getElementById("ft-btn-close");
          const slider = document.getElementById("ft-opacity-slider");
          const opacityLabel = document.getElementById("ft-opacity-label");
          const fontLabel = document.getElementById("ft-font-label");
          const fontIncBtn = document.getElementById("ft-font-inc");
          const fontDecBtn = document.getElementById("ft-font-dec");
          const wordCountEl = document.getElementById("ft-word-count");
          const toast = document.getElementById("ft-toast");

          let electron = null;
          let remote = null;
          let electronWin = null;
          let electronClipboard = null;

          function countWords(str) {
            if (!str) return 0;
            const cleaned = str.trim().replace(/\\s+/g, "");
            return cleaned.length;
          }

          function updateWordCount() {
            if (!wordCountEl) return;
            const text = getCurrentText();
            const len = countWords(text);
            if (len > 0) {
              wordCountEl.textContent = len + " 字";
              wordCountEl.style.display = "inline-block";
            } else {
              wordCountEl.textContent = "";
              wordCountEl.style.display = "none";
            }
          }

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
          updateWordCount();

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

            // 6. Electron 磁盘 JSON 备份
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

          let copyFeedbackTimer = null;
          function triggerCopyFeedback(isPartial) {
            if (!copyBtn) return;
            copyBtn.classList.add("ft-btn-success");
            if (copyIconUse) {
              copyIconUse.setAttribute("href", "#ft-icon-check");
            }
            if (copyTooltip) {
              copyTooltip.innerHTML = (isPartial ? "已复制选中内容" : "已复制全部内容") + " ✓";
            }
            if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
            copyFeedbackTimer = setTimeout(function() {
              copyBtn.classList.remove("ft-btn-success");
              if (copyIconUse) {
                copyIconUse.setAttribute("href", "#ft-icon-copy");
              }
              if (copyTooltip) {
                copyTooltip.innerHTML = "复制全部内容 <kbd>Ctrl+C</kbd>";
              }
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

          function stripKramdown(str) {
            if (!str) return "";
            var LF = String.fromCharCode(10);
            var CR = String.fromCharCode(13);
            var clean = str.split(CR + LF).join(LF).split(CR).join(LF);
            var lines = clean.split(LF);
            var res = [];
            for (var i = 0; i < lines.length; i++) {
              var l = lines[i];
              if (l.indexOf("{:") === -1) {
                res.push(l);
              } else {
                var cleaned = l.replace(new RegExp(String.fromCharCode(123) + ":[^}]*" + String.fromCharCode(125), "g"), "");
                if (cleaned.trim() || !l.trim()) {
                  res.push(cleaned);
                }
              }
            }
            return res.join(LF);
          }

          function renderMarkdown(md) {
            if (!md) return "";
            var clean = stripKramdown(md);
            // 1. 优先使用内置 marked 引擎解析（完整支持表格、多级列表、代码块、水平线等）
            try {
              var m = (typeof window !== "undefined" && window.marked) || (typeof marked !== "undefined" ? marked : null);
              if (m) {
                if (typeof m.parse === "function") {
                  return m.parse(clean, { gfm: true, breaks: true, async: false });
                }
                if (typeof m === "function") {
                  return m(clean, { gfm: true, breaks: true, async: false });
                }
              }
            } catch (markedErr) {
              console.warn("[DocAssistant][FloatingText] marked parse failed:", markedErr);
            }

            // 2. 终极降级：内置增强的 simpleMarkdownToHtml
            return simpleMarkdownToHtml(clean);
          }

          function toggleViewMode() {
            isMarkdown = !isMarkdown;
            if (viewIconUse) {
              viewIconUse.setAttribute("href", isMarkdown ? "#ft-icon-text" : "#ft-icon-preview");
            }
            if (viewTooltip) {
              viewTooltip.innerHTML = (isMarkdown ? "切换源码编辑" : "切换 Markdown 预览") + " <kbd>Ctrl+M</kbd>";
            }

            if (isMarkdown) {
              if (mdView) {
                var curText = getCurrentText();
                var LF = String.fromCharCode(10);
                var CR = String.fromCharCode(13);
                var normCur = (curText || "").split(CR + LF).join(LF).split(CR).join(LF);
                var normLast = (lastRenderedText || "").split(CR + LF).join(LF).split(CR).join(LF);
                if (normCur !== normLast || !mdView.innerHTML.trim()) {
                  var renderedHtml = renderMarkdown(curText);
                  mdView.innerHTML = renderedHtml;
                  lastRenderedText = curText;
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
          }

          function closePopover() {
            if (popoverEl) popoverEl.classList.remove("ft-popover-open");
            if (settingsBtn) settingsBtn.classList.remove("ft-btn-active");
          }

          document.addEventListener("click", function(e) {
            if (!popoverEl || !popoverEl.classList.contains("ft-popover-open")) return;
            var target = e.target;
            if (!popoverEl.contains(target) && (!settingsBtn || !settingsBtn.contains(target))) {
              closePopover();
            }
          });

          document.addEventListener("keydown", function(e) {
            if (e.key === "Escape") {
              if (popoverEl && popoverEl.classList.contains("ft-popover-open")) {
                closePopover();
                return;
              }
              if (electronWin) electronWin.close();
              else window.close();
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
                copyText(selected).then(function(ok) {
                  if (ok) {
                    triggerCopyFeedback(true);
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
            var val = textView.innerText;
            if (typeof val === "string" && (val.length > 0 || textView.style.display !== "none")) {
              return val;
            }
            return textView.textContent || "";
          }

          function renderInline(str) {
            let res = str.split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
            res = res.replace(/\\x60([^\\x60]+)\\x60/g, '<code class="ft-inline-code">$1</code>');
            res = res.replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>");
            res = res.replace(/\\*([^*]+)\\*/g, "<em>$1</em>");
            res = res.replace(/~~([^~]+)~~/g, "<del>$1</del>");
            res = res.replace(/==([^=]+)==/g, "<mark>$1</mark>");
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

              if (trimmed.startsWith("\\x60\\x60\\x60")) {
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

              // 水平分割线
              if (new RegExp("^(?:---+|\\*\\*\\*+|___+)\\s*$").test(trimmed)) {
                closeList();
                parts.push('<hr class="ft-hr" />');
                continue;
              }

              // 标题
              if (trimmed.startsWith("#")) {
                closeList();
                let level = 0;
                while (level < 6 && trimmed.charAt(level) === "#") level++;
                if (level > 0 && (trimmed.charAt(level) === " " || trimmed.charAt(level) === "\\t")) {
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
            textView.addEventListener("input", function() {
              updateWordCount();
            });

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
              updateWordCount();
            });
          }

          if (closeBtn) {
            closeBtn.addEventListener("click", function() {
              if (electronWin) electronWin.close();
              else window.close();
            });
          }

          if (copyBtn) {
            copyBtn.addEventListener("mousedown", function(e) {
              e.preventDefault();
            });

            copyBtn.addEventListener("click", function() {
              const selected = getSelectedText();
              const hasSelection = Boolean(selected && selected.trim().length > 0);
              const target = hasSelection ? selected : getCurrentText();

              copyText(target).then(function(ok) {
                if (ok) {
                  triggerCopyFeedback(hasSelection);
                } else {
                  showToast("复制失败");
                }
              });
            });
          }

          if (viewBtn) {
            viewBtn.addEventListener("click", function() {
              toggleViewMode();
            });
          }

          if (settingsBtn && popoverEl) {
            settingsBtn.addEventListener("click", function(e) {
              e.stopPropagation();
              popoverEl.classList.toggle("ft-popover-open");
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
