import { describe, expect, it } from "vitest";
import {
  filterFloatingSearchCandidates,
  highlightKeywordsInHtml,
  parseSearchKeywords,
  splitFloatingTextCandidates,
} from "@/core/floating-text-search-core";

describe("floating-text-search-core", () => {
  describe("splitFloatingTextCandidates", () => {
    it("returns empty array for empty or whitespace text", () => {
      expect(splitFloatingTextCandidates("")).toEqual([]);
      expect(splitFloatingTextCandidates("   \n\n  \t  ")).toEqual([]);
    });

    it("splits non-empty lines and tracks line numbers", () => {
      const text = "# 标题行\n\n- 第一项\n- 第二项含某些文字\n\n末尾段落";
      const candidates = splitFloatingTextCandidates(text);

      expect(candidates).toHaveLength(4);
      expect(candidates[0]).toEqual({
        id: 1,
        line: 1,
        rawText: "# 标题行",
        displayText: "# 标题行",
      });
      expect(candidates[1]).toEqual({
        id: 2,
        line: 3,
        rawText: "- 第一项",
        displayText: "- 第一项",
      });
      expect(candidates[2]).toEqual({
        id: 3,
        line: 4,
        rawText: "- 第二项含某些文字",
        displayText: "- 第二项含某些文字",
      });
      expect(candidates[3]).toEqual({
        id: 4,
        line: 6,
        rawText: "末尾段落",
        displayText: "末尾段落",
      });
    });

    it("preserves leading and trailing whitespace in rawText", () => {
      const text = "   缩进内容   ";
      const candidates = splitFloatingTextCandidates(text);
      expect(candidates[0].rawText).toBe("   缩进内容   ");
      expect(candidates[0].displayText).toBe("缩进内容");
    });
  });

  describe("parseSearchKeywords", () => {
    it("returns empty array for empty query", () => {
      expect(parseSearchKeywords("")).toEqual([]);
      expect(parseSearchKeywords("   ")).toEqual([]);
    });

    it("splits query by whitespace and lowers case", () => {
      expect(parseSearchKeywords("Hello   WORLD test")).toEqual(["hello", "world", "test"]);
    });
  });

  describe("filterFloatingSearchCandidates", () => {
    const text = "- 苹果手机 iPhone 15\n- 华为 Mate 60\n- 小米 14 Ultra\n- 苹果 iPad Pro";
    const candidates = splitFloatingTextCandidates(text);

    it("returns empty when query is empty", () => {
      expect(filterFloatingSearchCandidates(candidates, "")).toEqual([]);
      expect(filterFloatingSearchCandidates(candidates, "   ")).toEqual([]);
    });

    it("filters candidates matching single keyword case-insensitively", () => {
      const matched = filterFloatingSearchCandidates(candidates, "iphone");
      expect(matched).toHaveLength(1);
      expect(matched[0].rawText).toBe("- 苹果手机 iPhone 15");
    });

    it("filters candidates matching all multi-word keywords", () => {
      const matched = filterFloatingSearchCandidates(candidates, "苹果 15");
      expect(matched).toHaveLength(1);
      expect(matched[0].rawText).toBe("- 苹果手机 iPhone 15");

      const noMatch = filterFloatingSearchCandidates(candidates, "苹果 华为");
      expect(noMatch).toHaveLength(0);
    });
  });

  describe("highlightKeywordsInHtml", () => {
    it("returns escaped text when query is empty", () => {
      expect(highlightKeywordsInHtml("<script>alert('1')</script>", "")).toBe(
        "&lt;script&gt;alert(&#39;1&#39;)&lt;/script&gt;"
      );
    });

    it("highlights matched keywords with mark tag safely", () => {
      const result = highlightKeywordsInHtml("Hello <World> foo", "world");
      expect(result).toBe('Hello &lt;<mark class="ft-search-highlight">World</mark>&gt; foo');
    });

    it("handles multiple search tokens", () => {
      const result = highlightKeywordsInHtml("Apple Banana Orange", "apple orange");
      expect(result).toBe(
        '<mark class="ft-search-highlight">Apple</mark> Banana <mark class="ft-search-highlight">Orange</mark>'
      );
    });
  });
});
