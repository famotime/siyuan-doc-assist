import { describe, expect, test } from "vitest";
import {
  removeExtraBlankLinesFromMarkdown,
  removeTrailingWhitespaceFromMarkdown,
} from "@/core/markdown-cleanup-core";

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

  test("removes trailing spaces and tabs on each line", () => {
    const input = "a  \n\tb\t \n c\t\t";
    const result = removeTrailingWhitespaceFromMarkdown(input);
    expect(result.markdown).toBe("a\n\tb\n c");
    expect(result.changedLines).toBe(3);
    expect(result.removedChars).toBe(6);
  });

  test("keeps content when no trailing whitespace exists", () => {
    const input = "a\n b\n\tc";
    const result = removeTrailingWhitespaceFromMarkdown(input);
    expect(result.markdown).toBe(input);
    expect(result.changedLines).toBe(0);
    expect(result.removedChars).toBe(0);
  });

  test("treats blank lines with only spaces/tabs as changed lines", () => {
    const input = "a\n \t \n\t\nb";
    const result = removeTrailingWhitespaceFromMarkdown(input);
    expect(result.markdown).toBe("a\n\n\nb");
    expect(result.changedLines).toBe(2);
    expect(result.removedChars).toBe(4);
  });
});
