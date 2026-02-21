import { describe, expect, test } from "vitest";
import {
  collectAssetLinksFromMarkdown,
  getExportResourceAssetPaths,
  normalizeUploadFileName,
  rewriteMarkdownAssetLinksToBasename,
} from "@/core/export-media-core";

describe("export current doc with media", () => {
  test("collects only local assets links", () => {
    const markdown = [
      "![img](assets/image-20260201-abc.png)",
      "[video](/assets/video-20260201-def.mp4)",
      "[remote](https://example.com/file.png)",
      "![query](assets/image-20260201-abc.png?x=1#y)",
    ].join("\n");

    expect(collectAssetLinksFromMarkdown(markdown)).toEqual([
      "assets/image-20260201-abc.png",
      "/assets/video-20260201-def.mp4",
      "assets/image-20260201-abc.png?x=1#y",
    ]);
  });

  test("rewrites asset link to assets subdirectory for zip layout", () => {
    const markdown = "![img](assets/image-20260201-abc.png)\n[video](/assets/video-20260201-def.mp4)";
    const next = rewriteMarkdownAssetLinksToBasename(markdown, "assets");
    expect(next).toContain("![img](assets/image-20260201-abc.png)");
    expect(next).toContain("[video](assets/video-20260201-def.mp4)");
  });

  test("builds export resource paths with normalized /data/assets prefix", () => {
    const markdown = "![img](assets/a.png)\n![img2](/assets/b.png)\n[http](https://a.com/x.png)";
    expect(getExportResourceAssetPaths(markdown)).toEqual([
      "/data/assets/a.png",
      "/data/assets/b.png",
    ]);
  });

  test("normalizes markdown filename for putFile path validation", () => {
    const raw = "我的 OpenClaw Token 账单降了72%，只因装了这个插件 (Duplicated 2026-02-21 15:38:08).md";
    const normalized = normalizeUploadFileName(raw, "doc.md");
    expect(normalized).toMatch(/\.md$/);
    expect(normalized).not.toContain(":");
    expect(normalized).not.toContain("%");
    expect(normalized).not.toContain("(");
    expect(normalized).not.toContain(")");
  });
});
