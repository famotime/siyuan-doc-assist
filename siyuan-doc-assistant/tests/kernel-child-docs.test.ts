import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/services/request", () => ({
  requestApi: vi.fn(),
}));

import { getChildDocsByParent } from "@/services/kernel";
import { requestApi } from "@/services/request";

describe("kernel getChildDocsByParent", () => {
  const requestApiMock = vi.mocked(requestApi);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("finds direct child docs by parent path and excludes deeper descendants", async () => {
    requestApiMock
      .mockResolvedValueOnce([
        {
          box: "notebook-1",
          path: "/20260201000000-parent.sy",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "child-a",
          box: "notebook-1",
          hpath: "/Parent/Child A",
          updated: "20260221120000",
          path: "/20260201000000-parent/20260202000000-child-a.sy",
        },
        {
          id: "grand-child",
          box: "notebook-1",
          hpath: "/Parent/Child A/Grand Child",
          updated: "20260221121000",
          path: "/20260201000000-parent/20260202000000-child-a/20260203000000-grand-child.sy",
        },
      ]);

    const result = await getChildDocsByParent("parent-doc");

    expect(requestApiMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      {
        id: "child-a",
        box: "notebook-1",
        hPath: "/Parent/Child A",
        updated: "20260221120000",
      },
    ]);
  });
});
