import { describe, expect, test } from "vitest";
import { applyBlockStyle } from "@/core/markdown-style-core";

describe("markdown-style-core", () => {
  test("bolds heading content and strips trailing attributes", () => {
    const input = "# Title {: id=\"abc\"}";
    expect(applyBlockStyle(input, "bold")).toBe("# **Title**");
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

  test("strips leading block attributes before styling", () => {
    const input =
      '{: updated="20260225233926" id="20260225233926-otnt3nd"}7b50784 更新版本号、图标信息';
    expect(applyBlockStyle(input, "bold")).toBe("**7b50784 更新版本号、图标信息**");
  });

  test("styles list item text when attributes are placed right after marker", () => {
    const input = '- {: id="a1" updated="20260225233926"}item';
    expect(applyBlockStyle(input, "highlight")).toBe("- ==item==");
  });

  test("strips trailing attributes from normal text block when styling", () => {
    const input = '补充对应测试。 {: id="20260225233926-3sosz6b" updated="20260225233926"}';
    expect(applyBlockStyle(input, "bold")).toBe("**补充对应测试。**");
  });
});
