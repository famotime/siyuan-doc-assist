import { describe, expect, test } from "vitest";
import { buildCanvasFromKeyInfoItems, preprocessItemsForCanvas, parseMarkdownToKeyInfoItems } from "@/services/canvas-generator";
import type { KeyInfoItem } from "@/core/key-info-core";

function makeItem(
  partial: Partial<KeyInfoItem> & { type: KeyInfoItem["type"] }
): KeyInfoItem {
  return {
    id: partial.id ?? `item-${Math.random().toString(16).slice(2, 8)}`,
    type: partial.type,
    text: partial.text ?? "",
    raw: partial.raw ?? partial.text ?? "",
    offset: partial.offset ?? 0,
    blockId: partial.blockId,
    blockSort: partial.blockSort ?? 0,
    order: partial.order ?? 0,
    listItem: partial.listItem,
    listPrefix: partial.listPrefix,
  };
}

function findRootNode(result: { nodes: Array<{ text: string }> }) {
  return result.nodes.find((n) => n.text.startsWith("**")) ?? result.nodes[0];
}

describe("buildCanvasFromKeyInfoItems", () => {
  test("empty items produces only root node", () => {
    const result = buildCanvasFromKeyInfoItems([], "My Doc");
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].text).toBe("**My Doc**");
    expect(result.edges).toHaveLength(0);
  });

  test("single heading becomes child of root", () => {
    const items = [
      makeItem({ type: "title", text: "Introduction", raw: "## Introduction", blockSort: 0, order: 0 }),
    ];
    const result = buildCanvasFromKeyInfoItems(items, "Doc");
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].text).toBe("**Doc**");
    expect(result.nodes[1].text).toBe("## Introduction");
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].fromNode).toBe(result.nodes[0].id);
    expect(result.edges[0].toNode).toBe(result.nodes[1].id);
  });

  test("heading with content items groups them in section text", () => {
    const items = [
      makeItem({ type: "title", text: "Chapter 1", raw: "# Chapter 1", blockSort: 0, order: 0 }),
      makeItem({ type: "bold", text: "Key point", raw: "**Key point**", blockSort: 1, order: 1 }),
      makeItem({ type: "highlight", text: "Important", raw: "==Important==", blockSort: 2, order: 2 }),
    ];
    const result = buildCanvasFromKeyInfoItems(items, "Book");
    expect(result.nodes).toHaveLength(2);
    const chapterNode = result.nodes[1];
    expect(chapterNode.text).toContain("# Chapter 1");
    expect(chapterNode.text).toContain("**Key point**");
    expect(chapterNode.text).toContain("==Important==");
  });

  test("nested headings create parent-child edges", () => {
    const items = [
      makeItem({ type: "title", text: "H1", raw: "# H1", blockSort: 0, order: 0 }),
      makeItem({ type: "title", text: "H2a", raw: "## H2a", blockSort: 1, order: 1 }),
      makeItem({ type: "title", text: "H2b", raw: "## H2b", blockSort: 2, order: 2 }),
    ];
    const result = buildCanvasFromKeyInfoItems(items, "Doc");
    expect(result.nodes).toHaveLength(4);
    expect(result.edges).toHaveLength(3);
    const root = result.nodes[0];
    const h1Node = result.nodes.find((n) => n.text === "# H1");
    const h2aNode = result.nodes.find((n) => n.text === "## H2a");
    const h2bNode = result.nodes.find((n) => n.text === "## H2b");
    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromNode: root.id, toNode: h1Node!.id }),
        expect.objectContaining({ fromNode: h1Node!.id, toNode: h2aNode!.id }),
        expect.objectContaining({ fromNode: h1Node!.id, toNode: h2bNode!.id }),
      ])
    );
  });

  test("skips child node when first H1 matches docTitle to avoid duplication", () => {
    const items = [
      makeItem({ type: "title", text: "My Doc", raw: "# My Doc", blockSort: 0, order: 0 }),
      makeItem({ type: "title", text: "Section", raw: "## Section", blockSort: 1, order: 1 }),
    ];
    const result = buildCanvasFromKeyInfoItems(items, "My Doc");
    // root node only — no duplicate H1 child node
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].text).toBe("**My Doc**");
    expect(result.nodes[1].text).toBe("## Section");
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].fromNode).toBe(result.nodes[0].id);
    expect(result.edges[0].toNode).toBe(result.nodes[1].id);
  });

  test("merges body content of skipped doc-title H1 into root", () => {
    const items = [
      makeItem({ type: "title", text: "My Doc", raw: "# My Doc", blockSort: 0, order: 0 }),
      makeItem({ type: "bold", text: "Summary", raw: "**Summary**", blockSort: 1, order: 1 }),
      makeItem({ type: "title", text: "Details", raw: "## Details", blockSort: 2, order: 2 }),
    ];
    const result = buildCanvasFromKeyInfoItems(items, "My Doc");
    const root = result.nodes[0];
    expect(root.text).toContain("**My Doc**");
    expect(root.text).toContain("**Summary**");
    expect(result.nodes.find((n) => n.text === "# My Doc")).toBeUndefined();
  });

  test("does not skip H1 that does not match docTitle", () => {
    const items = [
      makeItem({ type: "title", text: "Introduction", raw: "# Introduction", blockSort: 0, order: 0 }),
    ];
    const result = buildCanvasFromKeyInfoItems(items, "My Doc");
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].text).toBe("**My Doc**");
    expect(result.nodes[1].text).toBe("# Introduction");
  });

  test("content before first heading goes to root", () => {
    const items = [
      makeItem({ type: "bold", text: "Preamble", raw: "**Preamble**", blockSort: 0, order: 0 }),
      makeItem({ type: "title", text: "Section", raw: "## Section", blockSort: 1, order: 1 }),
    ];
    const result = buildCanvasFromKeyInfoItems(items, "Doc");
    const root = result.nodes[0];
    expect(root.text).toContain("**Doc**");
    expect(root.text).toContain("**Preamble**");
  });

  test("raw content preserved in section text", () => {
    const items = [
      makeItem({ type: "title", text: "List", raw: "## List", blockSort: 0, order: 0 }),
      makeItem({
        type: "bold",
        text: "First",
        raw: "- **First**",
        blockSort: 1,
        order: 1,
        listItem: true,
        listPrefix: "- ",
      }),
    ];
    const result = buildCanvasFromKeyInfoItems(items, "Doc");
    const listNode = result.nodes.find((n) => n.text.includes("## List"));
    expect(listNode!.text).toContain("- **First**");
  });

  test("deeply nested headings (h3 under h2 under h1)", () => {
    const items = [
      makeItem({ type: "title", text: "L1", raw: "# L1", blockSort: 0, order: 0 }),
      makeItem({ type: "title", text: "L2", raw: "## L2", blockSort: 1, order: 1 }),
      makeItem({ type: "title", text: "L3", raw: "### L3", blockSort: 2, order: 2 }),
    ];
    const result = buildCanvasFromKeyInfoItems(items, "Doc");
    expect(result.nodes).toHaveLength(4);
    expect(result.edges).toHaveLength(3);
    const root = result.nodes[0];
    const l1 = result.nodes.find((n) => n.text === "# L1");
    const l2 = result.nodes.find((n) => n.text === "## L2");
    const l3 = result.nodes.find((n) => n.text === "### L3");
    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromNode: root.id, toNode: l1!.id }),
        expect.objectContaining({ fromNode: l1!.id, toNode: l2!.id }),
        expect.objectContaining({ fromNode: l2!.id, toNode: l3!.id }),
      ])
    );
  });
});

