/**
 * 悬浮文本纯领域模型与逻辑计算
 */

export type FloatingThemeMode = "auto" | "light" | "dark";
export type FloatingViewMode = "text" | "markdown";

export interface FloatingTextConfig {
  /** 背景不透明度：0.1 ~ 1.0 */
  opacity: number;
  /** 字体大小（px）：12 ~ 40 */
  fontSize: number;
  /** 字体族：空字符串表示使用系统默认 */
  fontFamily: string;
  /** 外观主题 */
  themeMode: FloatingThemeMode;
  /** 默认视图：纯文本或 Markdown */
  viewMode: FloatingViewMode;
  /** 窗口宽度（px） */
  width: number;
  /** 窗口高度（px） */
  height: number;
  /** 是否自动记忆窗口尺寸 */
  rememberSize: boolean;
}

export const DEFAULT_FLOATING_TEXT_CONFIG: FloatingTextConfig = {
  opacity: 0.85,
  fontSize: 15,
  fontFamily: "",
  themeMode: "auto",
  viewMode: "text",
  width: 420,
  height: 320,
  rememberSize: true,
};

export const MIN_FONT_SIZE = 11;
export const MAX_FONT_SIZE = 42;
export const MIN_OPACITY = 0.1;
export const MAX_OPACITY = 1.0;
export const MIN_WINDOW_WIDTH = 240;
export const MAX_WINDOW_WIDTH = 1920;
export const MIN_WINDOW_HEIGHT = 160;
export const MAX_WINDOW_HEIGHT = 1440;

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

/**
 * 校验并归一化悬浮文本配置
 */
export function normalizeFloatingConfig(
  raw?: Partial<FloatingTextConfig> | null
): FloatingTextConfig {
  if (!raw) {
    return { ...DEFAULT_FLOATING_TEXT_CONFIG };
  }

  const opacity =
    typeof raw.opacity === "number"
      ? clamp(Math.round(raw.opacity * 100) / 100, MIN_OPACITY, MAX_OPACITY)
      : DEFAULT_FLOATING_TEXT_CONFIG.opacity;

  const fontSize =
    typeof raw.fontSize === "number"
      ? clamp(Math.round(raw.fontSize), MIN_FONT_SIZE, MAX_FONT_SIZE)
      : DEFAULT_FLOATING_TEXT_CONFIG.fontSize;

  const width =
    typeof raw.width === "number"
      ? clamp(Math.round(raw.width), MIN_WINDOW_WIDTH, MAX_WINDOW_WIDTH)
      : DEFAULT_FLOATING_TEXT_CONFIG.width;

  const height =
    typeof raw.height === "number"
      ? clamp(Math.round(raw.height), MIN_WINDOW_HEIGHT, MAX_WINDOW_HEIGHT)
      : DEFAULT_FLOATING_TEXT_CONFIG.height;

  const themeMode: FloatingThemeMode =
    raw.themeMode === "light" || raw.themeMode === "dark" || raw.themeMode === "auto"
      ? raw.themeMode
      : DEFAULT_FLOATING_TEXT_CONFIG.themeMode;

  const viewMode: FloatingViewMode =
    raw.viewMode === "markdown" ? "markdown" : "text";

  const fontFamily = typeof raw.fontFamily === "string" ? raw.fontFamily.trim() : "";
  const rememberSize = typeof raw.rememberSize === "boolean" ? raw.rememberSize : true;

  return {
    opacity,
    fontSize,
    fontFamily,
    themeMode,
    viewMode,
    width,
    height,
    rememberSize,
  };
}

/**
 * 计算字体滚轮缩放步进
 */
export function calculateSteppedFontSize(
  current: number,
  direction: "up" | "down",
  step = 1
): number {
  const delta = direction === "up" ? step : -step;
  return clamp(current + delta, MIN_FONT_SIZE, MAX_FONT_SIZE);
}

/**
 * 转换 HEX 颜色与透明度为 rgba 字符串
 */
export function hexToRgba(hex: string, opacity: number): string {
  const safeOpacity = clamp(opacity, 0, 1);
  const cleanHex = hex.replace("#", "").trim();
  if (cleanHex.length === 3) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16);
    const g = parseInt(cleanHex[1] + cleanHex[1], 16);
    const b = parseInt(cleanHex[2] + cleanHex[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${safeOpacity})`;
  }
  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${safeOpacity})`;
  }
  return `rgba(0, 0, 0, ${safeOpacity})`;
}

