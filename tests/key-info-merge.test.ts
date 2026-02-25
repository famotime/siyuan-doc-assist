import { describe, expect, test } from "vitest";
import { mergePreferredInlineItems } from "@/services/key-info-merge";
import { KeyInfoItem } from "@/core/key-info-core";

function item(id: string, type: KeyInfoItem["type"], text: string, blockId = "b1"): KeyInfoItem {
  return {
    id,
    type,
    text,
    raw: text,
    offset: 0,
    blockId,
    blockSort: 1,
    order: 0,
  };
}

describe("key-info merge", () => {
  test("prefers dom/span items and keeps markdown-only residual items", () => {
    const markdownInlineItems = [
      item("m1", "bold", "A"),
      item("m2", "italic", "B"),
    ];
    const domItems = [item("d1", "bold", "A")];
    const spanItems = [item("s1", "highlight", "C")];

    const merged = mergePreferredInlineItems(markdownInlineItems, spanItems, domItems);
    expect(merged.map((it) => `${it.type}:${it.text}`)).toEqual([
      "bold:A",
      "highlight:C",
      "italic:B",
    ]);
  });

  test("uses markdown items when dom/span sources are empty", () => {
    const markdownInlineItems = [item("m1", "bold", "A")];
    const merged = mergePreferredInlineItems(markdownInlineItems, [], []);
    expect(merged).toEqual(markdownInlineItems);
  });

  test("inherits list prefix metadata from markdown when preferred inline item matches", () => {
    const markdownInlineItems = [
      {
        ...item("m1", "bold", "Skills 基", "p-1"),
        listItem: true,
        listPrefix: "- ",
      },
    ];
    const spanItems = [
      item("s1", "bold", "Skills 基", "p-1"),
    ];

    const merged = mergePreferredInlineItems(markdownInlineItems, spanItems, []);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.text).toBe("Skills 基");
    expect((merged[0] as any)?.listPrefix).toBe("- ");
    expect((merged[0] as any)?.listItem).toBe(true);
  });
});
