import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/services/kernel", () => ({
  getPathByID: vi.fn(),
  listDocsByPath: vi.fn(),
}));

import { getPathByID, listDocsByPath } from "@/services/kernel";
import { getChildDocs, toChildDocMarkdown } from "@/services/link-resolver";

describe("link-resolver child docs", () => {
  const getPathByIDMock = vi.mocked(getPathByID);
  const listDocsByPathMock = vi.mocked(listDocsByPath);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("recursively resolves child docs and keeps depth for markdown nesting", async () => {
    getPathByIDMock.mockResolvedValue({
      notebook: "box-a",
      path: "/20260201-parent.sy",
    });
    listDocsByPathMock
      .mockResolvedValueOnce([
        {
          id: "doc-a",
          name: "Child A.sy",
          path: "/20260201-parent/20260202-child-a.sy",
          subFileCount: 1,
        },
        {
          id: "doc-b",
          name: "Child B.sy",
          path: "/20260201-parent/20260203-child-b.sy",
          subFileCount: 0,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "doc-a-1",
          name: "Child A1.sy",
          path: "/20260201-parent/20260202-child-a/20260204-child-a1.sy",
          subFileCount: 0,
        },
      ]);

    const result = await getChildDocs("parent-doc");

    expect(getPathByIDMock).toHaveBeenCalledWith("parent-doc");
    expect(listDocsByPathMock).toHaveBeenCalledTimes(2);
    expect(listDocsByPathMock).toHaveBeenNthCalledWith(1, "box-a", "/20260201-parent.sy");
    expect(listDocsByPathMock).toHaveBeenNthCalledWith(
      2,
      "box-a",
      "/20260201-parent/20260202-child-a.sy"
    );
    expect(result).toEqual([
      {
        id: "doc-a",
        box: "box-a",
        hPath: "",
        name: "Child A",
        updated: undefined,
        source: "child",
        depth: 0,
      },
      {
        id: "doc-a-1",
        box: "box-a",
        hPath: "",
        name: "Child A1",
        updated: undefined,
        source: "child",
        depth: 1,
      },
      {
        id: "doc-b",
        box: "box-a",
        hPath: "",
        name: "Child B",
        updated: undefined,
        source: "child",
        depth: 0,
      },
    ]);
  });

  test("renders child docs as markdown list", () => {
    expect(
      toChildDocMarkdown([
        { id: "doc-1", name: "Child A", box: "box", hPath: "/Root/Child A", source: "child", depth: 0 },
        { id: "doc-2", name: "Child B", box: "box", hPath: "/Root/Child B", source: "child", depth: 1 },
      ])
    ).toBe(
      "## 子文档列表\n\n- [Child A](siyuan://blocks/doc-1)\n    - [Child B](siyuan://blocks/doc-2)"
    );
  });
});
