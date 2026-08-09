export type TagSuggestionItem = {
  tag: string;
  source?: string;
  reason?: string;
};

export type RelatedSuggestion = {
  targetDocumentId: string;
  targetTitle: string;
  confidence?: string;
  reason?: string;
  tagSuggestions: TagSuggestionItem[];
};

export type RelatedSuggestionPayload = {
  summary: string;
  suggestions: RelatedSuggestion[];
  tagSuggestions: TagSuggestionItem[];
};

export function normalizeRelatedSuggestionPayload(value: unknown): RelatedSuggestionPayload {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const suggestions = Array.isArray(source.suggestions)
    ? source.suggestions
      .map(normalizeRelatedSuggestion)
      .filter((item): item is RelatedSuggestion => Boolean(item))
    : [];
  const tagSuggestions = Array.isArray(source.tagSuggestions)
    ? source.tagSuggestions
      .map(normalizeTagSuggestion)
      .filter((item): item is TagSuggestionItem => Boolean(item))
    : [];
  return {
    summary: typeof source.summary === "string" ? source.summary.trim() : "",
    suggestions,
    tagSuggestions,
  };
}

function normalizeRelatedSuggestion(value: unknown): RelatedSuggestion | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Record<string, unknown>;
  const targetDocumentId = typeof source.targetDocumentId === "string" ? source.targetDocumentId.trim() : "";
  const targetTitle = typeof source.targetTitle === "string" ? source.targetTitle.trim() : "";
  if (!targetDocumentId || !targetTitle) {
    return null;
  }
  const tagSuggestions = Array.isArray(source.tagSuggestions)
    ? source.tagSuggestions
      .map(normalizeTagSuggestion)
      .filter((item): item is RelatedSuggestion["tagSuggestions"][number] => Boolean(item))
    : [];
  return {
    targetDocumentId,
    targetTitle,
    confidence: typeof source.confidence === "string" ? source.confidence.trim() : undefined,
    reason: typeof source.reason === "string" ? source.reason.trim() : undefined,
    tagSuggestions,
  };
}

function normalizeTagSuggestion(value: unknown): RelatedSuggestion["tagSuggestions"][number] | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Record<string, unknown>;
  const tag = typeof source.tag === "string" ? source.tag.trim() : "";
  if (!tag) {
    return null;
  }
  return {
    tag,
    source: typeof source.source === "string" ? source.source.trim() : undefined,
    reason: typeof source.reason === "string" ? source.reason.trim() : undefined,
  };
}

export function dedupeRelatedSuggestions(suggestions: RelatedSuggestion[]): RelatedSuggestion[] {
  const seen = new Set<string>();
  const result: RelatedSuggestion[] = [];
  for (const suggestion of suggestions) {
    if (seen.has(suggestion.targetDocumentId)) {
      continue;
    }
    seen.add(suggestion.targetDocumentId);
    result.push(suggestion);
  }
  return result;
}

