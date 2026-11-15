/**
 * 悬浮窗内置样式表
 * 原 floating-window-template.ts 中 getFloatingWindowStyles 的纯字符串搬移，内容零改动
 */

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
      cursor: grab;
    }

    #ft-app.is-dragging,
    #ft-app.is-dragging .ft-header,
    #ft-app.is-dragging .ft-title-area {
      cursor: grabbing !important;
      user-select: none !important;
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
      cursor: inherit;
    }

    .ft-drag-handle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      opacity: 0.55;
      cursor: inherit;
      pointer-events: none;
    }

    .ft-title-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 160px;
      pointer-events: none;
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
      pointer-events: none;
    }

    .ft-actions {
      display: flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
      -webkit-app-region: no-drag;
      cursor: default;
    }

    .ft-actions * {
      pointer-events: auto;
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

    .ft-btn.ft-btn-pinned {
      opacity: 1;
      color: var(--ft-accent);
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

    /* 搜索栏 */
    .ft-search-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: var(--ft-header-bg);
      border-bottom: 1px solid var(--ft-border-color);
      flex-shrink: 0;
      -webkit-app-region: no-drag;
      animation: ftSlideDown 0.16s ease-out;
    }

    @keyframes ftSlideDown {
      from {
        opacity: 0;
        transform: translateY(-6px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .ft-search-icon-prefix {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      opacity: 0.55;
      flex-shrink: 0;
    }

    .ft-search-icon-prefix .ft-icon {
      width: 14px;
      height: 14px;
    }

    .ft-search-input {
      flex: 1;
      min-width: 0;
      height: 26px;
      padding: 0 8px;
      border: 1px solid var(--ft-border-color);
      border-radius: 4px;
      background: rgba(128, 128, 128, 0.08);
      color: var(--ft-text-color);
      font-size: 12px;
      outline: none;
      transition: border-color 0.15s, background 0.15s;
    }

    .ft-search-input:focus {
      border-color: #2ea043;
      background: rgba(128, 128, 128, 0.12);
    }

    .ft-search-count {
      font-size: 11px;
      font-weight: 500;
      color: var(--ft-text-secondary);
      white-space: nowrap;
      flex-shrink: 0;
      padding: 1px 5px;
      border-radius: 3px;
      background: rgba(128, 128, 128, 0.12);
    }

    .ft-search-clear-btn,
    .ft-search-close-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: var(--ft-text-secondary);
      cursor: pointer;
      flex-shrink: 0;
      padding: 0;
      transition: background 0.15s, color 0.15s;
    }

    .ft-search-clear-btn:hover,
    .ft-search-close-btn:hover {
      background: var(--ft-button-hover);
      color: var(--ft-text-color);
    }

    .ft-search-clear-btn .ft-icon,
    .ft-search-close-btn .ft-icon {
      width: 12px;
      height: 12px;
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

    /* 搜索结果列表 */
    .ft-search-results {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-height: 100%;
    }

    .ft-search-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
      font-size: 13px;
      color: var(--ft-text-secondary);
      user-select: none;
    }

    .ft-search-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid var(--ft-border-color);
      background: rgba(128, 128, 128, 0.05);
      cursor: pointer;
      transition: background 0.12s, border-color 0.12s, transform 0.1s;
      user-select: text;
    }

    .ft-search-item:hover,
    .ft-search-item.is-selected {
      background: rgba(46, 160, 67, 0.12);
      border-color: rgba(46, 160, 67, 0.4);
    }

    .ft-search-item.is-selected {
      box-shadow: 0 0 0 1px rgba(46, 160, 67, 0.35);
    }

    .ft-search-item-line {
      font-size: 11px;
      font-family: monospace;
      font-weight: 600;
      color: var(--ft-text-secondary);
      background: rgba(128, 128, 128, 0.15);
      padding: 1px 5px;
      border-radius: 3px;
      flex-shrink: 0;
      margin-top: 2px;
      user-select: none;
    }

    .ft-search-item-text {
      flex: 1;
      font-size: calc(var(--ft-font-size) - 1px);
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .ft-search-item-action {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: 11px;
      color: var(--ft-accent);
      opacity: 0;
      flex-shrink: 0;
      margin-top: 2px;
      transition: opacity 0.15s;
      user-select: none;
    }

    .ft-search-item:hover .ft-search-item-action,
    .ft-search-item.is-selected .ft-search-item-action {
      opacity: 0.9;
    }

    .ft-search-highlight {
      background: rgba(255, 212, 0, 0.4);
      color: inherit;
      padding: 0 2px;
      border-radius: 2px;
      font-weight: 600;
    }

    [data-theme="dark"] .ft-search-highlight {
      background: rgba(230, 165, 0, 0.45);
      color: inherit;
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
