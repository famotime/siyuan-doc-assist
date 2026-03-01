import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/services/kernel-shared", () => ({
  escapeSqlLiteral: vi.fn((value: string) => value.replace(/'/g, "''")),
  sqlPaged: vi.fn(),
}));

vi.mock("@/services/kernel", () => ({
  updateBlockMarkdown: vi.fn(),
}));

vi.mock("@/services/image-webp-converter", () => ({
  convertLocalAssetImageToWebp: vi.fn(),
}));

import { sqlPaged } from "@/services/kernel-shared";
import { updateBlockMarkdown } from "@/services/kernel";
import { convertLocalAssetImageToWebp } from "@/services/image-webp-converter";
import { convertDocImagesToWebp } from "@/services/image-webp";

const sqlPagedMock = vi.mocked(sqlPaged);
const updateBlockMarkdownMock = vi.mocked(updateBlockMarkdown);
const convertLocalAssetImageToWebpMock = vi.mocked(convertLocalAssetImageToWebp);

describe("image-webp service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("converts document images to webp and rewrites markdown links", async () => {
    sqlPagedMock.mockResolvedValue([
      {
        id: "b1",
        markdown: "![a](assets/a.png)\n![b](/assets/b.jpg?x=1)",
      } as any,
      {
        id: "b2",
        markdown: '<img src="/assets/a.png" />',
      } as any,
    ]);

    convertLocalAssetImageToWebpMock
      .mockResolvedValueOnce({
        sourceAssetPath: "/assets/a.png",
        targetAssetPath: "/assets/a.webp",
        converted: true,
        savedBytes: 1200,
      } as any)
      .mockResolvedValueOnce({
        sourceAssetPath: "/assets/b.jpg",
        targetAssetPath: "/assets/b.webp",
        converted: true,
        savedBytes: 800,
      } as any);

    const report = await convertDocImagesToWebp("doc-1");

    expect(convertLocalAssetImageToWebpMock).toHaveBeenCalledTimes(2);
    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(2);
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(
      1,
      "b1",
      "![a](assets/a.webp)\n![b](/assets/b.webp?x=1)"
    );
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(
      2,
      "b2",
      '<img src="/assets/a.webp" />'
    );
    expect(report).toEqual({
      scannedImageCount: 2,
      convertedImageCount: 2,
      skippedImageCount: 0,
      skippedGifCount: 0,
      failedImageCount: 0,
      replacedLinkCount: 3,
      updatedBlockCount: 2,
      totalSavedBytes: 2000,
    });
  });

  test("skips gif images for webp conversion", async () => {
    sqlPagedMock.mockResolvedValue([
      {
        id: "b1",
        markdown: "![a](assets/a.png)\n![g](/assets/anim.gif)\n![w](/assets/c.webp)",
      } as any,
    ]);
    convertLocalAssetImageToWebpMock.mockResolvedValue({
      sourceAssetPath: "/assets/a.png",
      targetAssetPath: "/assets/a.webp",
      converted: false,
      savedBytes: 0,
      reason: "no-size-gain",
    } as any);

    const report = await convertDocImagesToWebp("doc-1");

    expect(convertLocalAssetImageToWebpMock).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdownMock).not.toHaveBeenCalled();
    expect(report).toEqual({
      scannedImageCount: 3,
      convertedImageCount: 0,
      skippedImageCount: 3,
      skippedGifCount: 1,
      failedImageCount: 0,
      replacedLinkCount: 0,
      updatedBlockCount: 0,
      totalSavedBytes: 0,
    });
  });
});
