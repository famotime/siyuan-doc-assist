import { describe, expect, test } from "vitest";
import { KeyInfoItem } from "@/core/key-info-core";
import {
  buildDynamicOutlineItems,
  calculateViewportIndicator,
  estimateGlobalDocumentProgress,
  filterDynamicOutlineItems,
  findActiveOutlineItemIndex,
  highlightMatchRanges,
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

  describe("estimateGlobalDocumentProgress", () => {
    test("falls back to scroll ratio when anchors are empty", () => {
      const progress = estimateGlobalDocumentProgress({
        scrollTop: 200,
        scrollHeight: 1000,
        clientHeight: 500,
        anchors: []
      });
      // maxScroll = 500, scrollTop = 200 -> 0.4
      expect(progress).toBeCloseTo(0.4, 2);
    });

    test("interpolates between two visible anchors accurately", () => {
      const anchors = [
        { posRatio: 0.2, domTop: 1000 },
        { posRatio: 0.6, domTop: 3000 }
      ];
      // viewCenter = scrollTop + clientHeight / 2 = 1500 + 500 = 2000
      // 2000 在 1000 和 3000 正中间 -> t = 0.5 -> posRatio = 0.2 + 0.5 * 0.4 = 0.4
      const progress = estimateGlobalDocumentProgress({
        scrollTop: 1500,
        scrollHeight: 5000,
        clientHeight: 1000,
        anchors
      });
      expect(progress).toBeCloseTo(0.4, 3);
    });

    test("smoothly caps progress at bottom of partial DOM during lazy load instead of jumping to 1.0", () => {
      // 模拟长文档只有前部分加载：最后一个锚点只有 0.35 进度
      const anchors = [
        { posRatio: 0.1, domTop: 400 },
        { posRatio: 0.35, domTop: 2000 }
      ];
      // 滚到当前已渲染 DOM 的底部
      const progressAtBottom = estimateGlobalDocumentProgress({
        scrollTop: 2600,
        scrollHeight: 3200,
        clientHeight: 600,
        anchors
      });
      // 绝不能跳到 1.0，应保持在最后一个锚点附近（<= 0.47）
      expect(progressAtBottom).toBeLessThan(0.48);
      expect(progressAtBottom).toBeGreaterThanOrEqual(0.35);
    });
  });

  describe("filterDynamicOutlineItems", () => {
    const outlineItems = [
      { id: "1", blockId: "b-1", text: "项目背景与目标", type: "title" as const, level: 1 as const, posRatio: 0, order: 10 },
      { id: "2", blockId: "b-2", text: "系统架构总体设计", type: "title" as const, level: 1 as const, posRatio: 0.2, order: 20 },
      { id: "3", blockId: "b-3", text: "前端架构模块", type: "title" as const, level: 2 as const, posRatio: 0.4, order: 30 },
      { id: "4", blockId: "b-4", text: "后端微服务体系", type: "title" as const, level: 2 as const, posRatio: 0.6, order: 40 },
      { id: "5", blockId: "b-5", text: "Docker 部署指南", type: "title" as const, level: 3 as const, posRatio: 0.8, order: 50 }
    ];

    test("returns all items when query is empty or whitespace", () => {
      const emptyResult = filterDynamicOutlineItems(outlineItems, "");
      expect(emptyResult).toHaveLength(5);
      expect(emptyResult.every((r) => !r.isAncestor)).toBe(true);

      const whitespaceResult = filterDynamicOutlineItems(outlineItems, "   ");
      expect(whitespaceResult).toHaveLength(5);
    });

    test("matches by direct Chinese keyword substring and returns matchRange", () => {
      const results = filterDynamicOutlineItems(outlineItems, "架构");
      expect(results).toHaveLength(2);
      expect(results[0].item.text).toBe("系统架构总体设计");
      expect(results[0].matchRange).toBeDefined();
      expect(results[1].item.text).toBe("前端架构模块");
    });

    test("matches by pinyin initials (首字母) like xtjg", () => {
      const results = filterDynamicOutlineItems(outlineItems, "xtjg");
      expect(results).toHaveLength(1);
      expect(results[0].item.text).toBe("系统架构总体设计");
      expect(results[0].matchRange).toEqual([0, 3]);
    });

    test("matches by pinyin full spell (全拼) and case-insensitively", () => {
      const results = filterDynamicOutlineItems(outlineItems, "houduan");
      expect(results).toHaveLength(1);
      expect(results[0].item.text).toBe("后端微服务体系");

      const upperResult = filterDynamicOutlineItems(outlineItems, "DOCKER");
      expect(upperResult).toHaveLength(1);
      expect(upperResult[0].item.text).toBe("Docker 部署指南");
    });

    test("compact mode only returns directly matched items", () => {
      // "部署" only matches Docker 部署指南 (H3)
      const results = filterDynamicOutlineItems(outlineItems, "部署", { showTreeContext: false });
      expect(results).toHaveLength(1);
      expect(results[0].item.text).toBe("Docker 部署指南");
      expect(results[0].isAncestor).toBe(false);
    });

    test("tree context mode retains ancestor parent headers", () => {
      // Docker 部署指南 (level 3) matches "部署"
      // Its ancestors are: 后端微服务体系 (level 2) and 系统架构总体设计 (level 1)
      const results = filterDynamicOutlineItems(outlineItems, "部署", { showTreeContext: true });
      expect(results).toHaveLength(3);
      expect(results[0].item.text).toBe("系统架构总体设计");
      expect(results[0].isAncestor).toBe(true);
      expect(results[0].matchRange).toBeUndefined();

      expect(results[1].item.text).toBe("后端微服务体系");
      expect(results[1].isAncestor).toBe(true);
      expect(results[1].matchRange).toBeUndefined();

      expect(results[2].item.text).toBe("Docker 部署指南");
      expect(results[2].isAncestor).toBe(false);
      expect(results[2].matchRange).toBeDefined();
    });

    test("returns empty array when no item matches", () => {
      const results = filterDynamicOutlineItems(outlineItems, "xyz不存在的内容123");
      expect(results).toHaveLength(0);
    });
  });

  describe("highlightMatchRanges", () => {
    test("returns single unhighlighted part when range is missing or text empty", () => {
      expect(highlightMatchRanges("")).toEqual([]);
      expect(highlightMatchRanges("hello")).toEqual([{ text: "hello", highlight: false }]);
      expect(highlightMatchRanges("hello", undefined)).toEqual([{ text: "hello", highlight: false }]);
    });

    test("splits text with highlighted segment in middle", () => {
      const parts = highlightMatchRanges("系统架构总体设计", [2, 3]);
      expect(parts).toEqual([
        { text: "系统", highlight: false },
        { text: "架构", highlight: true },
        { text: "总体设计", highlight: false }
      ]);
    });

    test("handles match at start of text", () => {
      const parts = highlightMatchRanges("Docker 部署指南", [0, 5]);
      expect(parts).toEqual([
        { text: "Docker", highlight: true },
        { text: " 部署指南", highlight: false }
      ]);
    });

    test("handles match at end of text", () => {
      const parts = highlightMatchRanges("前端架构模块", [4, 5]);
      expect(parts).toEqual([
        { text: "前端架构", highlight: false },
        { text: "模块", highlight: true }
      ]);
    });
  });
});
