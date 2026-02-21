import { describe, expect, test } from "vitest";
import {
  buildBacklinkListMarkdown,
  dedupeDocRefs,
  extractSiyuanBlockIdsFromMarkdown,
} from "@/core/link-core";

describe("link-core", () => {
  test("extracts both block refs and siyuan links from markdown", () => {
    const markdown = [
      "See ((20260101101010-abcdef1)).",
      "[doc](siyuan://blocks/20260101101010-abcdef1)",
      "[other](siyuan://blocks/20260202121212-bcdefg2)",
      "((20260202121212-bcdefg2 'alias'))",
    ].join("\n");

    expect(extractSiyuanBlockIdsFromMarkdown(markdown)).toEqual([
      "20260101101010-abcdef1",
      "20260202121212-bcdefg2",
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
});
