import { describe, expect, test } from "vitest";
import {
  findClippedListContinuationMerges,
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

  test("returns empty delete result when current block cannot be found", () => {
    const blocks = [
      { id: "a", type: "p", content: "A", markdown: "A" },
      { id: "b", type: "p", content: "B", markdown: "B" },
    ];

    const result = findDeleteFromCurrentBlockIds(blocks, "missing");
    expect(result.deleteIds).toEqual([]);
    expect(result.deleteCount).toBe(0);
  });

  test("finds unordered and ordered clipped list marker paragraphs that should merge with next paragraph", () => {
    const blocks = [
      { id: "u1", type: "p", content: "-", markdown: "- " },
      { id: "u2", type: "p", content: "第一项", markdown: "第一项" },
      { id: "o1", type: "p", content: "1.", markdown: "1. " },
      { id: "o2", type: "p", content: "第二项", markdown: "第二项" },
      { id: "plain", type: "p", content: "普通段落", markdown: "普通段落" },
    ];

    const result = findClippedListContinuationMerges(blocks);

    expect(result.mergeCount).toBe(2);
    expect(result.merges).toEqual([
      {
        markerBlockId: "u1",
        contentBlockId: "u2",
        mergedMarkdown: "- 第一项",
      },
      {
        markerBlockId: "o1",
        contentBlockId: "o2",
        mergedMarkdown: "1. 第二项",
      },
    ]);
  });

  test("normalizes standalone bullet paragraph and ordered list marker block from clipped doc into merge candidates", () => {
    const blocks = [
      { id: "bullet", type: "p", content: "•", markdown: "•" },
      { id: "bullet-content", type: "p", content: "概念超短片", markdown: "概念超短片 " },
      { id: "ordered", type: "l", content: " ", markdown: "1." },
      { id: "ordered-content", type: "p", content: "导入 Skill", markdown: "导入 Skill " },
    ];

    const result = findClippedListContinuationMerges(blocks);

    expect(result.mergeCount).toBe(2);
    expect(result.merges).toEqual([
      {
        markerBlockId: "bullet",
        contentBlockId: "bullet-content",
        mergedMarkdown: "- 概念超短片",
      },
      {
        markerBlockId: "ordered",
        contentBlockId: "ordered-content",
        mergedMarkdown: "1. 导入 Skill",
      },
    ]);
  });
});
