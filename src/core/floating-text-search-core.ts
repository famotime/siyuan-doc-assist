import { escapeHtml } from "./floating-text-core";

export interface FloatingSearchCandidate {
  id: number;
  line: number;
  rawText: string;
  displayText: string;
  cleanText: string;
}

/**
 * 剥离思源/Markdown 文本中的前缀标记
 * 规则：
 * 1. 递归剥离多层复合嵌套前缀：
 *    - 行首缩进（空格、Tab）
 *    - 引用标记（>、>>）
 *    - Markdown 标题（# ~ ######，要求后接空格）
 *    - 待办列表复选框（- [ ]、- [x]、* [ ]、[ ] 等）
 *    - 无序列表符号（-、*、+，要求后接空格）
 *    - 有序列表编号（1.、2)、3、等）
 * 2. 剥离残留的思源 Kramdown 块/行内属性标记 {: ...}
 * 3. 首尾空白裁剪（trim）
 */
export function stripFloatingPrefixMarkers(raw: string): string {
  if (!raw) {
    return "";
  }

  // 1. 剥离思源 Kramdown 属性标记（如 {: id="..." ...}）
  let str = raw.replace(/\{:[^}]*\}/g, "");

  // 2. 循环递归剥离开头的多层复合前缀
  let prev = "";
  let guard = 0;
  while (str !== prev && guard < 10) {
    prev = str;
    guard++;

    // 清除开头的空格、Tab 等空白字符
    str = str.replace(/^[\s\t]+/, "");

    // 匹配并剥离引用符号（支持多层 >）
    const quoteMatch = str.match(/^>+\s*/);
    if (quoteMatch) {
      str = str.slice(quoteMatch[0].length);
      continue;
    }

    // 匹配并剥离 Markdown 标题（# ~ ######，要求后接空白字符以避免误伤 #tag）
    const headingMatch = str.match(/^#{1,6}\s+/);
    if (headingMatch) {
      str = str.slice(headingMatch[0].length);
      continue;
    }

    // 匹配并剥离待办复选框（如 - [ ] 、* [x] 、+ [X] 、[ ] ）
    const todoMatch = str.match(/^(?:[-*+]\s+)?\[([ xX])\]\s*/);
    if (todoMatch) {
      str = str.slice(todoMatch[0].length);
      continue;
    }

    // 匹配并剥离无序列表符号（- 、* 、+，要求后接空白字符以避免误伤负数或国家码）
    const unorderedMatch = str.match(/^[-*+]\s+/);
    if (unorderedMatch) {
      str = str.slice(unorderedMatch[0].length);
      continue;
    }

    // 匹配并剥离有序列表编号（如 1. 、2) 、3、）
    const orderedMatch = str.match(/^\d+[\.\)､、]\s*/);
    if (orderedMatch) {
      str = str.slice(orderedMatch[0].length);
      continue;
    }
  }

  return str.trim();
}

/**
 * 将长文本按非空行切分为检索候选条目，自动剥离前缀（列表符、待办框、引用、标题等），
 * 若剥离后为空则自动过滤剔除
 */
export function splitFloatingTextCandidates(text: string): FloatingSearchCandidate[] {
  if (!text) {
    return [];
  }

  const lines = text.split(/\r?\n/);
  const candidates: FloatingSearchCandidate[] = [];
  let idCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const cleaned = stripFloatingPrefixMarkers(rawLine);
    if (!cleaned) {
      continue;
    }
    candidates.push({
      id: idCounter++,
      line: i + 1,
      rawText: rawLine,
      displayText: cleaned,
      cleanText: cleaned,
    });
  }

  return candidates;
}

/**
 * 提取搜索关键词词组（支持以空格分隔的多个关键词）
 */
export function parseSearchKeywords(query: string): string[] {
  if (!query) {
    return [];
  }
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((k) => k.length > 0);
}

/**
 * 过滤匹配候选条目（大小写不敏感，基于剥离前缀后的正文匹配，所有关键词均须命中）
 */
export function filterFloatingSearchCandidates(
  candidates: FloatingSearchCandidate[],
  query: string
): FloatingSearchCandidate[] {
  const keywords = parseSearchKeywords(query);
  if (keywords.length === 0) {
    return [];
  }

  return candidates.filter((item) => {
    const target = (item.cleanText || item.displayText || item.rawText).toLowerCase();
    return keywords.every((kw) => target.includes(kw));
  });
}

/**
 * 为文本中的关键词添加高亮 <mark> 标签，并自动进行 HTML 实体转义
 */
export function highlightKeywordsInHtml(text: string, query: string): string {
  if (!text) {
    return "";
  }
  const keywords = parseSearchKeywords(query);
  if (keywords.length === 0) {
    return escapeHtml(text);
  }

  // 避免正则特殊字符
  const escapedKeywords = keywords
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  if (!escapedKeywords) {
    return escapeHtml(text);
  }

  const regex = new RegExp(`(${escapedKeywords})`, "gi");
  const parts = text.split(regex);

  return parts
    .map((part) => {
      if (keywords.includes(part.toLowerCase())) {
        return `<mark class="ft-search-highlight">${escapeHtml(part)}</mark>`;
      }
      return escapeHtml(part);
    })
    .join("");
}