export function dedupeTagSuggestionItems(
  items: RelatedSuggestion["tagSuggestions"]
): RelatedSuggestion["tagSuggestions"] {
  const seen = new Set<string>();
  const result: RelatedSuggestion["tagSuggestions"] = [];
  for (const item of items) {
    const key = item.tag.toLocaleLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function buildDocRefMarkdown(documentId: string, title: string): string {
  const escaped = title.replace(/"/gu, "\\\"");
  return `((${documentId} "${escaped}"))`;
}

export function parseTagAttr(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }
  return value.split(/[,\s#]+/u).map((item) => item.trim()).filter(Boolean);
}

export function mergeTags(baseTags: string[], extraTags: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const rawTag of [...baseTags, ...extraTags]) {
    const tag = rawTag.trim();
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(tag);
  }
  return result;
}

export function convertKeywordsToTagItems(
  keywords: string[],
  source = "network-lens-index",
  reason = "文档关键概念"
): TagSuggestionItem[] {
  return dedupeTagSuggestionItems(
    keywords
      .map((kw) => kw.trim())
      .filter(Boolean)
      .map((tag) => ({
        tag,
        source,
        reason,
      }))
  );
}

export function buildRelatedSuggestionSummary(params: {
  payloadSummary?: string;
  linkCount: number;
  tagCount: number;
  isLinkFailed?: boolean;
  failureMessage?: string;
}): string {
  if (params.payloadSummary?.trim()) {
    return params.payloadSummary.trim();
  }
  if (params.linkCount > 0 && params.tagCount > 0) {
    return `AI 建议添加相关链接 ${params.linkCount} 个、标签 ${params.tagCount} 个。`;
  }
  if (params.linkCount > 0) {
    return `AI 建议添加相关链接 ${params.linkCount} 个。`;
  }
  if (params.tagCount > 0) {
    if (params.isLinkFailed) {
      const note = params.failureMessage?.trim()
        ? `（补链提示：${params.failureMessage.trim()}）\n`
        : "（补链未能获取相关文档）\n";
      return `${note}已自动生成相关标签 ${params.tagCount} 个。`;
    }
    return `AI 建议添加相关标签 ${params.tagCount} 个。`;
  }
  return "AI 未返回可添加的相关链接或标签。";
}

export function extractCleanTagsFromTitle(title?: string): string[] {
  if (!title || typeof title !== "string" || !title.trim() || title.trim() === "未命名文档") {
    return [];
  }

  const raw = title.trim();
  let cleaned = raw
    .replace(/^[\d.万亿kK]+\s*[人次阅读看过浏览赞]*[的之]?[万千百字]*[长短文章报告指南]*[—\-:_|～~=]+/u, "")
    .replace(/^【[^】]+】|^\[[^\]]+\]|^《[^》]+》/u, "")
    .replace(/["'“”‘’《》【】\[\]]/gu, " ")
    .trim();

  cleaned = cleaned.replace(/^[—\-:_|～~=,，;；\s]+/u, "").trim();

  const parts = cleaned
    .split(/[—\-:_|～~=,，;；\s]+/u)
    .map((p) => p.replace(/[—\-:_|～~=]/gu, "").trim())
    .filter((p) => p.length >= 2 && p.length <= 15);

  const tags: string[] = [];

  if (parts.length > 0) {
    for (const p of parts) {
      if (p.length >= 2 && p.length <= 15) {
        tags.push(p);
      }
    }
  }

  const fallbackClean = raw.replace(/[—\-:_|～~="'“”‘’《》【】\[\]]/gu, "").trim();
  if (fallbackClean.length >= 2 && fallbackClean.length <= 15 && !tags.includes(fallbackClean)) {
    tags.push(fallbackClean);
  }

  if (tags.length === 1 && tags[0].length > 8) {
    const longTag = tags[0];
    const corePhrase = longTag
      .replace(/如何在|怎样在|一天内|彻底|你的|我的|如何|怎样/gu, "")
      .trim();
    if (corePhrase.length >= 2 && corePhrase.length <= 10 && !tags.includes(corePhrase)) {
      tags.push(corePhrase);
    }
  }

  return Array.from(new Set(tags)).slice(0, 3);
}

const IGNORED_HEADING_TITLES = new Set([
  "目录",
  "前言",
  "引言",
  "总结",
  "结语",
  "后记",
  "小结",
  "概览",
  "背景",
  "注意事项",
  "参考资料",
  "参考文献",
  "附录",
  "overview",
  "summary",
  "introduction",
  "conclusion",
  "background",
  "references",
  "appendix",
  "table of contents",
]);

export function extractCleanTagsFromTitleAndContent(
  title?: string,
  markdown?: string
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const addCandidate = (candidate?: string) => {
    if (!candidate || typeof candidate !== "string") {
      return;
    }
    const clean = candidate.trim().replace(/^#+\s*/u, "").replace(/["'“”‘’《》【】\[\]]/gu, "").trim();
    if (!clean || clean.length < 2 || clean.length > 15) {
      return;
    }
    const lower = clean.toLowerCase();
    if (IGNORED_HEADING_TITLES.has(lower) || seen.has(lower)) {
      return;
    }
    seen.add(lower);
    result.push(clean);
  };

  // 1. 从标题提炼
  const titleTags = extractCleanTagsFromTitle(title);
  for (const tag of titleTags) {
    addCandidate(tag);
  }

  if (!markdown || typeof markdown !== "string" || !markdown.trim()) {
    return result;
  }

  // 2. 从 Markdown 标题层级 (# / ## / ###) 中提取
  const headingMatches = markdown.matchAll(/^#{1,4}\s+(.+)$/gm);
  for (const match of headingMatches) {
    const rawHeading = match[1];
    if (!rawHeading) {
      continue;
    }
    const cleanedHeading = rawHeading
      .replace(/^[\d\.、一二三四五六七八九十]+\s*/u, "")
      .replace(/^（[一二三四五六七八九十\d]+）\s*/u, "")
      .replace(/^【[^】]+】|^\[[^\]]+\]|^《[^》]+》/u, "")
      .replace(/[\*\_`]/g, "")
      .trim();

    addCandidate(cleanedHeading);
    if (result.length >= 5) {
      break;
    }
  }

  // 3. 如果标签数仍不足 3 个，从加粗关键词 (**xxx**) 中补充
  if (result.length < 3) {
    const boldMatches = markdown.matchAll(/\*\*([^\*\n]{2,12})\*\*/g);
    for (const match of boldMatches) {
      const boldText = match[1]?.trim();
      addCandidate(boldText);
      if (result.length >= 5) {
        break;
      }
    }
  }

  return result.slice(0, 5);
}