/**
 * HTML 特殊字符转义（防 XSS）
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 极简轻量安全的 Markdown 渲染器（无需第三方重依赖）
 * 支持段落、标题、加粗、斜体、删除线、行内代码、代码块、待办列表与标准列表容器
 */
export function simpleMarkdownToHtml(markdown: string): string {
  if (!markdown) {
    return "";
  }

  const lines = markdown.split(/\r?\n/);
  const htmlParts: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeBlockLines: string[] = [];
  let currentListMode: "none" | "ul" | "ol" = "none";

  const closeOpenList = () => {
    if (currentListMode === "ul") {
      htmlParts.push("</ul>");
      currentListMode = "none";
    } else if (currentListMode === "ol") {
      htmlParts.push("</ol>");
      currentListMode = "none";
    }
  };

  for (const line of lines) {
    // 代码块判定
    if (line.trim().startsWith("```")) {
      closeOpenList();
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
        codeBlockLines = [];
      } else {
        inCodeBlock = false;
        const codeText = escapeHtml(codeBlockLines.join("\n"));
        htmlParts.push(
          `<pre class="ft-code-block"><code class="language-${escapeHtml(codeBlockLang)}">${codeText}</code></pre>`
        );
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      closeOpenList();
      htmlParts.push('<div class="ft-blank-line"></div>');
      continue;
    }

    // 水平分割线
    if (/^(?:---+|\*\*\*+|___+)\s*$/.test(trimmed)) {
      closeOpenList();
      htmlParts.push('<hr class="ft-hr" />');
      continue;
    }

    // 标题解析
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeOpenList();
      const level = headingMatch[1].length;
      const content = renderInlineMarkdown(headingMatch[2]);
      htmlParts.push(`<h${level} class="ft-h${level}">${content}</h${level}>`);
      continue;
    }

    // 待办事项
    const todoMatch = trimmed.match(/^-\s+\[([ xX])\]\s+(.*)$/);
    if (todoMatch) {
      closeOpenList();
      const checked = todoMatch[1].toLowerCase() === "x";
      const content = renderInlineMarkdown(todoMatch[2]);
      htmlParts.push(
        `<div class="ft-todo-item"><input type="checkbox" disabled ${checked ? "checked" : ""}/> <span>${content}</span></div>`
      );
      continue;
    }

    // 无序列表
    const listMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (listMatch) {
      if (currentListMode === "ol") {
        htmlParts.push("</ol>");
        currentListMode = "none";
      }
      if (currentListMode !== "ul") {
        htmlParts.push('<ul class="ft-ul">');
        currentListMode = "ul";
      }
      const content = renderInlineMarkdown(listMatch[1]);
      htmlParts.push(`<li class="ft-list-item">${content}</li>`);
      continue;
    }

    // 有序列表
    const orderedListMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (orderedListMatch) {
      if (currentListMode === "ul") {
        htmlParts.push("</ul>");
        currentListMode = "none";
      }
      if (currentListMode !== "ol") {
        htmlParts.push('<ol class="ft-ol">');
        currentListMode = "ol";
      }
      const content = renderInlineMarkdown(orderedListMatch[1]);
      htmlParts.push(`<li class="ft-list-item ft-list-item-ordered">${content}</li>`);
      continue;
    }

    // 引用块
    if (trimmed.startsWith(">")) {
      closeOpenList();
      const quoteText = renderInlineMarkdown(trimmed.replace(/^>\s*/, ""));
      htmlParts.push(`<blockquote class="ft-blockquote">${quoteText}</blockquote>`);
      continue;
    }

    // 普通段落
    closeOpenList();
    htmlParts.push(`<p class="ft-p">${renderInlineMarkdown(line)}</p>`);
  }

  closeOpenList();

  if (inCodeBlock && codeBlockLines.length) {
    const codeText = escapeHtml(codeBlockLines.join("\n"));
    htmlParts.push(
      `<pre class="ft-code-block"><code>${codeText}</code></pre>`
    );
  }

  return htmlParts.join("\n");
}

