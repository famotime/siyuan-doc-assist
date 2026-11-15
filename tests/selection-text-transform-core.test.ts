import { describe, expect, test } from "vitest";
import {
  buildLinebreakToggleMode,
  buildPunctuationUpdates,
  convertSingleLineBreaksToParagraphMarks,
  countSingleLineBreaks,
  removeSpaceLikeChars
} from "@/core/selection-text-transform-core";

describe("selection text transform core", () => {
  test("counts and converts only single line breaks", () => {
    expect(countSingleLineBreaks("a\nb\n\nc")).toBe(1);
    expect(convertSingleLineBreaksToParagraphMarks("a\nb\n\nc")).toBe("a\n\nb\n\nc");
  });

  test("detects paragraph-to-line mode for multiple paragraph blocks without single breaks", () => {
    expect(buildLinebreakToggleMode([
      { type: "p", markdown: "第一段" },
      { type: "paragraph", markdown: "第二段" }
    ])).toBe("paragraph-to-line");
    expect(buildLinebreakToggleMode([{ type: "p", markdown: "第一行\n第二行" }])).toBe("linebreak-to-paragraph");
  });

  test("removes unicode space-like characters", () => {
    expect(removeSpaceLikeChars("a b\t中　文")).toEqual({ next: "ab中文", removedCount: 3 });
  });

  test("builds punctuation updates and reports missing sources", () => {
    const result = buildPunctuationUpdates(["a", "missing"], new Map([["a", "你好, world!"]]));
    expect(result.missingSourceCount).toBe(1);
    expect(result.updates).toEqual([{ id: "a", next: "你好， world！", changedCount: 2 }]);
  });
});
