import { describe, expect, test } from "vitest";
import { findExtraBlankParagraphIds } from "@/core/markdown-cleanup-core";

describe("markdown-cleanup-core (blocks)", () => {
  test("removes all blank paragraphs", () => {
    const blocks = [
      { id: "a", type: "p", content: "", markdown: "" },
      { id: "b", type: "p", content: " ", markdown: "" },
      { id: "c", type: "p", content: "text", markdown: "text" },
      { id: "d", type: "p", content: "", markdown: "" },
      { id: "e", type: "p", content: "", markdown: "" },
    ];

    const result = findExtraBlankParagraphIds(blocks);
    expect(result.deleteIds).toEqual(["a", "b", "d", "e"]);
    expect(result.keptBlankIds).toEqual([]);
    expect(result.removedCount).toBe(4);
  });

  test("removes blank paragraphs across non-paragraph blocks", () => {
    const blocks = [
      { id: "a", type: "p", content: "", markdown: "" },
      { id: "b", type: "h", content: "Title", markdown: "Title" },
      { id: "c", type: "p", content: "", markdown: "" },
      { id: "d", type: "p", content: "", markdown: "" },
    ];

    const result = findExtraBlankParagraphIds(blocks);
    expect(result.deleteIds).toEqual(["a", "c", "d"]);
    expect(result.keptBlankIds).toEqual([]);
  });

  test("treats invisible whitespace as blank", () => {
    const blocks = [
      { id: "a", type: "p", content: "\u200B", markdown: "" },
      { id: "b", type: "p", content: "\u00A0", markdown: "\u3000" },
      { id: "c", type: "p", content: "x", markdown: "" },
    ];

    const result = findExtraBlankParagraphIds(blocks);
    expect(result.deleteIds).toEqual(["a", "b"]);
    expect(result.keptBlankIds).toEqual([]);
  });

  test("treats html-only content as blank", () => {
    const blocks = [
      { id: "a", type: "p", content: "<br>", markdown: "<br />" },
      { id: "b", type: "p", content: "&nbsp;", markdown: "&#160;" },
      { id: "c", type: "p", content: "<span>text</span>", markdown: "text" },
    ];

    const result = findExtraBlankParagraphIds(blocks);
    expect(result.deleteIds).toEqual(["a", "b"]);
  });
});
