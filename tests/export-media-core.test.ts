import { describe, expect, test } from "vitest";
import {
  collectAssetLinksFromMarkdown,
  normalizeUploadFileName,
  rewriteMarkdownAssetLinksToBasename,
} from "@/core/export-media-core";

describe("export-media-core", () => {
  test("collects html src/href asset links and deduplicates entries", () => {
    const markdown = [
      '<img src="/assets/image-a.png?x=1#hash">',
      '<a href="assets/video-b.mp4">video</a>',
      '<img src="/assets/image-a.png?x=1#hash">',
      '<img src="https://example.com/remote.png">',
    ].join("\n");

    expect(collectAssetLinksFromMarkdown(markdown)).toEqual([
      "/assets/image-a.png?x=1#hash",
      "assets/video-b.mp4",
    ]);
  });

  test("rewrites longer matching links first to avoid partial replacement conflict", () => {
    const markdown = [
      "![a](assets/pic.png)",
      "![b](assets/pic.png?raw=1)",
    ].join("\n");

    const next = rewriteMarkdownAssetLinksToBasename(markdown, "assets");
    expect(next).toContain("![a](assets/pic.png)");
    expect(next).toContain("![b](assets/pic.png)");
  });

  test("falls back to safe default name when input is invalid", () => {
    const name = normalizeUploadFileName("....", "fallback.md");
    expect(name).toBe("fallback.md");
  });
});
