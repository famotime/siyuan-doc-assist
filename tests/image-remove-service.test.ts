import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/services/kernel-shared", () => ({
  escapeSqlLiteral: vi.fn((value: string) => value.replace(/'/g, "''")),
  sqlPaged: vi.fn(),
}));

vi.mock("@/services/kernel", () => ({
  updateBlockMarkdown: vi.fn(),
}));

import { sqlPaged } from "@/services/kernel-shared";
import { updateBlockMarkdown } from "@/services/kernel";
import { removeDocImageLinks } from "@/services/image-remove";

const sqlPagedMock = vi.mocked(sqlPaged);
const updateBlockMarkdownMock = vi.mocked(updateBlockMarkdown);

describe("image-remove service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("removes image links from document blocks", async () => {
    sqlPagedMock.mockResolvedValue([
      {
        id: "b1",
        markdown: "text ![a](assets/a.png)\n<img src=\"/assets/b.jpg\" />",
      } as any,
      {
        id: "b2",
        markdown: "![remote](https://example.com/r.png)",
      } as any,
    ]);

    const report = await removeDocImageLinks("doc-1");

    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(2);
    expect(updateBlockMarkdownMock).toHaveBeenCalledWith("b1", "text \n");
    expect(updateBlockMarkdownMock).toHaveBeenCalledWith("b2", "");
    expect(report).toEqual({
      scannedImageLinkCount: 3,
      removedLinkCount: 3,
      updatedBlockCount: 2,
      failedBlockCount: 0,
    });
  });
});
