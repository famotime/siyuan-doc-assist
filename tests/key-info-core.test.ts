import { describe, expect, test } from "vitest";
import { buildKeyInfoMarkdown, extractKeyInfoFromMarkdown } from "@/core/key-info-core";

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
});
