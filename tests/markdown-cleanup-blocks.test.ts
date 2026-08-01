import { describe, expect, test } from "vitest";
import {
  findClippedListContinuationMerges,
  findExtraBlankParagraphIds,
  findHeadingMissingBlankParagraphBeforeIds,
  findDeleteFromCurrentBlockIds,
  findDeleteFromStartToCurrentBlockIds,
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

describe("findDeleteFromStartToCurrentBlockIds", () => {
  test("deletes from start to current block (no separator)", () => {
    const blocks = [
      { id: "a", markdown: "A" },
      { id: "b", markdown: "B" },
      { id: "c", markdown: "C" },
      { id: "d", markdown: "D" },
    ];

    const result = findDeleteFromStartToCurrentBlockIds(blocks, "c");
    expect(result.deleteIds).toEqual(["a", "b", "c"]);
    expect(result.deleteCount).toBe(3);
  });

  test("preserves separator and blocks before it", () => {
    const blocks = [
      { id: "summary", markdown: "摘要内容" },
      { id: "sep", markdown: "---" },
      { id: "a", markdown: "正文A" },
      { id: "b", markdown: "正文B" },
      { id: "c", markdown: "正文C" },
    ];

    const result = findDeleteFromStartToCurrentBlockIds(blocks, "b");
    expect(result.deleteIds).toEqual(["a", "b"]);
    expect(result.deleteCount).toBe(2);
  });

  test("preserves last separator and blocks before it when multiple separators exist in first 10 blocks", () => {
    const blocks = [
      { id: "summary1", markdown: "摘要1" },
      { id: "sep1", markdown: "---" },
      { id: "summary2", markdown: "摘要2" },
      { id: "sep2", markdown: "---" },
      { id: "a", markdown: "正文A" },
      { id: "b", markdown: "正文B" },
      { id: "c", markdown: "正文C" },
    ];

    const result = findDeleteFromStartToCurrentBlockIds(blocks, "b");
    expect(result.deleteIds).toEqual(["a", "b"]);
    expect(result.deleteCount).toBe(2);
  });

  test("separator at position 0 preserves nothing before it", () => {
    const blocks = [
      { id: "sep", markdown: "---" },
      { id: "a", markdown: "A" },
      { id: "b", markdown: "B" },
    ];

    const result = findDeleteFromStartToCurrentBlockIds(blocks, "b");
    expect(result.deleteIds).toEqual(["a", "b"]);
    expect(result.deleteCount).toBe(2);
  });

  test("separator beyond first 10 blocks is ignored", () => {
    const blocks = [
      { id: "b01", markdown: "1" },
      { id: "b02", markdown: "2" },
      { id: "b03", markdown: "3" },
      { id: "b04", markdown: "4" },
      { id: "b05", markdown: "5" },
      { id: "b06", markdown: "6" },
      { id: "b07", markdown: "7" },
      { id: "b08", markdown: "8" },
      { id: "b09", markdown: "9" },
      { id: "b10", markdown: "10" },
      { id: "sep", markdown: "---" },
      { id: "target", markdown: "T" },
    ];

    const result = findDeleteFromStartToCurrentBlockIds(blocks, "target");
    expect(result.deleteIds).toEqual([
      "b01", "b02", "b03", "b04", "b05",
      "b06", "b07", "b08", "b09", "b10",
      "sep", "target",
    ]);
    expect(result.deleteCount).toBe(12);
  });

  test("returns empty when current block is before separator", () => {
    const blocks = [
      { id: "a", markdown: "A" },
      { id: "sep", markdown: "---" },
      { id: "b", markdown: "B" },
    ];

    const result = findDeleteFromStartToCurrentBlockIds(blocks, "a");
    expect(result.deleteIds).toEqual([]);
    expect(result.deleteCount).toBe(0);
  });

  test("returns empty when current block not found", () => {
    const blocks = [
      { id: "a", markdown: "A" },
      { id: "b", markdown: "B" },
    ];

    const result = findDeleteFromStartToCurrentBlockIds(blocks, "missing");
    expect(result.deleteIds).toEqual([]);
    expect(result.deleteCount).toBe(0);
  });

  test("returns empty when currentBlockId is empty", () => {
    const blocks = [{ id: "a", markdown: "A" }];
    const result = findDeleteFromStartToCurrentBlockIds(blocks, "");
    expect(result.deleteIds).toEqual([]);
    expect(result.deleteCount).toBe(0);
  });

  test("current block is the only block after separator", () => {
    const blocks = [
      { id: "summary", markdown: "概要" },
      { id: "sep", markdown: " --- " },
      { id: "only", markdown: "正文" },
    ];

    const result = findDeleteFromStartToCurrentBlockIds(blocks, "only");
    expect(result.deleteIds).toEqual(["only"]);
    expect(result.deleteCount).toBe(1);
  });
});
