import { describe, expect, test } from "vitest";
import {
  buildBacklinkListMarkdown,
  buildChildDocListMarkdown,
  dedupeDocRefs,
  extractSiyuanBlockIdsFromMarkdown,
  filterDocRefsByMarkdown,
} from "@/core/link-core";

describe("link-core", () => {
  test("extracts both block refs and siyuan links from markdown", () => {
    const markdown = [
      "See ((20260101101010-abcdef1)).",
      "[doc](siyuan://blocks/20260101101010-abcdef1)",
      "[other](siyuan://blocks/20260202121212-bcdefg2)",
      "((20260202121212-bcdefg2 'alias'))",
      "[[20260303131313-cdefgh3]]",
    ].join("\n");

    expect(extractSiyuanBlockIdsFromMarkdown(markdown)).toEqual([
      "20260101101010-abcdef1",
      "20260202121212-bcdefg2",
      "20260303131313-cdefgh3",
    ]);
  });

  test("dedupes doc refs by id and keeps first item metadata", () => {
    const items = [
      { id: "a", name: "A", hPath: "/A", box: "box" },
      { id: "a", name: "A2", hPath: "/A2", box: "box" },
      { id: "b", name: "B", hPath: "/B", box: "box" },
    ];

    expect(dedupeDocRefs(items)).toEqual([
      { id: "a", name: "A", hPath: "/A", box: "box" },
      { id: "b", name: "B", hPath: "/B", box: "box" },
    ]);
  });

  test("builds backlink markdown section with siyuan links", () => {
    const text = buildBacklinkListMarkdown([
      { id: "doc1", name: "First" },
      { id: "doc2", name: "Second" },
    ]);

    expect(text).toBe(
      "## 反向链接文档\n\n- [First](siyuan://blocks/doc1)\n- [Second](siyuan://blocks/doc2)"
    );
  });

  test("builds child doc list markdown section with siyuan links", () => {
    const text = buildChildDocListMarkdown([
      { id: "doc1", name: "Child 1", depth: 0 },
      { id: "doc2", name: "Child 2", depth: 1 },
    ]);

    expect(text).toBe(
      "## 子文档列表\n\n- [Child 1](siyuan://blocks/doc1)\n    - [Child 2](siyuan://blocks/doc2)"
    );
  });

  test("extracts ids from transformed links that still contain /blocks/<id>", () => {
    const markdown = [
      "custom-link://open?target=blocks/20260220075025-ue88wkc",
      "something://a/b/blocks/20260220220208-esrmvws?focus=1",
    ].join("\n");

    expect(extractSiyuanBlockIdsFromMarkdown(markdown)).toEqual([
      "20260220075025-ue88wkc",
      "20260220220208-esrmvws",
    ]);
  });

  test("filters doc refs that already exist in markdown", () => {
    const markdown = [
      "See ((20260101101010-abcdef1)).",
      "- [Link](siyuan://blocks/20260202121212-bcdefg2)",
    ].join("\n");
    const items = [
      { id: "20260101101010-abcdef1", name: "Doc A" },
      { id: "20260202121212-bcdefg2", name: "Doc B" },
      { id: "20260303131313-cdefgh3", name: "Doc C" },
    ];

    const result = filterDocRefsByMarkdown(items, markdown);

    expect(result.items).toEqual([{ id: "20260303131313-cdefgh3", name: "Doc C" }]);
    expect(result.skipped).toEqual([
      { id: "20260101101010-abcdef1", name: "Doc A" },
      { id: "20260202121212-bcdefg2", name: "Doc B" },
    ]);
    expect(result.existingIds).toEqual([
      "20260101101010-abcdef1",
      "20260202121212-bcdefg2",
    ]);
  });
});
