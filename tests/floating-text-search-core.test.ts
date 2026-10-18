import { describe, expect, it } from "vitest";
import {
  filterFloatingSearchCandidates,
  highlightKeywordsInHtml,
  parseSearchKeywords,
  splitFloatingTextCandidates,
  stripFloatingPrefixMarkers,
} from "@/core/floating-text-search-core";

describe("floating-text-search-core", () => {
  describe("stripFloatingPrefixMarkers", () => {
    it("returns empty string for null, undefined, or empty string", () => {
      expect(stripFloatingPrefixMarkers("")).toBe("");
      expect(stripFloatingPrefixMarkers(null as any)).toBe("");
      expect(stripFloatingPrefixMarkers(undefined as any)).toBe("");
    });

    it("strips leading whitespace and tabs", () => {
      expect(stripFloatingPrefixMarkers("   纯文本内容  ")).toBe("纯文本内容");
      expect(stripFloatingPrefixMarkers("\t\t制表符缩进文本")).toBe("制表符缩进文本");
    });

    it("strips unordered list markers (-, *, +) with trailing spaces", () => {
      expect(stripFloatingPrefixMarkers("- 无序项 A")).toBe("无序项 A");
      expect(stripFloatingPrefixMarkers("* 无序项 B")).toBe("无序项 B");
      expect(stripFloatingPrefixMarkers("+ 无序项 C")).toBe("无序项 C");
      expect(stripFloatingPrefixMarkers("   -   带缩进的无序项")).toBe("带缩进的无序项");
    });

    it("strips ordered list numbers (1., 2), 3、)", () => {
      expect(stripFloatingPrefixMarkers("1. 第一步操作")).toBe("第一步操作");
      expect(stripFloatingPrefixMarkers("2) 第二步操作")).toBe("第二步操作");
      expect(stripFloatingPrefixMarkers("3、第三步操作")).toBe("第三步操作");
      expect(stripFloatingPrefixMarkers("  10. 两位数序号")).toBe("两位数序号");
    });

    it("strips todo / task checkboxes (- [ ], - [x], * [X], [ ])", () => {
      expect(stripFloatingPrefixMarkers("- [ ] 待办任务")).toBe("待办任务");
      expect(stripFloatingPrefixMarkers("- [x] 已完成任务")).toBe("已完成任务");
      expect(stripFloatingPrefixMarkers("* [X] 星号已完成任务")).toBe("星号已完成任务");
      expect(stripFloatingPrefixMarkers("[ ] 裸待办框任务")).toBe("裸待办框任务");
    });

    it("strips blockquote markers (> and >>)", () => {
      expect(stripFloatingPrefixMarkers("> 单层引用内容")).toBe("单层引用内容");
      expect(stripFloatingPrefixMarkers(">> 双层嵌套引用")).toBe("双层嵌套引用");
      expect(stripFloatingPrefixMarkers("  >   带空格的引用")).toBe("带空格的引用");
    });

    it("strips markdown headings (# to ######)", () => {
      expect(stripFloatingPrefixMarkers("# 一级标题")).toBe("一级标题");
      expect(stripFloatingPrefixMarkers("## 二级标题")).toBe("二级标题");
      expect(stripFloatingPrefixMarkers("### 三级标题")).toBe("三级标题");
      expect(stripFloatingPrefixMarkers("###### 六级标题")).toBe("六级标题");
    });

    it("strips multi-layer nested prefixes recursively", () => {
      expect(stripFloatingPrefixMarkers("  > - [ ] 引用内的任务列表")).toBe("引用内的任务列表");
      expect(stripFloatingPrefixMarkers("  - 1. 列表内的有序编号")).toBe("列表内的有序编号");
      expect(stripFloatingPrefixMarkers(">> - *嵌套列表*")).toBe("*嵌套列表*");
      expect(stripFloatingPrefixMarkers("  # 1. 标题带序号")).toBe("标题带序号");
    });

    it("strips SiYuan Kramdown IAL block attributes", () => {
      expect(
        stripFloatingPrefixMarkers('- 项目说明 {: id="20261018-090000-abcdef" updated="20261018"}')
      ).toBe("项目说明");
      expect(
        stripFloatingPrefixMarkers('{: id="20261018"} - [ ] 属性在前待办')
      ).toBe("属性在前待办");
    });

    it("avoids stripping non-prefix content (negative numbers, tags, international codes)", () => {
      expect(stripFloatingPrefixMarkers("-5 是负数")).toBe("-5 是负数");
      expect(stripFloatingPrefixMarkers("#tag 这是思源标签")).toBe("#tag 这是思源标签");
      expect(stripFloatingPrefixMarkers("+86 13800138000")).toBe("+86 13800138000");
    });

    it("returns empty string when line contains only prefixes and whitespace", () => {
      expect(stripFloatingPrefixMarkers("- ")).toBe("");
      expect(stripFloatingPrefixMarkers("  - [ ]   ")).toBe("");
      expect(stripFloatingPrefixMarkers("> ")).toBe("");
      expect(stripFloatingPrefixMarkers("##  ")).toBe("");
    });
  });

  describe("splitFloatingTextCandidates", () => {
    it("returns empty array for empty or whitespace text", () => {
      expect(splitFloatingTextCandidates("")).toEqual([]);
      expect(splitFloatingTextCandidates("   \n\n  \t  ")).toEqual([]);
    });

    it("splits non-empty lines, strips prefixes, tracks line numbers and cleanText", () => {
      const text = "# 标题行\n\n- 第一项\n- 第二项含某些文字\n\n末尾段落";
      const candidates = splitFloatingTextCandidates(text);

      expect(candidates).toHaveLength(4);
      expect(candidates[0]).toEqual({
        id: 1,
        line: 1,
        rawText: "# 标题行",
        displayText: "标题行",
        cleanText: "标题行",
      });
      expect(candidates[1]).toEqual({
        id: 2,
        line: 3,
        rawText: "- 第一项",
        displayText: "第一项",
        cleanText: "第一项",
      });
      expect(candidates[2]).toEqual({
        id: 3,
        line: 4,
        rawText: "- 第二项含某些文字",
        displayText: "第二项含某些文字",
        cleanText: "第二项含某些文字",
      });
      expect(candidates[3]).toEqual({
        id: 4,
        line: 6,
        rawText: "末尾段落",
        displayText: "末尾段落",
        cleanText: "末尾段落",
      });
    });

    it("filters out lines that become empty after stripping prefixes", () => {
      const text = "- 有效项 1\n- \n- [ ] \n> \n- 有效项 2";
      const candidates = splitFloatingTextCandidates(text);

      expect(candidates).toHaveLength(2);
      expect(candidates[0].cleanText).toBe("有效项 1");
      expect(candidates[0].line).toBe(1);
      expect(candidates[1].cleanText).toBe("有效项 2");
      expect(candidates[1].line).toBe(5);
    });

    it("preserves leading and trailing whitespace in rawText while cleaning displayText and cleanText", () => {
      const text = "   - 缩进列表内容   ";
      const candidates = splitFloatingTextCandidates(text);
      expect(candidates[0].rawText).toBe("   - 缩进列表内容   ");
      expect(candidates[0].displayText).toBe("缩进列表内容");
      expect(candidates[0].cleanText).toBe("缩进列表内容");
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

    it("filters candidates matching single keyword against cleaned text case-insensitively", () => {
      const matched = filterFloatingSearchCandidates(candidates, "iphone");
      expect(matched).toHaveLength(1);
      expect(matched[0].cleanText).toBe("苹果手机 iPhone 15");
      expect(matched[0].rawText).toBe("- 苹果手机 iPhone 15");
    });

    it("filters candidates matching all multi-word keywords", () => {
      const matched = filterFloatingSearchCandidates(candidates, "苹果 15");
      expect(matched).toHaveLength(1);
      expect(matched[0].cleanText).toBe("苹果手机 iPhone 15");

      const noMatch = filterFloatingSearchCandidates(candidates, "苹果 华为");
      expect(noMatch).toHaveLength(0);
    });

    it("does not match stripped list prefix characters", () => {
      const numberedText = "1. 第一条规章\n2. 第二条规章";
      const numberedCandidates = splitFloatingTextCandidates(numberedText);

      // 搜索正文可命中
      expect(filterFloatingSearchCandidates(numberedCandidates, "规章")).toHaveLength(2);
      // 搜索已被剥离的序号前缀 "1." 不会命中
      expect(filterFloatingSearchCandidates(numberedCandidates, "1.")).toHaveLength(0);
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