describe("preprocessItemsForCanvas", () => {
  test("inserts H1 doc title when first item is not an H1 matching the title", () => {
    const items = [
      makeItem({ type: "bold", text: "Key point", raw: "**Key point**", blockSort: 0, order: 0 }),
    ];
    const result = preprocessItemsForCanvas(items, "My Document");
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("title");
    expect(result[0].text).toBe("My Document");
    expect(result[0].raw).toBe("# My Document");
    expect(result[1].text).toBe("Key point");
  });

  test("does not insert H1 when first item already is an H1 with matching title", () => {
    const items = [
      makeItem({ type: "title", text: "My Document", raw: "# My Document", blockSort: 0, order: 0 }),
      makeItem({ type: "bold", text: "Detail", raw: "**Detail**", blockSort: 1, order: 1 }),
    ];
    const result = preprocessItemsForCanvas(items, "My Document");
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("My Document");
    expect(result[0].raw).toBe("# My Document");
    expect(result[1].text).toBe("Detail");
  });

  test("inserts H1 when first item is an H2 (not H1)", () => {
    const items = [
      makeItem({ type: "title", text: "Section", raw: "## Section", blockSort: 0, order: 0 }),
    ];
    const result = preprocessItemsForCanvas(items, "Section");
    expect(result).toHaveLength(2);
    expect(result[0].raw).toBe("# Section");
    expect(result[1].raw).toBe("## Section");
  });

  test("inserts H1 when first item is H1 but text does not match title", () => {
    const items = [
      makeItem({ type: "title", text: "Introduction", raw: "# Introduction", blockSort: 0, order: 0 }),
    ];
    const result = preprocessItemsForCanvas(items, "My Document");
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("My Document");
    expect(result[1].text).toBe("Introduction");
  });

  test("handles empty items array", () => {
    const result = preprocessItemsForCanvas([], "Title");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("title");
    expect(result[0].raw).toBe("# Title");
  });

  test("trims whitespace when comparing title text", () => {
    const items = [
      makeItem({ type: "title", text: "  My Doc  ", raw: "# My Doc", blockSort: 0, order: 0 }),
    ];
    const result = preprocessItemsForCanvas(items, "My Doc");
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(items[0]);
  });
});

describe("parseMarkdownToKeyInfoItems", () => {
  test("parses headings and paragraphs correctly", () => {
    const md = `
# Core Concept
This is a summary of the core concept.

## Subconcept 1
Details about subconcept 1.
- bullet point

## Subconcept 2
`;
    const result = parseMarkdownToKeyInfoItems(md);
    expect(result).toHaveLength(6);

    expect(result[0].type).toBe("title");
    expect(result[0].text).toBe("Core Concept");
    expect(result[0].raw).toBe("# Core Concept");

    expect(result[1].type).toBe("remark");
    expect(result[1].text).toBe("This is a summary of the core concept.");

    expect(result[2].type).toBe("title");
    expect(result[2].text).toBe("Subconcept 1");
    expect(result[2].raw).toBe("## Subconcept 1");

    expect(result[3].type).toBe("remark");
    expect(result[3].text).toBe("Details about subconcept 1.");

    expect(result[4].type).toBe("remark");
    expect(result[4].text).toBe("- bullet point");

    expect(result[5].type).toBe("title");
    expect(result[5].text).toBe("Subconcept 2");
    expect(result[5].raw).toBe("## Subconcept 2");
  });
});

