import { describe, expect, test } from "vitest";
import { resolveKeyInfoItems } from "@/plugin/key-info-state";
import { KeyInfoItem } from "@/core/key-info-core";

function item(id: string, text: string, order: number): KeyInfoItem {
  return {
    id,
    type: "bold",
    text,
    raw: text,
    offset: order,
    blockId: `b-${id}`,
    blockSort: order,
    order,
  };
}

describe("key-info controller state", () => {
  test("replaces same-doc items with latest ordered snapshot instead of append", () => {
    const currentItems = [item("old-1", "Old 1", 0)];
    const latestItems = [item("new-1", "New 1", 0), item("new-2", "New 2", 1)];

    const next = resolveKeyInfoItems({
      isSameDoc: true,
      hasItems: true,
      currentItems,
      latestItems,
    });

    expect(next.map((it) => it.id)).toEqual(["new-1", "new-2"]);
  });
});
