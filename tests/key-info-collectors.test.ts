import { describe, expect, test } from "vitest";
import {
  collectHeadingItems,
  collectMarkdownAndMetaItems,
} from "@/services/key-info-collectors";
import { SqlKeyInfoRow } from "@/services/key-info-model";

function buildRow(overrides: Partial<SqlKeyInfoRow>): SqlKeyInfoRow {
  return {
    id: "row-1",
    sort: 0,
    markdown: "",
    memo: "",
    tag: "",
    ...overrides,
  };
}

describe("key-info-collectors", () => {
  test("collects heading items and tracks heading block ids", () => {
    const rows = [
      buildRow({
        id: "h1",
        type: "h",
        subtype: "h2",
        content: "标题二",
      }),
    ];
    const blockSortMap = new Map([["h1", 5]]);

    const result = collectHeadingItems(
      rows,
      blockSortMap,
      () => ({ listItem: true, listPrefix: "1. " }),
      2
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        type: "title",
        text: "标题二",
        raw: "## 标题二",
        blockSort: 5,
        order: 2,
        listItem: true,
        listPrefix: "1. ",
      })
    );
    expect(result.headingBlockIds.has("h1")).toBe(true);
    expect(result.nextOrder).toBe(3);
  });

  test("collects markdown inline items and block meta while skipping heading markdown title", () => {
    const rows = [
      buildRow({
        id: "h1",
        type: "h",
        subtype: "h1",
        markdown: "# 标题一",
      }),
      buildRow({
        id: "p1",
        type: "p",
        markdown: "正文 **加粗** #标签",
        memo: "行备注",
        tag: "#手工标签",
      }),
    ];
    const blockSortMap = new Map([
      ["h1", 0],
      ["p1", 1],
    ]);

    const result = collectMarkdownAndMetaItems(rows, {
      rootId: "doc-1",
      hasChildBlocks: false,
      kramdownMap: new Map(),
      blockSortMap,
      isListItemWithMappedChild: () => false,
      resolveListLine: (blockId?: string) =>
        blockId === "p1" ? { listItem: true, listPrefix: "- " } : { listItem: false },
      startOrder: 10,
    });

    expect(
      result.items.some((item) => item.blockId === "h1" && item.type === "title")
    ).toBe(false);
    expect(
      result.items.some(
        (item) => item.blockId === "p1" && item.type === "remark" && item.text === "行备注"
      )
    ).toBe(true);
    expect(
      result.items.some(
        (item) => item.blockId === "p1" && item.type === "tag" && item.text === "手工标签"
      )
    ).toBe(true);
    expect(
      result.markdownInlineItems.some(
        (item) => item.blockId === "p1" && item.type === "bold" && item.text === "加粗"
      )
    ).toBe(true);
    expect(result.nextOrder).toBeGreaterThan(10);
  });
});
