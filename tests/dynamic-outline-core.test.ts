import { describe, expect, test } from "vitest";
import { KeyInfoItem } from "@/core/key-info-core";
import {
  buildDynamicOutlineItems,
  calculateViewportIndicator,
  findActiveOutlineItemIndex,
  parseHeadingLevel
} from "@/core/dynamic-outline-core";

describe("dynamic-outline-core", () => {
  const mockItems: KeyInfoItem[] = [
    {
      id: "item-1",
      blockId: "b-1",
      type: "title",
      text: "一级标题",
      raw: "# 一级标题",
      offset: 0,
      blockSort: 0,
      order: 10
    },
    {
      id: "item-2",
      blockId: "b-2",
      type: "bold",
      text: "加粗重点",
      raw: "**加粗重点**",
      offset: 0,
      blockSort: 0,
      order: 20
    },
    {
      id: "item-3",
      blockId: "b-3",
      type: "title",
      text: "二级标题",
      raw: "## 二级标题",
      offset: 0,
      blockSort: 0,
      order: 30
    },
    {
      id: "item-4",
      blockId: "b-4",
      type: "title",
      text: "三级标题",
      headingLevel: 3,
      raw: "",
      offset: 0,
      blockSort: 0,
      order: 40
    }
  ];

  describe("parseHeadingLevel", () => {
    test("parses heading levels from raw markdown", () => {
      expect(parseHeadingLevel({ id: "1", blockId: "1", type: "title", text: "t", raw: "# H1", offset: 0, blockSort: 0, order: 1 })).toBe(1);
      expect(parseHeadingLevel({ id: "2", blockId: "2", type: "title", text: "t", raw: "### H3", offset: 0, blockSort: 0, order: 2 })).toBe(3);
      expect(parseHeadingLevel({ id: "3", blockId: "3", type: "title", text: "t", raw: "###### H6", offset: 0, blockSort: 0, order: 3 })).toBe(6);
    });

    test("parses heading levels from headingLevel property if raw lacks hashes", () => {
      expect(parseHeadingLevel({ id: "1", blockId: "1", type: "title", text: "t", headingLevel: 2, raw: "", offset: 0, blockSort: 0, order: 1 })).toBe(2);
      expect(parseHeadingLevel({ id: "2", blockId: "2", type: "title", text: "t", headingLevel: 5, raw: "", offset: 0, blockSort: 0, order: 2 })).toBe(5);
    });

    test("returns 0 for non-title items", () => {
      expect(parseHeadingLevel({ id: "1", blockId: "1", type: "bold", text: "b", order: 1 })).toBe(0);
      expect(parseHeadingLevel({ id: "2", blockId: "2", type: "highlight", text: "h", order: 2 })).toBe(0);
    });
  });

  describe("buildDynamicOutlineItems", () => {
    test("filters only titles when followKeyInfo is false", () => {
      const result = buildDynamicOutlineItems(mockItems, { followKeyInfo: false });
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.text)).toEqual(["一级标题", "二级标题", "三级标题"]);
      expect(result[0].level).toBe(1);
      expect(result[1].level).toBe(2);
      expect(result[2].level).toBe(3);
      expect(result[0].posRatio).toBe(0);
      expect(result[2].posRatio).toBe(1);
    });

    test("includes all types when followKeyInfo is true and filter is empty/all", () => {
      const result = buildDynamicOutlineItems(mockItems, {
        followKeyInfo: true,
        activeFilter: []
      });
      expect(result).toHaveLength(4);
      expect(result[1].type).toBe("bold");
      expect(result[1].level).toBe(0);
    });

    test("filters by specific type when followKeyInfo is true with active filter", () => {
      const result = buildDynamicOutlineItems(mockItems, {
        followKeyInfo: true,
        activeFilter: ["bold"]
      });
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("加粗重点");
      expect(result[0].type).toBe("bold");
    });
  });

  describe("calculateViewportIndicator", () => {
    test("returns full height if content fits viewport", () => {
      const indicator = calculateViewportIndicator(0, 500, 600, 300);
      expect(indicator).toEqual({ top: 0, height: 300 });
    });

    test("calculates proportional height and top offset", () => {
      const indicator = calculateViewportIndicator(200, 1000, 500, 400);
      // scrollHeight = 1000, clientHeight = 500 -> viewRatio = 0.5 -> height = 200
      // maxScroll = 500, scrollTop = 200 -> scrollRatio = 0.4
      // availableTrack = 400 - 200 = 200 -> top = 0.4 * 200 = 80
      expect(indicator).toEqual({ top: 80, height: 200 });
    });

    test("enforces minimum indicator height", () => {
      const indicator = calculateViewportIndicator(0, 100000, 500, 200);
      expect(indicator.height).toBeGreaterThanOrEqual(16);
    });
  });

  describe("findActiveOutlineItemIndex", () => {
    const items = [
      { id: "1", blockId: "1", text: "1", type: "title" as const, level: 1 as const, posRatio: 0, order: 0 },
      { id: "2", blockId: "2", text: "2", type: "title" as const, level: 2 as const, posRatio: 0.4, order: 10 },
      { id: "3", blockId: "3", text: "3", type: "title" as const, level: 3 as const, posRatio: 0.8, order: 20 }
    ];

    test("finds corresponding index based on scroll ratio", () => {
      expect(findActiveOutlineItemIndex(items, 0)).toBe(0);
      expect(findActiveOutlineItemIndex(items, 0.42)).toBe(1);
      expect(findActiveOutlineItemIndex(items, 0.9)).toBe(2);
    });

    test("returns -1 for empty items", () => {
      expect(findActiveOutlineItemIndex([], 0.5)).toBe(-1);
    });
  });
});
