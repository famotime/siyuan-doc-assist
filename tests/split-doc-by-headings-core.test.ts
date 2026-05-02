import { describe, expect, test } from "vitest";
import { splitDocByHeadingsCore, type SplitSection } from "@/core/split-doc-by-headings-core";
import type { ChildBlockMeta } from "@/services/kernel-block";

function block(id: string, type: string, markdown: string): ChildBlockMeta {
  return { id, type, content: markdown, markdown };
}

describe("splitDocByHeadingsCore", () => {
  test("returns empty sections when no headings exist", () => {
    const blocks: ChildBlockMeta[] = [
      block("b1", "p", "paragraph one"),
      block("b2", "p", "paragraph two"),
    ];
    const result = splitDocByHeadingsCore(blocks);
    expect(result.sections).toEqual([]);
    expect(result.preHeadingBlockIds).toEqual(["b1", "b2"]);
    expect(result.highestLevel).toBe(0);
  });

  test("detects highest heading level as minimum # count", () => {
    const blocks: ChildBlockMeta[] = [
      block("b1", "h", "## Heading A"),
      block("b2", "p", "content A"),
      block("b3", "h", "### Sub A1"),
      block("b4", "p", "sub content"),
      block("b5", "h", "## Heading B"),
      block("b6", "p", "content B"),
    ];
    const result = splitDocByHeadingsCore(blocks);
    expect(result.highestLevel).toBe(2);
    expect(result.sections).toHaveLength(2);
  });

  test("groups blocks into sections by highest-level headings", () => {
    const blocks: ChildBlockMeta[] = [
      block("b1", "h", "## Section One"),
      block("b2", "p", "para 1a"),
      block("b3", "p", "para 1b"),
      block("b4", "h", "## Section Two"),
      block("b5", "p", "para 2a"),
      block("b6", "h", "## Section Three"),
    ];
    const result = splitDocByHeadingsCore(blocks);
    expect(result.sections).toHaveLength(3);
    expect(result.sections[0]).toMatchObject({
      title: "Section One",
      blockIds: ["b1", "b2", "b3"],
      markdown: "para 1a\n\npara 1b",
    });
    expect(result.sections[1]).toMatchObject({
      title: "Section Two",
      blockIds: ["b4", "b5"],
      markdown: "para 2a",
    });
    expect(result.sections[2]).toMatchObject({
      title: "Section Three",
      blockIds: ["b6"],
      markdown: "",
    });
  });

  test("collects pre-heading blocks into preHeadingBlockIds", () => {
    const blocks: ChildBlockMeta[] = [
      block("b0", "p", "intro paragraph"),
      block("b1", "h", "## Section One"),
      block("b2", "p", "content"),
      block("b3", "h", "## Section Two"),
      block("b4", "p", "more content"),
    ];
    const result = splitDocByHeadingsCore(blocks);
    expect(result.preHeadingBlockIds).toEqual(["b0"]);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].blockIds).toEqual(["b1", "b2"]);
  });

  test("handles only one highest-level heading (single section)", () => {
    const blocks: ChildBlockMeta[] = [
      block("b1", "h", "## Only Section"),
      block("b2", "p", "content"),
    ];
    const result = splitDocByHeadingsCore(blocks);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].title).toBe("Only Section");
  });

  test("strips bold markers from heading title", () => {
    const blocks: ChildBlockMeta[] = [
      block("b1", "h", "## **Bold Title**"),
      block("b2", "p", "content"),
      block("b3", "h", "## Normal Title"),
      block("b4", "p", "more"),
    ];
    const result = splitDocByHeadingsCore(blocks);
    expect(result.sections[0].title).toBe("Bold Title");
    expect(result.sections[1].title).toBe("Normal Title");
  });

  test("keeps sub-headings within their parent section", () => {
    const blocks: ChildBlockMeta[] = [
      block("b1", "h", "## Chapter 1"),
      block("b2", "p", "intro 1"),
      block("b3", "h", "### Detail 1.1"),
      block("b4", "p", "detail content"),
      block("b5", "h", "## Chapter 2"),
      block("b6", "p", "intro 2"),
      block("b7", "h", "### Detail 2.1"),
      block("b8", "p", "more detail"),
    ];
    const result = splitDocByHeadingsCore(blocks);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].blockIds).toEqual(["b1", "b2", "b3", "b4"]);
    expect(result.sections[1].blockIds).toEqual(["b5", "b6", "b7", "b8"]);
    expect(result.sections[0].markdown).toBe(
      "intro 1\n\n### Detail 1.1\n\ndetail content"
    );
  });

  test("handles all h1 headings", () => {
    const blocks: ChildBlockMeta[] = [
      block("b1", "h", "# Title One"),
      block("b2", "p", "content one"),
      block("b3", "h", "# Title Two"),
      block("b4", "p", "content two"),
    ];
    const result = splitDocByHeadingsCore(blocks);
    expect(result.highestLevel).toBe(1);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].title).toBe("Title One");
  });

  test("strips leading whitespace from heading markdown", () => {
    const blocks: ChildBlockMeta[] = [
      block("b1", "h", "  ## Spaced Heading"),
      block("b2", "p", "content"),
      block("b3", "h", "## Normal"),
      block("b4", "p", "more"),
    ];
    const result = splitDocByHeadingsCore(blocks);
    expect(result.sections[0].title).toBe("Spaced Heading");
  });
});
