import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/services/kernel", () => ({
  getChildDocTitles: vi.fn(),
  getDocMetasByIDs: vi.fn(),
  moveDocsByID: vi.fn(),
  renameDocByID: vi.fn(),
}));

import {
  getChildDocTitles,
  getDocMetasByIDs,
  moveDocsByID,
  renameDocByID,
} from "@/services/kernel";
import { moveDocsAsChildren } from "@/services/mover";

const getChildDocTitlesMock = vi.mocked(getChildDocTitles);
const getDocMetasByIDsMock = vi.mocked(getDocMetasByIDs);
const moveDocsByIDMock = vi.mocked(moveDocsByID);
const renameDocByIDMock = vi.mocked(renameDocByID);

describe("mover service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChildDocTitlesMock.mockResolvedValue([]);
    getDocMetasByIDsMock.mockResolvedValue([]);
    moveDocsByIDMock.mockResolvedValue(undefined as any);
    renameDocByIDMock.mockResolvedValue(undefined as any);
  });

  test("moves docs, renames on title conflict, and reports missing metadata", async () => {
    getChildDocTitlesMock.mockResolvedValue(["标题A"]);
    getDocMetasByIDsMock.mockResolvedValue([
      {
        id: "doc-a",
        title: "标题A",
        parentId: "another-parent",
      },
      {
        id: "doc-b",
        title: "标题B",
        parentId: "another-parent",
      },
    ] as any);

    const result = await moveDocsAsChildren("parent-doc", [
      "doc-a",
      "doc-a",
      "parent-doc",
      "missing-doc",
      "doc-b",
    ]);

    expect(renameDocByIDMock).toHaveBeenCalledWith("doc-a", "标题A (1)");
    expect(moveDocsByIDMock).toHaveBeenNthCalledWith(1, ["doc-a"], "parent-doc");
    expect(moveDocsByIDMock).toHaveBeenNthCalledWith(2, ["doc-b"], "parent-doc");
    expect(result.successIds).toEqual(["doc-a", "doc-b"]);
    expect(result.skippedIds).toEqual(["parent-doc"]);
    expect(result.renamed).toEqual([{ id: "doc-a", title: "标题A (1)" }]);
    expect(result.failed).toEqual([
      { id: "missing-doc", error: "Document metadata not found" },
    ]);
  });

  test("skips doc that is already child of current document", async () => {
    getDocMetasByIDsMock.mockResolvedValue([
      {
        id: "doc-a",
        title: "标题A",
        parentId: "parent-doc",
      },
    ] as any);

    const result = await moveDocsAsChildren("parent-doc", ["doc-a"]);

    expect(moveDocsByIDMock).not.toHaveBeenCalled();
    expect(renameDocByIDMock).not.toHaveBeenCalled();
    expect(result.successIds).toEqual([]);
    expect(result.skippedIds).toEqual(["doc-a"]);
    expect(result.failed).toEqual([]);
  });

  test("records failure when rename throws", async () => {
    getChildDocTitlesMock.mockResolvedValue(["标题A"]);
    getDocMetasByIDsMock.mockResolvedValue([
      {
        id: "doc-a",
        title: "标题A",
        parentId: "another-parent",
      },
    ] as any);
    renameDocByIDMock.mockRejectedValue(new Error("readonly mode"));

    const result = await moveDocsAsChildren("parent-doc", ["doc-a"]);

    expect(moveDocsByIDMock).not.toHaveBeenCalled();
    expect(result.successIds).toEqual([]);
    expect(result.failed).toEqual([{ id: "doc-a", error: "readonly mode" }]);
  });
});
