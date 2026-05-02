import { describe, expect, test, vi, beforeEach } from "vitest";
import type { ChildBlockMeta } from "@/services/kernel-block";
import type { DocMeta } from "@/services/kernel";

vi.mock("@/services/kernel", () => ({
  getDocMetaByID: vi.fn(),
  getChildBlocksByParentId: vi.fn(),
  createDocWithMd: vi.fn(),
  deleteBlocksByIds: vi.fn(),
}));

import {
  getDocMetaByID,
  getChildBlocksByParentId,
  createDocWithMd,
  deleteBlocksByIds,
} from "@/services/kernel";
import { splitDocByHeadings } from "@/services/split-doc-by-headings";

const mockGetDocMeta = vi.mocked(getDocMetaByID);
const mockGetChildBlocks = vi.mocked(getChildBlocksByParentId);
const mockCreateDoc = vi.mocked(createDocWithMd);
const mockDeleteBlocks = vi.mocked(deleteBlocksByIds);

function block(id: string, type: string, markdown: string): ChildBlockMeta {
  return { id, type, content: markdown, markdown };
}

const testDocMeta: DocMeta = {
  id: "doc-1",
  parentId: "",
  rootId: "doc-1",
  box: "nb-1",
  path: "/20260101120000-abc123.sy",
  hPath: "/Notebook/TestDoc",
  updated: "2026-05-01",
  title: "TestDoc",
};

describe("splitDocByHeadings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("throws when document has no headings", async () => {
    mockGetDocMeta.mockResolvedValue(testDocMeta);
    mockGetChildBlocks.mockResolvedValue([
      block("b1", "p", "paragraph"),
    ]);
    await expect(splitDocByHeadings("doc-1")).rejects.toThrow("未找到标题");
  });

  test("throws when document has only one section", async () => {
    mockGetDocMeta.mockResolvedValue(testDocMeta);
    mockGetChildBlocks.mockResolvedValue([
      block("b1", "h", "## Only Section"),
      block("b2", "p", "content"),
    ]);
    await expect(splitDocByHeadings("doc-1")).rejects.toThrow("仅有一个");
  });

  test("creates child documents and deletes blocks on success", async () => {
    mockGetDocMeta.mockResolvedValue(testDocMeta);
    mockGetChildBlocks.mockResolvedValue([
      block("b1", "h", "## Alpha"),
      block("b2", "p", "content A"),
      block("b3", "h", "## Beta"),
      block("b4", "p", "content B"),
    ]);
    mockCreateDoc
      .mockResolvedValueOnce("new-doc-1")
      .mockResolvedValueOnce("new-doc-2");
    mockDeleteBlocks.mockResolvedValue({ deletedCount: 4, failedIds: [] });

    const report = await splitDocByHeadings("doc-1");

    expect(mockCreateDoc).toHaveBeenCalledTimes(2);
    expect(mockCreateDoc).toHaveBeenCalledWith("nb-1", "/Notebook/TestDoc/Alpha", "content A");
    expect(mockCreateDoc).toHaveBeenCalledWith("nb-1", "/Notebook/TestDoc/Beta", "content B");
    expect(mockDeleteBlocks).toHaveBeenCalledWith(["b1", "b2", "b3", "b4"]);
    expect(report).toEqual({
      sectionCount: 2,
      createdDocIds: ["new-doc-1", "new-doc-2"],
      deletedBlockCount: 4,
    });
  });

  test("does not delete pre-heading blocks", async () => {
    mockGetDocMeta.mockResolvedValue(testDocMeta);
    mockGetChildBlocks.mockResolvedValue([
      block("b0", "p", "intro"),
      block("b1", "h", "## Alpha"),
      block("b2", "p", "content A"),
      block("b3", "h", "## Beta"),
      block("b4", "p", "content B"),
    ]);
    mockCreateDoc
      .mockResolvedValueOnce("new-doc-1")
      .mockResolvedValueOnce("new-doc-2");
    mockDeleteBlocks.mockResolvedValue({ deletedCount: 4, failedIds: [] });

    await splitDocByHeadings("doc-1");

    expect(mockDeleteBlocks).toHaveBeenCalledWith(["b1", "b2", "b3", "b4"]);
  });

  test("sanitizes invalid characters from heading title", async () => {
    mockGetDocMeta.mockResolvedValue(testDocMeta);
    mockGetChildBlocks.mockResolvedValue([
      block("b1", "h", "## Bad/Title:*?"),
      block("b2", "p", "content"),
      block("b3", "h", "## Good Title"),
      block("b4", "p", "more"),
    ]);
    mockCreateDoc
      .mockResolvedValueOnce("new-doc-1")
      .mockResolvedValueOnce("new-doc-2");
    mockDeleteBlocks.mockResolvedValue({ deletedCount: 4, failedIds: [] });

    await splitDocByHeadings("doc-1");

    expect(mockCreateDoc).toHaveBeenCalledWith("nb-1", "/Notebook/TestDoc/BadTitle", expect.any(String));
  });
});
