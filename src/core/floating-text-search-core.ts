import { escapeHtml } from "./floating-text-core";

export interface FloatingSearchCandidate {
  id: number;
  line: number;
  rawText: string;
  displayText: string;
}

/**
 * 将长文本按非空行切分为检索候选条目，保留原始内容（含 Markdown 标记与缩进）
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
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }
    candidates.push({
      id: idCounter++,
      line: i + 1,
      rawText: rawLine,
      displayText: trimmed,
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
 * 过滤匹配候选条目（大小写不敏感，所有关键词均须命中）
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
    const lower = item.rawText.toLowerCase();
    return keywords.every((kw) => lower.includes(kw));
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
