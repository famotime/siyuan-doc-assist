import { describe, expect, test } from "vitest";
import {
  extractHighlightInlineCodeTexts,
  extractInlineMemoHint,
  normalizeInlineVisibleText,
  parseRemarkText,
  resolveSpanFormatType
} from "@/services/key-info-model";

describe("key info model", () => {
  test("normalizes visible inline text from markdown and html links", () => {
    expect(normalizeInlineVisibleText('<a href="siyuan://blocks/abc">标题</a> and [链接](https://example.com)'))
      .toBe("标题 and 链接");
  });

  test("extracts inline code from highlight raw content", () => {
    expect(extractHighlightInlineCodeTexts("==`code` 和 <code>html</code>==")).toEqual(["code", "html"]);
  });

  test("resolves span format type from type tokens and ial", () => {
    expect(resolveSpanFormatType("strong")).toBe("bold");
    expect(resolveSpanFormatType("text", "{: style=\"background-color: yellow;\"}")).toBe("highlight");
    expect(resolveSpanFormatType("inline-memo", "{: memo=\"note\"}")).toBe("remark");
  });

  test("parses remark text and memo hints", () => {
    expect(parseRemarkText("正文（备注）")).toEqual({ marked: "正文", memo: "备注" });
    expect(extractInlineMemoHint('{: memo="重要备注"}')).toBe("重要备注");
  });
});
