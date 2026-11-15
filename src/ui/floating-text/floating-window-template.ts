import {
  escapeHtml,
  FloatingTextConfig,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  MIN_OPACITY,
  simpleMarkdownToHtml
} from "@/core/floating-text-core";
import { MARKED_UMD_SOURCE } from "./marked-source";
import { getFloatingWindowStyles } from "./floating-window-styles";
import { buildFloatingWindowClientScript } from "./floating-window-client-script";


export function buildFloatingWindowHtml(options: {
  title: string;
  text: string;
  config: FloatingTextConfig;
  isDark: boolean;
  initialHtml?: string;
  hostWebContentsId?: number | null;
  baseUrl?: string;
  isDialogFallback?: boolean;
}): string {
  const { title, text, config, isDark, initialHtml, hostWebContentsId, baseUrl, isDialogFallback } = options;
  const safeTitle = escapeHtml(title || "悬浮文本");
  const markdownHtml =
    typeof initialHtml === "string" && initialHtml.trim() ?
      initialHtml :
        simpleMarkdownToHtml(text);
  const themeAttr =
    config.themeMode === "dark" ?
      'data-theme="dark"' :
      config.themeMode === "light" ?
        'data-theme="light"' :
        isDark ?
          'data-theme="dark"' :
          'data-theme="light"';

  const fontFamStyle = config.fontFamily ? `font-family: ${escapeHtml(config.fontFamily)};` : "";

  const rawBaseUrl =
    baseUrl ||
    (typeof window !== "undefined" && window.location?.origin ?
      window.location.origin :
      "");
  const safeBaseUrl = rawBaseUrl ?
    rawBaseUrl.endsWith("/") ?
      rawBaseUrl :
      `${rawBaseUrl}/` :
    "";

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
        <symbol id="ft-icon-pin-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <line x1="2" y1="2" x2="22" y2="22"></line>
          <line x1="12" y1="17" x2="12" y2="22"></line>
          <path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h12"></path>
          <path d="M15 9.34V6h1a1 1 0 0 0 0-2H7.89"></path>
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
        <symbol id="ft-icon-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </symbol>
      </svg>

      <div id="ft-app" style="--ft-opacity: ${config.opacity}; --ft-font-size: ${config.fontSize}px; ${fontFamStyle}">
        <header class="ft-header${isDialogFallback ? " resize__move" : ""}" style="${isDialogFallback ? "-webkit-app-region: no-drag; cursor: move;" : ""}">
          <div class="ft-title-area${isDialogFallback ? " resize__move" : ""}" title="按住可拖动窗口">
            <span class="ft-drag-handle${isDialogFallback ? " resize__move" : ""}" aria-hidden="true">
              <svg class="ft-icon ft-grip-icon"><use href="#ft-icon-grip"></use></svg>
            </span>
            <span id="ft-title-text" class="ft-title-text${isDialogFallback ? " resize__move" : ""}">${safeTitle}</span>
            <span id="ft-word-count" class="ft-word-count"></span>
          </div>

          <div class="ft-actions" style="-webkit-app-region: no-drag;">
            ${isDialogFallback ?
              "" :
              `<!-- 置顶状态切换 -->
            <div class="ft-tooltip-wrapper">
              <button id="ft-btn-pin" class="ft-btn ft-btn-active ft-btn-pinned" aria-label="取消置顶">
                <svg class="ft-icon" id="ft-pin-icon"><use href="#ft-icon-pin"></use></svg>
              </button>
              <div class="ft-tooltip" id="ft-pin-tooltip">取消置顶 <kbd>Alt+P</kbd></div>
            </div>`}

            <!-- 搜索操作 -->
            <div class="ft-tooltip-wrapper">
              <button id="ft-btn-search" class="ft-btn" aria-label="搜索文本">
                <svg class="ft-icon" id="ft-search-icon"><use href="#ft-icon-search"></use></svg>
              </button>
              <div class="ft-tooltip" id="ft-search-tooltip">搜索过滤 <kbd>Ctrl+F</kbd></div>
            </div>

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

        <!-- 搜索栏容器 (默认折叠) -->
        <div class="ft-search-bar" id="ft-search-bar" style="display: none;">
          <div class="ft-search-icon-prefix" aria-hidden="true">
            <svg class="ft-icon"><use href="#ft-icon-search"></use></svg>
          </div>
          <input
            type="text"
            class="ft-search-input"
            id="ft-search-input"
            placeholder="搜索关键词 (↑↓选择, Enter复制)..."
            autocomplete="off"
            spellcheck="false"
          />
          <span class="ft-search-count" id="ft-search-count" style="display: none;">0 项</span>
          <button class="ft-search-clear-btn" id="ft-search-clear" title="清空搜索词" style="display: none;">
            <svg class="ft-icon"><use href="#ft-icon-close"></use></svg>
          </button>
          <button class="ft-search-close-btn" id="ft-search-close" title="收起搜索栏 (Esc)">
            <svg class="ft-icon"><use href="#ft-icon-close"></use></svg>
          </button>
        </div>

        <!-- 悬浮 Popover 调节面板 -->
        <div id="ft-popover" class="ft-popover" role="dialog" aria-label="外观设置">
          <div class="ft-popover-item">
            <div class="ft-popover-header">
              <span>不透明度</span>
              <span id="ft-opacity-label" class="ft-badge">${Math.round(config.opacity * 100)}%</span>
            </div>
            <div class="ft-slider-row">
              <input type="range" id="ft-opacity-slider" class="ft-slider" min="${Math.round(MIN_OPACITY * 100)}" max="100" value="${Math.round(config.opacity * 100)}" />
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
          <div id="ft-search-results" class="ft-search-results" style="display: none;"></div>
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
${buildFloatingWindowClientScript({
  text,
  hostWebContentsId,
  fontSize: config.fontSize,
  opacity: config.opacity,
  fontSizeMin: MIN_FONT_SIZE,
  fontSizeMax: MAX_FONT_SIZE,
  isMarkdownView: config.viewMode === "markdown",
  autoPasteOnSelect: Boolean(config.autoPasteOnSelect),
  isDialogFallback: Boolean(isDialogFallback),
  rememberSize: Boolean(config.rememberSize)
})}
      </script>
    </body>
    </html>
  `;
}
