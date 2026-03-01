import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/services/kernel-shared", () => ({
  escapeSqlLiteral: vi.fn((value: string) => value.replace(/'/g, "''")),
  sqlPaged: vi.fn(),
}));

vi.mock("@/services/kernel", () => ({
  updateBlockMarkdown: vi.fn(),
}));

vi.mock("@/services/image-png-converter", () => ({
  convertLocalAssetImageToPng: vi.fn(),
}));

import { sqlPaged } from "@/services/kernel-shared";
import { updateBlockMarkdown } from "@/services/kernel";
import { convertLocalAssetImageToPng } from "@/services/image-png-converter";
import { convertDocImagesToPng } from "@/services/image-png";

const sqlPagedMock = vi.mocked(sqlPaged);
const updateBlockMarkdownMock = vi.mocked(updateBlockMarkdown);
const convertLocalAssetImageToPngMock = vi.mocked(convertLocalAssetImageToPng);

describe("image-png service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("converts document images to png, rewrites links, and ignores gif", async () => {
    sqlPagedMock.mockResolvedValue([
      {
        id: "b1",
        markdown: "![a](assets/a.jpg)\n![g](/assets/g.gif)\n![w](/assets/w.webp?x=1)",
      } as any,
      {
        id: "b2",
        markdown: '<img src="/assets/a.jpg" />',
      } as any,
    ]);

    convertLocalAssetImageToPngMock
      .mockResolvedValueOnce({
        sourceAssetPath: "/assets/a.jpg",
        targetAssetPath: "/assets/a.png",
        converted: true,
        savedBytes: 0,
      } as any)
      .mockResolvedValueOnce({
        sourceAssetPath: "/assets/w.webp",
        targetAssetPath: "/assets/w.png",
        converted: true,
        savedBytes: 0,
      } as any);

    const report = await convertDocImagesToPng("doc-1");

    expect(convertLocalAssetImageToPngMock).toHaveBeenCalledTimes(2);
    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(2);
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(
      1,
      "b1",
      "![a](assets/a.png)\n![g](/assets/g.gif)\n![w](/assets/w.png?x=1)"
    );
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(
      2,
      "b2",
      '<img src="/assets/a.png" />'
    );
    expect(report).toEqual({
      scannedImageCount: 3,
      convertedImageCount: 2,
      skippedImageCount: 1,
      failedImageCount: 0,
      replacedLinkCount: 3,
      updatedBlockCount: 2,
      totalSavedBytes: 0,
    });
  });
});
