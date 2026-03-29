import { describe, expect, test } from "vitest";
import {
  buildDefaultKeyInfoFilter,
  filterKeyInfoItems,
  buildKeyInfoMarkdown,
  extractKeyInfoFromMarkdown,
} from "@/core/key-info-core";

describe("key-info-core", () => {
  test("extracts headings and inline key info", () => {
    const markdown = [
      "# 主标题",
      "正文包含 **加粗**、*斜体*、==高亮==、%%备注%%、#标签。",
      "另一个 <mark>标记</mark>。",
    ].join("\n");

    const items = extractKeyInfoFromMarkdown(markdown);
    const texts = items.map((item) => `${item.type}:${item.text}`);

    expect(texts).toContain("title:主标题");
    expect(texts).toContain("bold:加粗");
    expect(texts).toContain("italic:斜体");
    expect(texts).toContain("highlight:高亮");
    expect(texts).toContain("remark:备注");
    expect(texts).toContain("tag:标签");
    expect(texts).toContain("highlight:标记");
  });

  test("extracts underline content separately from italic and excludes code from default filter", () => {
    const markdown = [
      "正文包含 _斜体_、<u>下划线</u>、<ins>强调下划</ins>。",
      "再来一个 <span data-type=\"u\">编辑态下划</span>。",
    ].join("\n");

    const items = extractKeyInfoFromMarkdown(markdown);
    const texts = items.map((item) => `${item.type}:${item.text}`);

    expect(texts).toContain("italic:斜体");
    expect(texts).toContain("underline:下划线");
    expect(texts).toContain("underline:强调下划");
    expect(texts).toContain("underline:编辑态下划");
    expect(buildDefaultKeyInfoFilter()).toContain("underline");
    expect(buildDefaultKeyInfoFilter()).not.toContain("code");
  });

  test("ignores content inside code blocks and inline code", () => {
    const markdown = [
      "正文 `**不应识别**`",
      "```",
      "# 代码标题",
      "**加粗**",
      "==高亮==",
      "%%备注%%",
      "#标签",
      "```",
    ].join("\n");

    const items = extractKeyInfoFromMarkdown(markdown);
    expect(items).toHaveLength(0);
  });

  test("ignores inline key info inside heading lines", () => {
    const markdown = [
      "# **标题一**",
      "## ==标题二==",
      "正文 **正文加粗** 与 #正文标签。",
    ].join("\n");

    const items = extractKeyInfoFromMarkdown(markdown);
    const headingInline = items.filter(
      (item) =>
        (item.type === "bold" && item.text === "标题一") ||
        (item.type === "highlight" && item.text === "标题二")
    );
    const bodyInline = items.filter(
      (item) =>
        (item.type === "bold" && item.text === "正文加粗") ||
        (item.type === "tag" && item.text === "正文标签")
    );

    expect(items.filter((item) => item.type === "title")).toHaveLength(2);
    expect(headingInline).toHaveLength(0);
    expect(bodyInline).toHaveLength(2);
  });

  test("keeps heading title complete when heading contains bold and highlight", () => {
    const markdown = "## **123****==456==****789**";

    const items = extractKeyInfoFromMarkdown(markdown);
    const titles = items.filter((item) => item.type === "title");
    const inline = items.filter((item) => item.type === "bold" || item.type === "highlight");

    expect(titles).toHaveLength(1);
    expect(titles[0]?.text).toBe("123456789");
    expect(inline).toHaveLength(0);
  });

  test("does not extract italic from markdown link content", () => {
    const markdown = "链接 [a_b](https://example.com/a_b) 与 [说明 _x_](https://example.com) 和 *有效*";

    const items = extractKeyInfoFromMarkdown(markdown);
    const italicItems = items.filter((item) => item.type === "italic").map((item) => item.text);

    expect(italicItems).toEqual(["有效"]);
  });

  test("extracts links and refs as key info", () => {
    const markdown = [
      "普通链接 [官网](https://example.com/docs)",
      "文档链接 [文档别名](siyuan://blocks/20260202121212-bcdefg2)",
      "自动链接 <https://example.com/plain>",
      '块引用 ((20260202121212-bcdefg2 "引用别名"))',
      '双向链接 [[20260303131313-cdefgh3 "双向别名"]]',
    ].join("\n");

    const items = extractKeyInfoFromMarkdown(markdown);
    const texts = items.map((item) => `${item.type}:${item.text}`);

    expect(texts).toContain("link:[官网](https://example.com/docs)");
    expect(texts).toContain("link:[文档别名](siyuan://blocks/20260202121212-bcdefg2)");
    expect(texts).toContain("link:<https://example.com/plain>");
    expect(texts).toContain('ref:((20260202121212-bcdefg2 "引用别名"))');
    expect(texts).toContain('ref:[[20260303131313-cdefgh3 "双向别名"]]');
  });

  test("does not extract inline formatting from inside links and refs", () => {
    const markdown = [
      "[**加粗链接**](https://example.com)",
      '[==高亮文档链接==](siyuan://blocks/20260202121212-bcdefg2)',
      '((20260202121212-bcdefg2 "**引用加粗**"))',
      '[[20260303131313-cdefgh3 "*引用斜体*"]]',
    ].join("\n");

    const items = extractKeyInfoFromMarkdown(markdown);
    const texts = items.map((item) => `${item.type}:${item.text}`);

    expect(texts).toContain("link:[**加粗链接**](https://example.com)");
    expect(texts).toContain("link:[==高亮文档链接==](siyuan://blocks/20260202121212-bcdefg2)");
    expect(texts).toContain('ref:((20260202121212-bcdefg2 "**引用加粗**"))');
    expect(texts).toContain('ref:[[20260303131313-cdefgh3 "*引用斜体*"]]');
    expect(items.filter((item) => item.type === "bold")).toHaveLength(0);
    expect(items.filter((item) => item.type === "italic")).toHaveLength(0);
    expect(items.filter((item) => item.type === "highlight")).toHaveLength(0);
  });

  test("normalizes wrapped markdown links without surfacing extra opening bracket", () => {
    const markdown = "[[官网](https://example.com/path)]";

    const items = extractKeyInfoFromMarkdown(markdown);
    const linkTexts = items.filter((item) => item.type === "link").map((item) => item.text);

    expect(linkTexts).toEqual(["[官网](https://example.com/path)"]);
  });

  test("ignores links and refs inside code blocks and inline code", () => {
    const markdown = [
      "正文 `[inline](https://example.com) ((20260202121212-bcdefg2 \"引用\"))`",
      "```",
      "[code](https://example.com)",
      '((20260202121212-bcdefg2 "引用"))',
      '[[20260303131313-cdefgh3 "双向别名"]]',
      "```",
    ].join("\n");

    const items = extractKeyInfoFromMarkdown(markdown);

    expect(items).toHaveLength(0);
  });

  test("does not extract escaped markdown markers as bold or italic", () => {
    const markdown = [
      "正文 \\*不是斜体\\* 与 \\_也不是斜体\\_。",
      "正文 \\*\\*不是加粗\\*\\* 与 \\_\\_也不是加粗\\_\\_。",
      "正文 *有效斜体* 与 **有效加粗**。",
    ].join("\n");

    const items = extractKeyInfoFromMarkdown(markdown);
    const italicItems = items.filter((item) => item.type === "italic").map((item) => item.text);
    const boldItems = items.filter((item) => item.type === "bold").map((item) => item.text);

    expect(italicItems).toEqual(["有效斜体"]);
    expect(boldItems).toEqual(["有效加粗"]);
  });

  test("filters meaningless key info content", () => {
    const markdown = [
      "正文 <strong>*</strong> 与 <em>\\</em> 与 <mark>=</mark>。",
      "正文 **   **、*\\t*、== = ==。",
      "正文 **有效**、*有效*、==有效==。",
    ].join("\n");

    const items = extractKeyInfoFromMarkdown(markdown);
    const texts = items.map((item) => `${item.type}:${item.text}`);

    expect(texts).not.toContain("bold:*");
    expect(texts).not.toContain("italic:\\");
    expect(texts).not.toContain("highlight:=");
    expect(texts).toContain("bold:有效");
    expect(texts).toContain("italic:有效");
    expect(texts).toContain("highlight:有效");
  });

  test("prefixes list item key info when exporting markdown", () => {
    const markdown = buildKeyInfoMarkdown([
      { text: "加粗", raw: "**加粗**", listItem: true },
      { text: "斜体", raw: "*斜体*" },
      { text: "已有前缀", raw: "- ==已有前缀==", listItem: true },
    ]);

    expect(markdown.split("\n")).toEqual([
      "- **加粗**",
      "*斜体*",
      "- ==已有前缀==",
    ]);
  });

  test("preserves explicit ordered list prefix when exporting markdown", () => {
    const markdown = buildKeyInfoMarkdown([
      { text: "有序内容", raw: "**有序内容**", listPrefix: "3. " },
    ]);

    expect(markdown).toBe("3. **有序内容**");
  });

  test("suppresses heading inline duplicates only when title is visible in current filter", () => {
    const items = [
      {
        id: "h1-heading-0",
        type: "title" as const,
        text: "标题",
        raw: "# 标题",
        offset: 0,
        blockId: "h1",
        blockSort: 0,
        order: 0,
      },
      {
        id: "h1-inline-1",
        type: "highlight" as const,
        text: "标题",
        raw: "==标题==",
        offset: 0,
        blockId: "h1",
        blockSort: 0,
        order: 1,
      },
    ];

    expect(filterKeyInfoItems(items, ["title", "highlight"]).map((item) => item.type)).toEqual([
      "title",
    ]);
    expect(filterKeyInfoItems(items, ["highlight"]).map((item) => item.type)).toEqual([
      "highlight",
    ]);
  });
});
