import { describe, expect, test } from "vitest";
import {
  buildOcrQuoteMarkdown,
  calculateImageSliceRects,
  MAX_OCR_IMAGE_HEIGHT,
  mergeOcrResults,
} from "@/core/ai-image-ocr-core";

describe("ai-image-ocr-core", () => {
  describe("calculateImageSliceRects", () => {
    test("returns single slice when height is less than or equal to maxHeight", () => {
      expect(calculateImageSliceRects(800, 600)).toEqual([
        { x: 0, y: 0, width: 800, height: 600 },
      ]);
      expect(calculateImageSliceRects(1000, 3000)).toEqual([
        { x: 0, y: 0, width: 1000, height: 3000 },
      ]);
    });

    test("splits vertically when height exceeds 3000", () => {
      const rects = calculateImageSliceRects(1200, 7500, MAX_OCR_IMAGE_HEIGHT);
      expect(rects).toEqual([
        { x: 0, y: 0, width: 1200, height: 3000 },
        { x: 0, y: 3000, width: 1200, height: 3000 },
        { x: 0, y: 6000, width: 1200, height: 1500 },
      ]);
    });

    test("handles boundary exactly divisible by maxHeight", () => {
      const rects = calculateImageSliceRects(1000, 6000, 3000);
      expect(rects).toEqual([
        { x: 0, y: 0, width: 1000, height: 3000 },
        { x: 0, y: 3000, width: 1000, height: 3000 },
      ]);
    });

    test("handles edge cases like 0 or negative dimensions gracefully", () => {
      const rects = calculateImageSliceRects(0, 0);
      expect(rects).toEqual([
        { x: 0, y: 0, width: 1, height: 1 },
      ]);
    });
  });

  describe("mergeOcrResults", () => {
    test("returns empty string if all items are empty or [NO_TEXT]", () => {
      expect(mergeOcrResults([])).toBe("");
      expect(mergeOcrResults([null, undefined, "", "  ", "[NO_TEXT]"])).toBe("");
    });

    test("returns single text without separator if only one valid item", () => {
      expect(mergeOcrResults(["第一段文字"])).toBe("第一段文字");
      expect(mergeOcrResults(["[NO_TEXT]", "第二段文字", ""])).toBe("第二段文字");
    });

    test("joins multiple valid texts with '---' separator", () => {
      const results = [
        "第一段文字",
        "第二段文字\n包含换行",
        "第三段文字",
      ];
      expect(mergeOcrResults(results)).toBe("第一段文字\n---\n第二段文字\n包含换行\n---\n第三段文字");
    });

    test("filters out [NO_TEXT] in between valid slices and keeps separator between valid parts", () => {
      const results = [
        "头部文字",
        "[NO_TEXT]",
        "尾部文字",
      ];
      expect(mergeOcrResults(results)).toBe("头部文字\n---\n尾部文字");
    });
  });

  describe("buildOcrQuoteMarkdown", () => {
    test("quotes lines with > and handles --- separator", () => {
      const text = "第一段\n---\n第二段第一行\n\n第二段第二行";
      const md = buildOcrQuoteMarkdown(text);
      expect(md).toBe("> 第一段\n> ---\n> 第二段第一行\n>\n> 第二段第二行");
    });
  });
});
