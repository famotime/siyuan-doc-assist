import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/services/kernel", () => ({
  getDocMetaByID: vi.fn(),
  listDocsByParentSubtree: vi.fn(),
  removeDocByID: vi.fn(),
}));

import { findDuplicateCandidates } from "@/services/dedupe";
import { getDocMetaByID, listDocsByParentSubtree } from "@/services/kernel";

describe("dedupe service", () => {
  const getDocMetaByIDMock = vi.mocked(getDocMetaByID);
  const listDocsByParentSubtreeMock = vi.mocked(listDocsByParentSubtree);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("includes parent doc in candidates when current doc is a child", async () => {
    getDocMetaByIDMock.mockResolvedValueOnce({
      id: "child-doc",
      parentId: "parent-doc",
      rootId: "parent-doc",
      box: "notebook-1",
      path: "/folder/child-doc.sy",
      hPath: "/Folder/Same Title",
      updated: "20260222010101",
      title: "Same Title",
    });
    getDocMetaByIDMock.mockResolvedValueOnce({
      id: "parent-doc",
      parentId: "",
      rootId: "parent-doc",
      box: "notebook-1",
      path: "/folder.sy",
      hPath: "/Folder/Same Title",
      updated: "20260222000000",
      title: "Same Title",
    });
    listDocsByParentSubtreeMock.mockResolvedValue([
      {
        id: "child-doc",
        hpath: "/Folder/Same Title",
        updated: "20260222010101",
      },
    ]);

    const groups = await findDuplicateCandidates("child-doc", 0.85);

    expect(listDocsByParentSubtreeMock).toHaveBeenCalledWith("notebook-1", "/folder/");
    expect(groups).toHaveLength(1);
    expect(groups[0].docs.map((doc) => doc.id)).toEqual(["child-doc", "parent-doc"]);
  });

  test("does not duplicate parent doc when it already exists in subtree rows", async () => {
    getDocMetaByIDMock.mockResolvedValueOnce({
      id: "child-doc",
      parentId: "parent-doc",
      rootId: "parent-doc",
      box: "notebook-1",
      path: "/folder/child-doc.sy",
      hPath: "/Folder/Same Title",
      updated: "20260222010101",
      title: "Same Title",
    });
    getDocMetaByIDMock.mockResolvedValueOnce({
      id: "parent-doc",
      parentId: "",
      rootId: "parent-doc",
      box: "notebook-1",
      path: "/folder.sy",
      hPath: "/Folder/Same Title",
      updated: "20260222000000",
      title: "Same Title",
    });
    listDocsByParentSubtreeMock.mockResolvedValue([
      {
        id: "child-doc",
        hpath: "/Folder/Same Title",
        updated: "20260222010101",
      },
      {
        id: "parent-doc",
        hpath: "/Folder/Same Title",
        updated: "20260222000000",
      },
    ]);

    const groups = await findDuplicateCandidates("child-doc", 0.85);

    expect(groups).toHaveLength(1);
    expect(groups[0].docs).toHaveLength(2);
    expect(groups[0].docs.map((doc) => doc.id)).toEqual(["child-doc", "parent-doc"]);
  });
});
