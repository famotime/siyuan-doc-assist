import { describe, expect, test } from "vitest";
import {
  applyBoldToParagraphHighlights,
  applyStrikethroughToIrrelevantSegments,
  resolveBlocksAfterOpeningSeparator,
  toConfirmDetailText
} from "@/core/ai-marker-action-core";

describe("ai marker action core", () => {
  test("wraps whole paragraphs while preserving block IAL", () => {
    expect(applyStrikethroughToIrrelevantSegments("广告语\n{: id=\"p1\"}", [])).toEqual({
      markdown: "~~广告语~~\n{: id=\"p1\"}",
      markedCount: 1,
      detailLabels: []
    });
  });

  test("marks repeated sentence fragments and returns plain detail labels", () => {
    const result = applyStrikethroughToIrrelevantSegments(
      "欢迎加入交流群。欢迎加入交流群。\n{: id=\"p2\"}",
      ["欢迎加入交流群。", "欢迎加入交流群。"]
    );

    expect(result.markdown).toBe("~~欢迎加入交流群。~~~~欢迎加入交流群。~~\n{: id=\"p2\"}");
    expect(result.markedCount).toBe(2);
    expect(result.detailLabels).toEqual(["欢迎加入交流群。", "欢迎加入交流群。"]);
  });

  test("skips whole mixed paragraphs with multiple sentence-like units", () => {
    const markdown = "这里是核心正文。关注公众号。后续继续说明正文重点。";
    expect(applyStrikethroughToIrrelevantSegments(markdown, [markdown])).toEqual({
      markdown,
      markedCount: 0,
      detailLabels: []
    });
  });

  test("applies bold highlights with loose spacing and avoids existing bold", () => {
    expect(applyBoldToParagraphHighlights(
      "最后建议先做小范围试点，再强调 **评测闭环**。\n{: id=\"p1\"}",
      ["小范围 试点", "评测闭环"]
    )).toBe("最后建议先做**小范围试点**，再强调 **评测闭环**。\n{: id=\"p1\"}");
  });

  test("uses content after an opening separator within the first ten blocks", () => {
    const blocks = [
      { id: "intro", markdown: "说明" },
      { id: "sep", markdown: "---" },
      { id: "body", markdown: "正文" }
    ];

    expect(resolveBlocksAfterOpeningSeparator(blocks).map((item) => item.id)).toEqual(["body"]);
  });

  test("normalizes confirm detail text", () => {
    expect(toConfirmDetailText("~~**关注公众号**，[链接](siyuan://blocks/a)~~\n{: id=\"p1\"}"))
      .toBe("关注公众号，链接");
  });
});