function renderInlineMarkdown(text: string): string {
  let escaped = escapeHtml(text);
  // 行内代码 `code`
  escaped = escaped.replace(/`([^`]+)`/g, '<code class="ft-inline-code">$1</code>');
  // 加粗 **bold**
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // 斜体 *italic*
  escaped = escaped.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // 删除线 ~~del~~
  escaped = escaped.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  // 高亮 ==mark==
  escaped = escaped.replace(/==([^=]+)==/g, "<mark>$1</mark>");
  // 图片 ![alt](url)
  escaped = escaped.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" class="ft-image" loading="lazy" />'
  );
  // 链接 [text](url)
  escaped = escaped.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return escaped;
}

/**
 * 检查 Markdown 文本中是否包含图片标记
 */
export function hasImageMarkdown(text: string): boolean {
  if (!text) {
    return false;
  }
  return /!\[.*?\]\(.*?\)/.test(text) || /<img\b[^>]*>/i.test(text);
}

/**
 * 剥离 Kramdown 文本中的块属性与行内属性列表（IAL，如 {: id="..." updated="..."}）
 * 仅保留干净的正文 Markdown 文本
 */
export function stripKramdownBlockAttributes(raw: string): string {
  if (!raw) {
    return "";
  }

  const lines = raw.split(/\r?\n/);
  const cleanedLines: string[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // 代码块围栏判定：代码块内部的内容不进行 IAL 清洗
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      cleanedLines.push(line);
      continue;
    }

    if (inCodeBlock) {
      cleanedLines.push(line);
      continue;
    }

    // 1. 如果整行纯粹是 IAL 块属性定义（例如 {: id="..." updated="..."}），直接剔除
    if (/^\s*\{:[^}]*\}\s*$/.test(line)) {
      continue;
    }

    // 2. 剥离无序列表项或任务列表项头部的 IAL
    // 如：- {: id="xxx" updated="yyy"}项目地址... -> - 项目地址...
    // 如：- [ ] {: id="xxx"}待办事项... -> - [ ] 待办事项...
    line = line.replace(/^(\s*[-*+]\s+(?:\[[ xX]\]\s+)?)\{:[^}]*\}\s*/, "$1");

    // 3. 剥离有序列表项头部的 IAL
    // 如：1. {: id="xxx"}第一项 -> 1. 第一项
    line = line.replace(/^(\s*\d+[.)]\s+)\{:[^}]*\}\s*/, "$1");

    // 4. 剥离标题末尾或标题中的 IAL
    // 如：# 标题 {: id="xxx"} -> # 标题
    line = line.replace(/^(#{1,6}\s+.*?)\s*\{:[^}]*\}\s*$/, "$1");

    // 5. 剥离引用块开头的 IAL
    // 如：> {: id="xxx"}引用文字 -> > 引用文字
    line = line.replace(/^(\s*>\s*)\{:[^}]*\}\s*/, "$1");

    // 6. 剥离剩余行中可能出现的任何 IAL 块/行内标记（如末尾附带的 {: id="..." ...} 等）
    line = line.replace(/\s*\{:[^}]*\}\s*/g, (match, offset, str) => {
      if (offset === 0 || offset + match.length === str.length) {
        return "";
      }
      return " ";
    });

    cleanedLines.push(line);
  }

  // 7. 清理因删除属性行可能导致的连续多余空行（最多连续保留 1 个空行）
  return cleanedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 决策弹窗复制时应复制的内容
 * 如果用户在弹窗中选定了有效文本，则仅复制选中文本；否则复制完整原始文本
 */
export function resolveFloatingCopyText(
  selectedText: string | null | undefined,
  fullText: string
): { text: string; isSelected: boolean } {
  if (selectedText && selectedText.trim().length > 0) {
    return {
      text: selectedText,
      isSelected: true,
    };
  }
  return {
    text: fullText,
    isSelected: false,
  };
}

/**
 * 根据列表项类型为纯文本补充标准 Markdown 列表前缀
 */
export function formatListItemMarkdown(
  text: string,
  subtype?: "u" | "o" | "t" | string,
  index = 1,
  isCompleted = false
): string {
  const content = (text || "").trim();
  if (!content) {
    return "";
  }
  if (subtype === "t") {
    return `- [${isCompleted ? "x" : " "}] ${content}`;
  }
  if (subtype === "o") {
    return `${index}. ${content}`;
  }
  return `- ${content}`;
}


