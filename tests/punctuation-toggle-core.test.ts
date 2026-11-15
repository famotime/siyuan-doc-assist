import { describe, expect, test } from "vitest";
import {
  convertChineseEnglishPunctuation,
  detectPunctuationToggleMode,
  toggleChineseEnglishPunctuation
} from "@/core/punctuation-toggle-core";

describe("punctuation-toggle-core", () => {
  test("defaults to english-to-chinese mode when english punctuation exists", () => {
    expect(detectPunctuationToggleMode("Hello, world!")).toBe("en-to-zh");
    expect(detectPunctuationToggleMode("你好，world!")).toBe("en-to-zh");
  });

  test("switches to chinese-to-english mode when punctuation is all chinese", () => {
    expect(detectPunctuationToggleMode("你好，世界！")).toBe("zh-to-en");
  });

  test("converts english punctuation to chinese by mode", () => {
    const result = convertChineseEnglishPunctuation("A, B. C?", "en-to-zh");
    expect(result).toEqual({
      next: "A， B。 C？",
      changedCount: 3
    });
  });

  test("keeps numeric commas and periods unchanged in english-to-chinese mode", () => {
    const result = convertChineseEnglishPunctuation(
      "价格 1,234.56 元，约 7.5%",
      "en-to-zh"
    );
    expect(result).toEqual({
      next: "价格 1,234.56 元，约 7.5%",
      changedCount: 0
    });
  });

  test("only converts non-numeric punctuation in mixed english-to-chinese text", () => {
    const result = convertChineseEnglishPunctuation(
      "Version 1.2.3, build 4,567.",
      "en-to-zh"
    );
    expect(result).toEqual({
      next: "Version 1.2.3， build 4,567。",
      changedCount: 2
    });
  });

  test("converts chinese punctuation to english by mode", () => {
    const result = convertChineseEnglishPunctuation("你好，世界！", "zh-to-en");
    expect(result).toEqual({
      next: "你好,世界!",
      changedCount: 2
    });
  });

  test("normalizes fullwidth english punctuation to standard chinese fullwidth punctuation", () => {
    const result = convertChineseEnglishPunctuation(
      "英文［test］．中文＜标题＞",
      "en-to-zh"
    );
    expect(result).toEqual({
      next: "英文【test】。中文《标题》",
      changedCount: 5
    });
  });

  test("recognizes halfwidth chinese punctuation and converts to standard english halfwidth punctuation", () => {
    expect(detectPunctuationToggleMode("半角中文｡､")).toBe("zh-to-en");
    const result = convertChineseEnglishPunctuation(
      "半角中文｡逗号､引号｢内容｣",
      "zh-to-en"
    );
    expect(result).toEqual({
      next: "半角中文.逗号,引号\"内容\"",
      changedCount: 4
    });
  });

  test("auto toggles by detected mode", () => {
    expect(toggleChineseEnglishPunctuation("Hello, world!")).toEqual({
      mode: "en-to-zh",
      next: "Hello， world！",
      changedCount: 2
    });
    expect(toggleChineseEnglishPunctuation("Rate 3.5, total 12,000 items!")).toEqual({
      mode: "en-to-zh",
      next: "Rate 3.5， total 12,000 items！",
      changedCount: 2
    });
    expect(toggleChineseEnglishPunctuation("你好，世界！")).toEqual({
      mode: "zh-to-en",
      next: "你好,世界!",
      changedCount: 2
    });
  });
});
