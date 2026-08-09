import { describe, expect, test } from "vitest";
import {
  buildDocRefMarkdown,
  buildRelatedSuggestionSummary,
  convertKeywordsToTagItems,
  dedupeRelatedSuggestions,
  dedupeTagSuggestionItems,
  extractCleanTagsFromTitle,
  extractCleanTagsFromTitleAndContent,
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

  test("converts keywords to tag suggestion items", () => {
    expect(convertKeywordsToTagItems([" AI ", "AI", "知识库"])).toEqual([
      { tag: "AI", source: "network-lens-index", reason: "文档关键概念" },
      { tag: "知识库", source: "network-lens-index", reason: "文档关键概念" },
    ]);
  });

  test("builds related suggestion summary", () => {
    expect(buildRelatedSuggestionSummary({
      linkCount: 0,
      tagCount: 2,
      isLinkFailed: true,
      failureMessage: "AI 补链请求失败",
    })).toBe("（补链提示：AI 补链请求失败）\n已自动生成相关标签 2 个。");

    expect(buildRelatedSuggestionSummary({
      linkCount: 1,
      tagCount: 2,
    })).toBe("AI 建议添加相关链接 1 个、标签 2 个。");
  });

  test("extracts clean tags from document title", () => {
    expect(extractCleanTagsFromTitle('1.7亿人看过的万字长文——“如何在一天内彻底改变你的人生”'))
      .toEqual(['如何在一天内彻底改变你的人生', '改变人生']);

    expect(extractCleanTagsFromTitle('【硬核指南】TypeScript 高级技巧与开发实践'))
      .toEqual(['TypeScript', '高级技巧与开发实践']);

    expect(extractCleanTagsFromTitle('— - 《》')).toEqual([]);
  });

  test("extracts clean tags from document title and content headings/bold items", () => {
    const title = "1.7亿人看过的万字长文——“如何在一天内彻底改变你的人生”";
    const markdown = `# 如何在一天内彻底改变你的人生

## 建立清晰的晨间习惯
每天早上第一件事决定了你全天的精力状态...

## 2. 时间管理与执行力
**时间管理**是高效工作的核心...

## 3. 保持专注与自律
环境对行为的影响大于意志力...`;

    expect(extractCleanTagsFromTitleAndContent(title, markdown)).toEqual([
      "如何在一天内彻底改变你的人生",
      "改变人生",
      "建立清晰的晨间习惯",
      "时间管理与执行力",
      "保持专注与自律",
    ]);
  });
});
