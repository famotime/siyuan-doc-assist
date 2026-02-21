import { beforeEach, describe, expect, test, vi } from "vitest";
import { getChildBlocksByParentId } from "@/services/kernel";
import { requestApi } from "@/services/request";

vi.mock("@/services/request", () => ({
  requestApi: vi.fn(),
}));

const requestApiMock = requestApi as unknown as vi.Mock;

describe("kernel child blocks", () => {
  beforeEach(() => {
    requestApiMock.mockReset();
  });

  test("loads child blocks via API and preserves order", async () => {
    requestApiMock.mockImplementation((url: string) => {
      if (url === "/api/block/getChildBlocks") {
        return Promise.resolve([
          { id: "a", type: "p" },
          { id: "b", type: "p" },
        ]);
      }
      if (url === "/api/query/sql") {
        return Promise.resolve([
          { id: "b", type: "p", content: "", markdown: "" },
          { id: "a", type: "p", content: "text", markdown: "text" },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await getChildBlocksByParentId("doc-1");
    expect(requestApiMock).toHaveBeenCalledWith("/api/block/getChildBlocks", {
      id: "doc-1",
    });
    expect(result.map((item) => item.id)).toEqual(["a", "b"]);
  });
});
