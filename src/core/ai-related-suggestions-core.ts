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
