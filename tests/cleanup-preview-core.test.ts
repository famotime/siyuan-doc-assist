import { describe, expect, test } from "vitest";
import {
  isHighRiskForMarkdownWrite,
  isThematicBreakBlock,
  previewAiOutputCleanup,
  previewStrikethroughCleanup
} from "@/core/cleanup-preview-core";

describe("isHighRiskForMarkdownWrite", () => {
  test("flags inline memo and data memo markers", () => {
    expect(isHighRiskForMarkdownWrite("text {: inline-memo='x'}")).toBe(true);
    expect(isHighRiskForMarkdownWrite('<span data-inline-memo-content="x">')).toBe(true);
    expect(isHighRiskForMarkdownWrite('<span data-memo-content="x">')).toBe(true);
    expect(isHighRiskForMarkdownWrite("<span data-memo='x'>")).toBe(true);
  });

  test("flags block reference with inline attributes", () => {
    expect(isHighRiskForMarkdownWrite("((block-id)){: parent'}")).toBe(true);
  });

  test("returns false for plain markdown and empty values", () => {
    expect(isHighRiskForMarkdownWrite("普通 **markdown** 文本")).toBe(false);
    expect(isHighRiskForMarkdownWrite("")).toBe(false);
  });
});

describe("isThematicBreakBlock", () => {
  test("detects divider block types", () => {
    expect(isThematicBreakBlock({ type: "b" })).toBe(true);
    expect(isThematicBreakBlock({ type: "tb" })).toBe(true);
    expect(isThematicBreakBlock({ type: "nodethematicbreak" })).toBe(true);
  });

  test("detects markdown horizontal rules", () => {
    expect(isThematicBreakBlock({ type: "p", markdown: "---" })).toBe(true);
    expect(isThematicBreakBlock({ type: "p", markdown: "***" })).toBe(true);
    expect(isThematicBreakBlock({ type: "p", markdown: "- - -" })).toBe(true);
  });

  test("rejects normal paragraphs", () => {
    expect(isThematicBreakBlock({ type: "p", markdown: "普通段落" })).toBe(false);
    expect(isThematicBreakBlock({ type: "p", markdown: "--- 不是分割线" })).toBe(false);
  });
});

describe("previewAiOutputCleanup", () => {
  test("counts artifact removals per category", () => {
    const preview = previewAiOutputCleanup([
      { id: "1", type: "p", markdown: "正文^^上标^^ 结束" }
    ]);
    expect(preview.cleanableBlockCount).toBe(1);
    expect(preview.removedCaretCount).toBe(2);
    expect(preview.riskyPendingBlockCount).toBe(0);
  });

  test("treats thematic break blocks as cleanable dividers", () => {
    const preview = previewAiOutputCleanup([{ id: "d1", type: "b", markdown: "" }]);
    expect(preview.cleanableBlockCount).toBe(1);
    expect(preview.removedDividerCount).toBe(1);
  });

  test("counts risky blocks without cleaning them", () => {
    const preview = previewAiOutputCleanup([
      { id: "r1", type: "p", markdown: "备注^^上标^^ {: inline-memo='x'}" }
    ]);
    expect(preview.riskyPendingBlockCount).toBe(1);
    expect(preview.cleanableBlockCount).toBe(0);
    expect(preview.removedCaretCount).toBe(0);
  });

  test("skips blocks without changes and empty non-divider blocks", () => {
    const preview = previewAiOutputCleanup([
      { id: "e1", type: "p", markdown: "" },
      { id: "k1", type: "p", markdown: "无人工痕迹的文本" }
    ]);
    expect(preview.cleanableBlockCount).toBe(0);
    expect(preview.riskyPendingBlockCount).toBe(0);
  });
});

describe("previewStrikethroughCleanup", () => {
  test("counts strikethrough removals", () => {
    const preview = previewStrikethroughCleanup([
      { id: "1", markdown: "~~口水内容~~ 保留" }
    ]);
    expect(preview.cleanableBlockCount).toBe(1);
    expect(preview.removedCount).toBeGreaterThan(0);
    expect(preview.riskyPendingBlockCount).toBe(0);
  });

  test("counts risky strikethrough blocks separately", () => {
    const preview = previewStrikethroughCleanup([
      { id: "r1", markdown: "~~口水~~ {: inline-memo='x'}" }
    ]);
    expect(preview.riskyPendingBlockCount).toBe(1);
    expect(preview.cleanableBlockCount).toBe(0);
  });

  test("skips blocks without strikethrough content", () => {
    const preview = previewStrikethroughCleanup([
      { id: "k1", markdown: "没有删除线" },
      { id: "e1", markdown: "" }
    ]);
    expect(preview.cleanableBlockCount).toBe(0);
    expect(preview.removedCount).toBe(0);
  });
});
