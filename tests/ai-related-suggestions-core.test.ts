import { describe, expect, test } from "vitest";
import {
  buildDocRefMarkdown,
  dedupeRelatedSuggestions,
  dedupeTagSuggestionItems,
  mergeTags,
  normalizeRelatedSuggestionPayload,
  parseTagAttr,
} from "@/core/ai-related-suggestions-core";

describe("ai related suggestions core", () => {
  test("normalizes and filters suggestion payloads", () => {
    expect(normalizeRelatedSuggestionPayload({
      summary: "  建议  ",
      suggestions: [
        {
          targetDocumentId: " doc-1 ",
          targetTitle: " 标题 ",
          confidence: " high ",
          tagSuggestions: [{ tag: " AI ", source: " existing " }, { tag: "" }],
        },
        { targetDocumentId: "missing-title" },
      ],
    })).toEqual({
      summary: "建议",
      suggestions: [
        {
          targetDocumentId: "doc-1",
          targetTitle: "标题",
          confidence: "high",
          reason: undefined,
          tagSuggestions: [{ tag: "AI", source: "existing", reason: undefined }],
        },
      ],
      tagSuggestions: [],
    });
  });

  test("dedupes links and tags preserving first occurrence", () => {
    const suggestions = [
      { targetDocumentId: "a", targetTitle: "A", tagSuggestions: [] },
      { targetDocumentId: "a", targetTitle: "A2", tagSuggestions: [] },
      { targetDocumentId: "b", targetTitle: "B", tagSuggestions: [] },
    ];

    expect(dedupeRelatedSuggestions(suggestions).map((item) => item.targetTitle)).toEqual(["A", "B"]);
    expect(dedupeTagSuggestionItems([
      { tag: "AI", source: "existing" },
      { tag: "ai", source: "new" },
      { tag: "知识管理" },
    ])).toEqual([
      { tag: "AI", source: "existing" },
      { tag: "知识管理" },
    ]);
  });

  test("builds ref markdown and merges tag attributes", () => {
    expect(buildDocRefMarkdown("target", 'A "quoted" title')).toBe('((target "A \\"quoted\\" title"))');
    expect(parseTagAttr("#已有标签, AI  知识管理")).toEqual(["已有标签", "AI", "知识管理"]);
    expect(mergeTags(["已有标签", "AI"], ["ai", "新标签"])).toEqual(["已有标签", "AI", "新标签"]);
  });
});
