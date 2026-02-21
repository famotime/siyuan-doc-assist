import { describe, expect, test } from "vitest";
import { extractKeyInfoFromMarkdown } from "@/core/key-info-core";

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
});
