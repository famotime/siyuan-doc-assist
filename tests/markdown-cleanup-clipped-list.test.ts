import { describe, expect, test } from "vitest";
import { removeClippedListPrefixesFromMarkdown } from "@/core/markdown-cleanup-core";

describe("removeClippedListPrefixesFromMarkdown", () => {
  test("removes bullet char from unordered list item", () => {
    const input = '- {: id="a" updated="x"}• **bold text**\n  {: id="b" updated="x"}';
    const { markdown, removedCount } = removeClippedListPrefixesFromMarkdown(input);
    expect(removedCount).toBe(1);
    expect(markdown).toBe('- {: id="a" updated="x"}**bold text**\n  {: id="b" updated="x"}');
  });

  test("removes bullet char from multiple unordered list items", () => {
    const input = [
      '- {: id="a"}• item one',
      '  {: id="a1"}',
      '- {: id="b"}• item two',
      '  {: id="b1"}',
      '{: id="list"}',
    ].join("\n");
    const { markdown, removedCount } = removeClippedListPrefixesFromMarkdown(input);
    expect(removedCount).toBe(2);
    expect(markdown).toContain('- {: id="a"}item one');
    expect(markdown).toContain('- {: id="b"}item two');
  });

  test("flattens ordered list with empty outer wrapper", () => {
    const input = [
      '1. {: id="outer"}',
      '   1. {: id="inner"}content here',
      '      {: id="inner-ial"}',
      '   {: id="outer-ial"}',
      '{: id="list"}',
    ].join("\n");
    const { markdown, removedCount } = removeClippedListPrefixesFromMarkdown(input);
    expect(removedCount).toBe(1);
    expect(markdown).toContain('1. {: id="inner"}content here');
    expect(markdown).not.toContain('   1.');
  });

  test("flattens multiple ordered list items with empty outer wrappers", () => {
    const input = [
      '1. {: id="o1"}',
      '   1. {: id="i1"}first item',
      '      {: id="i1a"}',
      '   {: id="o1a"}',
      '2. {: id="o2"}',
      '   2. {: id="i2"}second item',
      '      {: id="i2a"}',
      '   {: id="o2a"}',
      '{: id="list"}',
    ].join("\n");
    const { markdown, removedCount } = removeClippedListPrefixesFromMarkdown(input);
    expect(removedCount).toBe(2);
    expect(markdown).toContain('1. {: id="i1"}first item');
    expect(markdown).toContain('2. {: id="i2"}second item');
    expect(markdown).not.toContain('   1.');
    expect(markdown).not.toContain('   2.');
  });

  test("does not modify list items without duplicate prefix", () => {
    const input = '- {: id="a"}plain text\n  {: id="b"}';
    const { markdown, removedCount } = removeClippedListPrefixesFromMarkdown(input);
    expect(removedCount).toBe(0);
    expect(markdown).toBe(input);
  });

  test("removes duplicate bullet characters from flattened unordered list markdown", () => {
    const input = [
      "- • **84% 的 Uber 开发者已在使用智能体化编程**（使用命令行智能体，或在 IDE 中发起的智能体请求多于 Tab 补全）",
      "- • **65-72% 的代码由 AI 生成**，这是 IDE 工具中的数据。*对于 Claude Code 这类 AI 命令行工具，这个数字自然是 100%。*",
      "- • **Claude Code 的使用率三个月内几乎翻倍**，从去年 12 月的 32% 涨到今年 2 月的 63%，而 IDE 工具（Cursor、IntelliJ）的使用率已趋于平稳。",
    ].join("\n");
    const { markdown, removedCount } = removeClippedListPrefixesFromMarkdown(input);
    expect(removedCount).toBe(3);
    expect(markdown).toBe(
      [
        "- **84% 的 Uber 开发者已在使用智能体化编程**（使用命令行智能体，或在 IDE 中发起的智能体请求多于 Tab 补全）",
        "- **65-72% 的代码由 AI 生成**，这是 IDE 工具中的数据。*对于 Claude Code 这类 AI 命令行工具，这个数字自然是 100%。*",
        "- **Claude Code 的使用率三个月内几乎翻倍**，从去年 12 月的 32% 涨到今年 2 月的 63%，而 IDE 工具（Cursor、IntelliJ）的使用率已趋于平稳。",
      ].join("\n")
    );
  });

  test("removes duplicate ordered markers from flattened ordered list markdown", () => {
    const input = [
      "1. 1. Notion 的 AI harness（围绕大模型构建的系统层）**大约每六个月推倒重写一次**，很多公司做了一版就不动了，Simon 认为这是常见错误。",
      "2. 2. Notion **尝试了三到四次才做出能用的通用 Agent**。2025 年 9 月发布 Personal Agent，2026 年 2 月发布可自主运行的 Custom Agent。",
    ].join("\n");
    const { markdown, removedCount } = removeClippedListPrefixesFromMarkdown(input);
    expect(removedCount).toBe(2);
    expect(markdown).toBe(
      [
        "1. Notion 的 AI harness（围绕大模型构建的系统层）**大约每六个月推倒重写一次**，很多公司做了一版就不动了，Simon 认为这是常见错误。",
        "2. Notion **尝试了三到四次才做出能用的通用 Agent**。2025 年 9 月发布 Personal Agent，2026 年 2 月发布可自主运行的 Custom Agent。",
      ].join("\n")
    );
  });

  test("does not modify ordered list where numbers differ", () => {
    const input = [
      '1. {: id="o1"}',
      '   2. {: id="i1"}different number',
      '   {: id="o1a"}',
      '{: id="list"}',
    ].join("\n");
    const { markdown, removedCount } = removeClippedListPrefixesFromMarkdown(input);
    expect(removedCount).toBe(0);
    expect(markdown).toBe(input);
  });

  test("returns empty string unchanged", () => {
    const { markdown, removedCount } = removeClippedListPrefixesFromMarkdown("");
    expect(removedCount).toBe(0);
    expect(markdown).toBe("");
  });

  test("handles various bullet chars", () => {
    const chars = ["·", "○", "◦", "▪", "▸", "→"];
    for (const ch of chars) {
      const input = `- {: id="a"}${ch} text`;
      const { removedCount } = removeClippedListPrefixesFromMarkdown(input);
      expect(removedCount, `char ${ch}`).toBe(1);
    }
  });
});
