import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/services/kernel-shared", () => ({
  escapeSqlLiteral: vi.fn((value: string) => value.replace(/'/g, "''")),
  sqlPaged: vi.fn(),
}));

vi.mock("@/services/kernel", () => ({
  updateBlockMarkdown: vi.fn(),
}));

vi.mock("@/services/image-display-size-converter", () => ({
  resizeLocalAssetImageByDisplaySize: vi.fn(),
}));

import { sqlPaged } from "@/services/kernel-shared";
import { updateBlockMarkdown } from "@/services/kernel";
import { resizeLocalAssetImageByDisplaySize } from "@/services/image-display-size-converter";
import { resizeDocImagesToDisplay } from "@/services/image-display-size";

const sqlPagedMock = vi.mocked(sqlPaged);
const updateBlockMarkdownMock = vi.mocked(updateBlockMarkdown);
const resizeLocalAssetImageByDisplaySizeMock = vi.mocked(resizeLocalAssetImageByDisplaySize);

describe("image-display-size service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("resizes display-sized images and rewrites only styled links", async () => {
    sqlPagedMock.mockResolvedValue([
      {
        id: "b1",
        markdown: [
          "![small](assets/a.png){: style=\"width: 300px;\"}",
          "![plain](assets/a.png)",
          "![other](/assets/b.jpg){: style=\"width: 200px;\"}",
        ].join("\n"),
      } as any,
      {
        id: "b2",
        markdown: '<img src="/assets/b.jpg?x=1" style="width: 200px;" />',
      } as any,
    ]);
    resizeLocalAssetImageByDisplaySizeMock
      .mockResolvedValueOnce({
        sourceAssetPath: "/assets/a.png",
        targetAssetPath: "/assets/a-resized.png",
        converted: true,
        savedBytes: 1024,
      } as any)
      .mockResolvedValueOnce({
        sourceAssetPath: "/assets/b.jpg",
        targetAssetPath: "/assets/b-resized.jpg",
        converted: true,
        savedBytes: 512,
      } as any);

    const report = await resizeDocImagesToDisplay("doc-1");

    expect(resizeLocalAssetImageByDisplaySizeMock).toHaveBeenCalledTimes(2);
    expect(resizeLocalAssetImageByDisplaySizeMock).toHaveBeenNthCalledWith(
      1,
      "/assets/a.png",
      { width: 300, height: null }
    );
    expect(resizeLocalAssetImageByDisplaySizeMock).toHaveBeenNthCalledWith(
      2,
      "/assets/b.jpg",
      { width: 200, height: null }
    );
    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(2);
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(
      1,
      "b1",
      [
        "![small](assets/a-resized.png){: style=\"width: 300px;\"}",
        "![plain](assets/a.png)",
        "![other](/assets/b-resized.jpg){: style=\"width: 200px;\"}",
      ].join("\n")
    );
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(
      2,
      "b2",
      '<img src="/assets/b-resized.jpg?x=1" style="width: 200px;" />'
    );
    expect(report).toEqual({
      scannedImageCount: 2,
      resizedImageCount: 2,
      skippedImageCount: 0,
      failedImageCount: 0,
      failedBlockCount: 0,
      replacedLinkCount: 3,
      updatedBlockCount: 2,
      totalSavedBytes: 1536,
    });
  });

  test("skips conflicted display sizes for same source asset", async () => {
    sqlPagedMock.mockResolvedValue([
      {
        id: "b1",
        markdown: [
          "![a](assets/a.png){: style=\"width: 300px;\"}",
          "![a](assets/a.png){: style=\"width: 200px;\"}",
        ].join("\n"),
      } as any,
    ]);

    const report = await resizeDocImagesToDisplay("doc-1");

    expect(resizeLocalAssetImageByDisplaySizeMock).not.toHaveBeenCalled();
    expect(updateBlockMarkdownMock).not.toHaveBeenCalled();
    expect(report).toEqual({
      scannedImageCount: 1,
      resizedImageCount: 0,
      skippedImageCount: 1,
      failedImageCount: 0,
      failedBlockCount: 0,
      replacedLinkCount: 0,
      updatedBlockCount: 0,
      totalSavedBytes: 0,
    });
  });

  test("skips blocks that fail to update and continues remaining resize rewrites", async () => {
    sqlPagedMock.mockResolvedValue([
      {
        id: "b1",
        markdown: '![a](assets/a.png){: style="width: 300px;"}',
      } as any,
      {
        id: "b2",
        markdown: '<img src="/assets/b.jpg" style="width: 200px;" />',
      } as any,
    ]);
    resizeLocalAssetImageByDisplaySizeMock
      .mockResolvedValueOnce({
        sourceAssetPath: "/assets/a.png",
        targetAssetPath: "/assets/a-resized.png",
        converted: true,
        savedBytes: 1024,
      } as any)
      .mockResolvedValueOnce({
        sourceAssetPath: "/assets/b.jpg",
        targetAssetPath: "/assets/b-resized.jpg",
        converted: true,
        savedBytes: 512,
      } as any);
    updateBlockMarkdownMock
      .mockRejectedValueOnce(new Error("missing block"))
      .mockResolvedValueOnce(undefined as any);

    const report = await resizeDocImagesToDisplay("doc-1");

    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(2);
    expect(report).toEqual({
      scannedImageCount: 2,
      resizedImageCount: 2,
      skippedImageCount: 0,
      failedImageCount: 0,
      failedBlockCount: 1,
      replacedLinkCount: 1,
      updatedBlockCount: 1,
      totalSavedBytes: 1536,
    });
  });
});
