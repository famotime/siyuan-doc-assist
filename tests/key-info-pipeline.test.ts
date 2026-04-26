import { describe, expect, test } from "vitest";
import { KeyInfoItem } from "@/core/key-info-core";
import {
  appendDocTitleItemIfMissing,
  normalizeKeyInfoItemsByPipeline,
  sortKeyInfoItemsByAnchor,
} from "@/services/key-info-pipeline";

function item(
  id: string,
  type: KeyInfoItem["type"],
  text: string,
  patch: Partial<KeyInfoItem> = {}
): KeyInfoItem {
  return {
    id,
    type,
    text,
    raw: text,
    offset: 0,
    blockId: "b-1",
    blockSort: 1,
    order: 1,
    listItem: false,
    ...patch,
  };
}

describe("key-info pipeline", () => {
  test("appends doc title item only when title heading is missing", () => {
    const base = [item("t1", "title", "标题A", { blockId: "doc-1", blockSort: -1 })];
    const unchanged = appendDocTitleItemIfMissing(base, {
      docTitle: "标题A",
      rootId: "doc-1",
      nextOrder: 8,
    });
    expect(unchanged).toEqual(base);

    const appended = appendDocTitleItemIfMissing([item("p1", "bold", "正文")], {
      docTitle: "标题B",
      rootId: "doc-1",
      nextOrder: 9,
    });
    expect(appended).toHaveLength(2);
    expect(appended[1]).toEqual(
      expect.objectContaining({
        type: "title",
        text: "标题B",
        blockId: "doc-1",
        blockSort: -1,
        order: 9,
      })
    );
  });

  test("normalizes highlight and bold in the pipeline stage", () => {
    const normalized = normalizeKeyInfoItemsByPipeline([
      item("hl1", "highlight", "==代码 `x`==", { raw: "==代码 `x`==" }),
      item("b1", "bold", "A", { offset: 0, order: 1 }),
      item("b2", "bold", "AB", { offset: 0, order: 2 }),
    ]);

    expect(
      normalized.some((entry) => entry.type === "highlight" && entry.text.includes("代码"))
    ).toBe(true);
    expect(
      normalized.some((entry) => entry.type === "code" && entry.text === "x")
    ).toBe(true);
    expect(
      normalized.some((entry) => entry.type === "bold" && entry.text === "AB")
    ).toBe(true);
  });

  test("sorts items by blockSort, offset then order", () => {
    const sorted = sortKeyInfoItemsByAnchor([
      item("c", "tag", "c", { blockSort: 2, offset: 0, order: 1 }),
      item("b", "tag", "b", { blockSort: 1, offset: 2, order: 1 }),
      item("a", "tag", "a", { blockSort: 1, offset: 1, order: 2 }),
    ]);

    expect(sorted.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  test("normalizes trailing hash tags and dedupes same-block tag items", () => {
    const normalized = normalizeKeyInfoItemsByPipeline([
      item("tag-1", "tag", "🔍待查#", { raw: "#🔍待查#", blockId: "p-1", order: 1 }),
      item("tag-2", "tag", "🔍待查", { raw: "#🔍待查", blockId: "p-1", order: 2 }),
      item("tag-3", "tag", "#🔍待查#", { raw: "#🔍待查#", blockId: "p-1", order: 3 }),
    ]);

    expect(normalized.filter((entry) => entry.type === "tag")).toEqual([
      expect.objectContaining({
        type: "tag",
        text: "🔍待查",
        raw: "#🔍待查",
        blockId: "p-1",
      }),
    ]);
  });

  test("prefers raw tag text over list-decorated tag text when deduping list items", () => {
    const normalized = normalizeKeyInfoItemsByPipeline([
      item("tag-1", "tag", "-测试", {
        raw: "#测试",
        blockId: "p-1",
        order: 1,
        listItem: true,
        listPrefix: "- ",
      }),
      item("tag-2", "tag", "测试", {
        raw: "#测试",
        blockId: "p-1",
        order: 2,
        listItem: true,
        listPrefix: "- ",
      }),
    ]);

    expect(normalized.filter((entry) => entry.type === "tag")).toEqual([
      expect.objectContaining({
        type: "tag",
        text: "测试",
        raw: "#测试",
        blockId: "p-1",
        listPrefix: "- ",
      }),
    ]);
  });
});
