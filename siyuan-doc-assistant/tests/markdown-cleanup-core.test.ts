import { describe, expect, test } from "vitest";
import { removeExtraBlankLinesFromMarkdown } from "@/core/markdown-cleanup-core";

describe("markdown-cleanup-core", () => {
  test("collapses consecutive blank lines into one", () => {
    const input = "a\n\n\nb\n\n\n\nc";
    const result = removeExtraBlankLinesFromMarkdown(input);
    expect(result.markdown).toBe("a\n\nb\n\nc");
    expect(result.removedLines).toBe(3);
  });

  test("keeps single blank lines between paragraphs", () => {
    const input = "a\n\nb\n\nc";
    const result = removeExtraBlankLinesFromMarkdown(input);
    expect(result.markdown).toBe(input);
    expect(result.removedLines).toBe(0);
  });

  test("preserves blank lines inside fenced code blocks", () => {
    const input = "a\n\n```\nline1\n\nline2\n```\n\n\nb";
    const result = removeExtraBlankLinesFromMarkdown(input);
    expect(result.markdown).toBe("a\n\n```\nline1\n\nline2\n```\n\nb");
    expect(result.removedLines).toBe(1);
  });

  test("treats whitespace-only lines as blank", () => {
    const input = "a\n \n\nb";
    const result = removeExtraBlankLinesFromMarkdown(input);
    expect(result.markdown).toBe("a\n\nb");
    expect(result.removedLines).toBe(1);
  });

  test("treats zero-width and non-breaking spaces as blank", () => {
    const input = `a\n\u200B\n\u00A0\n\nb`;
    const result = removeExtraBlankLinesFromMarkdown(input);
    expect(result.markdown).toBe("a\n\nb");
    expect(result.removedLines).toBe(2);
  });
});
