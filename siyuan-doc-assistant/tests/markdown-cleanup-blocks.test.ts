import { describe, expect, test } from "vitest";
import {
  findExtraBlankParagraphIds,
  findHeadingMissingBlankParagraphBeforeIds,
  findDeleteFromCurrentBlockIds,
} from "@/core/markdown-cleanup-core";

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

  test("skips unresolved paragraphs to avoid accidental deletion", () => {
    const blocks = [
      { id: "a", type: "p", content: "", markdown: "", resolved: false },
      { id: "b", type: "p", content: "", markdown: "", resolved: true },
    ];

    const result = findExtraBlankParagraphIds(blocks);
    expect(result.deleteIds).toEqual(["b"]);
  });

  test("finds headings that are missing a blank paragraph before them", () => {
    const blocks = [
      { id: "h1", type: "h", content: "H1", markdown: "# H1" },
      { id: "p1", type: "p", content: "正文", markdown: "正文" },
      { id: "h2", type: "h", content: "H2", markdown: "## H2" },
      { id: "blank", type: "p", content: "", markdown: "" },
      { id: "h3", type: "h", content: "H3", markdown: "### H3" },
      { id: "h4", type: "h", content: "H4", markdown: "#### H4" },
      { id: "blank2", type: "p", content: "\u00A0", markdown: "" },
      { id: "h5", type: "h", content: "H5", markdown: "##### H5" },
    ];

    const result = findHeadingMissingBlankParagraphBeforeIds(blocks);
    expect(result.insertBeforeIds).toEqual(["h2", "h4"]);
    expect(result.insertCount).toBe(2);
  });

  test("collects delete ids from current block to end", () => {
    const blocks = [
      { id: "a", type: "p", content: "A", markdown: "A" },
      { id: "b", type: "h", content: "B", markdown: "# B" },
      { id: "c", type: "p", content: "C", markdown: "C" },
      { id: "d", type: "p", content: "D", markdown: "D" },
    ];

    const result = findDeleteFromCurrentBlockIds(blocks, "b");
    expect(result.deleteIds).toEqual(["b", "c", "d"]);
    expect(result.deleteCount).toBe(3);
  });
});
