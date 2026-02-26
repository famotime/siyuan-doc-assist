import { describe, expect, test } from "vitest";
import { applyBlockStyle } from "@/core/markdown-style-core";

describe("markdown-style-core", () => {
  test("bolds heading content and preserves trailing attributes", () => {
    const input = "# Title {: id=\"abc\"}";
    expect(applyBlockStyle(input, "bold")).toBe("# **Title** {: id=\"abc\"}");
  });

  test("highlights list item content", () => {
    const input = "- item";
    expect(applyBlockStyle(input, "highlight")).toBe("- ==item==");
  });

  test("keeps attribute-only lines untouched", () => {
    const input = "{: id=\"xyz\"}";
    expect(applyBlockStyle(input, "bold")).toBe("{: id=\"xyz\"}");
  });

  test("normalizes partial bold content to fully bold block", () => {
    const input = "Hello **World**";
    expect(applyBlockStyle(input, "bold")).toBe("**Hello World**");
  });

  test("toggles fully bold content back to plain text", () => {
    const input = "**Hello World**";
    expect(applyBlockStyle(input, "bold")).toBe("Hello World");
  });

  test("toggles fully highlighted list item back to plain item", () => {
    const input = "- ==item==";
    expect(applyBlockStyle(input, "highlight")).toBe("- item");
  });
});
