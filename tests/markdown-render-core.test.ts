import { describe, expect, it } from "vitest";
import { renderMarkdownToHtml } from "@/core/markdown-render-core";

describe("markdown-render-core", () => {
  it("returns empty string on empty or non-string input", () => {
    expect(renderMarkdownToHtml("")).toBe("");
    expect(renderMarkdownToHtml(null as any)).toBe("");
    expect(renderMarkdownToHtml(undefined as any)).toBe("");
  });

  it("renders unordered lists wrapped in ul and li", () => {
    const md = "- 项目一\n- 项目二\n  - 子项目 A";
    const html = renderMarkdownToHtml(md);
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>");
    expect(html).toContain("项目一");
    expect(html).toContain("项目二");
    expect(html).toContain("子项目 A");
    expect(html).toContain("</ul>");
  });

  it("renders ordered lists wrapped in ol and li", () => {
    const md = "1. 第一步\n2. 第二步";
    const html = renderMarkdownToHtml(md);
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>");
    expect(html).toContain("第一步");
    expect(html).toContain("第二步");
    expect(html).toContain("</ol>");
  });

  it("renders task lists with checkbox inputs", () => {
    const md = "- [ ] 待办事项\n- [x] 已完成事项";
    const html = renderMarkdownToHtml(md);
    expect(html).toContain('<input disabled="" type="checkbox"');
    expect(html).toContain("待办事项");
    expect(html).toContain("checked");
  });

  it("renders tables with table, thead, tbody, th, td", () => {
    const md = "| 标题 1 | 标题 2 |\n| --- | --- |\n| 内容 A | 内容 B |";
    const html = renderMarkdownToHtml(md);
    expect(html).toContain("<table>");
    expect(html).toContain("<thead>");
    expect(html).toContain("<th>标题 1</th>");
    expect(html).toContain("<td>内容 A</td>");
  });

  it("prioritizes lute instance if provided", () => {
    const mockLute = {
      MarkdownStr: (name: string, content: string) => `<div class="lute-rendered">${content}</div>`,
    };
    const html = renderMarkdownToHtml("测试内容", { lute: mockLute });
    expect(html).toBe('<div class="lute-rendered">测试内容</div>');
  });
});
