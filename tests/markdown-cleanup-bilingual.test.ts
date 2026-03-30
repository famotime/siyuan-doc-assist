import { describe, expect, test } from "vitest";
import { splitBilingualParagraphMarkdown } from "@/core/markdown-cleanup-core";

describe("splitBilingualParagraphMarkdown", () => {
  test("splits english paragraph followed by chinese paragraph", () => {
    const input = "Thank you for the donation you have made recently! We are truly grateful for your support, and without your help it wouldn't be possible to develop the project. We hope that our library can become something greater for you than just a resource with files.感谢您最近的捐赠！我们由衷感激您的支持，没有您的帮助，这个项目就无法开展。我们希望我们的图书馆对您而言，不仅仅是一个文件资源库，还能成为更有价值的存在。";
    const result = splitBilingualParagraphMarkdown(input);

    expect(result.changed).toBe(true);
    expect(result.parts).toEqual([
      "Thank you for the donation you have made recently! We are truly grateful for your support, and without your help it wouldn't be possible to develop the project. We hope that our library can become something greater for you than just a resource with files.",
      "感谢您最近的捐赠！我们由衷感激您的支持，没有您的帮助，这个项目就无法开展。我们希望我们的图书馆对您而言，不仅仅是一个文件资源库，还能成为更有价值的存在。",
    ]);
  });

  test("keeps chinese sentence with english product names intact", () => {
    const input = "该插件支持 Windows、macOS 和 Linux，也兼容 SiYuan、GitHub 与 VS Code 等常见工作流。";
    const result = splitBilingualParagraphMarkdown(input);

    expect(result.changed).toBe(false);
    expect(result.parts).toEqual([input]);
  });

  test("does not split when language switches multiple times", () => {
    const input = "Thank you for the support. 感谢你的支持。We will keep improving the project.";
    const result = splitBilingualParagraphMarkdown(input);

    expect(result.changed).toBe(false);
    expect(result.parts).toEqual([input]);
  });

  test("does not split short bilingual fragments", () => {
    const input = "Hello你好，谢谢";
    const result = splitBilingualParagraphMarkdown(input);

    expect(result.changed).toBe(false);
    expect(result.parts).toEqual([input]);
  });
});
