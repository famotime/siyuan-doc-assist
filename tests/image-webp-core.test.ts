import { describe, expect, test } from "vitest";
import {
  collectConvertibleLocalImageAssetPathsFromMarkdown,
  collectLocalImageAssetPathsFromMarkdown,
  removeMarkdownImageAssetLinks,
  rewriteMarkdownImageAssetLinks,
  toPngAssetPath,
  toWebpAssetPath,
} from "@/core/image-webp-core";

describe("image-webp-core", () => {
  test("collects local image asset paths from markdown and html", () => {
    const markdown = [
      "![a](assets/photo.png)",
      "![b](/assets/photo.png?x=1#hash)",
      '<img src="/assets/COVER.JPG" />',
      "![remote](https://example.com/a.png)",
      "![video](/assets/a.mp4)",
    ].join("\n");

    expect(collectLocalImageAssetPathsFromMarkdown(markdown)).toEqual([
      "/assets/photo.png",
      "/assets/COVER.JPG",
    ]);
  });

  test("collects only convertible local image asset paths", () => {
    const markdown = [
      "![png](/assets/a.png)",
      "![jpg](/assets/b.jpg)",
      "![webp](/assets/c.webp)",
      "![gif](/assets/d.gif)",
      "![svg](/assets/e.svg)",
    ].join("\n");

    expect(collectConvertibleLocalImageAssetPathsFromMarkdown(markdown)).toEqual([
      "/assets/a.png",
      "/assets/b.jpg",
    ]);
  });

  test("rewrites matched image asset links and preserves query/hash and slash style", () => {
    const markdown = [
      "![a](assets/a.png?raw=1#x)",
      "![b](/assets/b.jpeg)",
      '<img src="/assets/a.png?x=1" />',
    ].join("\n");

    const result = rewriteMarkdownImageAssetLinks(markdown, {
      "/assets/a.png": "/assets/a.webp",
      "/assets/b.jpeg": "/assets/b.webp",
    });

    expect(result.replacedCount).toBe(3);
    expect(result.markdown).toContain("![a](assets/a.webp?raw=1#x)");
    expect(result.markdown).toContain("![b](/assets/b.webp)");
    expect(result.markdown).toContain('<img src="/assets/a.webp?x=1" />');
  });

  test("maps any supported extension to .webp", () => {
    expect(toWebpAssetPath("/assets/a.PNG")).toBe("/assets/a.webp");
    expect(toWebpAssetPath("/assets/b.jpeg")).toBe("/assets/b.webp");
  });

  test("maps any supported extension to .png", () => {
    expect(toPngAssetPath("/assets/a.WEBP")).toBe("/assets/a.png");
    expect(toPngAssetPath("/assets/b.jpeg")).toBe("/assets/b.png");
  });

  test("removes markdown and html image links", () => {
    const markdown = [
      "A ![a](assets/a.png) B",
      '<img src="/assets/b.jpg?x=1" />',
      "![remote](https://example.com/x.png)",
      "![video](/assets/v.mp4)",
    ].join("\n");
    const result = removeMarkdownImageAssetLinks(markdown);

    expect(result.removedCount).toBe(3);
    expect(result.markdown).toContain("A  B");
    expect(result.markdown).not.toContain('<img src="/assets/b.jpg?x=1" />');
    expect(result.markdown).not.toContain("![remote](https://example.com/x.png)");
    expect(result.markdown).toContain("![video](/assets/v.mp4)");
  });
});
