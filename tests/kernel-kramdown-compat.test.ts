import { beforeEach, describe, expect, test, vi } from "vitest";
import { getBlockKramdowns } from "@/services/kernel";
import { requestApi } from "@/services/request";

vi.mock("@/services/request", () => ({
  requestApi: vi.fn(),
}));

const requestApiMock = requestApi as unknown as vi.Mock;

describe("kernel kramdown compatibility", () => {
  beforeEach(() => {
    requestApiMock.mockReset();
  });

  test("parses non-standard batch response arrays", async () => {
    requestApiMock.mockImplementation((url: string) => {
      if (url === "/api/block/getBlockKramdowns") {
        return Promise.resolve({
          items: [{ id: "a", kramdown: "A" }],
        });
      }
      return Promise.resolve(null);
    });

    const rows = await getBlockKramdowns(["a"]);
    expect(rows).toEqual([{ id: "a", kramdown: "A" }]);
  });

  test("does not call single-block API when batch endpoint succeeds", async () => {
    requestApiMock.mockImplementation((url: string, data?: any) => {
      if (url === "/api/block/getBlockKramdowns") {
        return Promise.resolve({
          kramdowns: [{ id: "a", kramdown: "A" }],
        });
      }
      if (url === "/api/block/getBlockKramdown" && data?.id === "b") {
        return Promise.resolve({ id: "b", kramdown: "B" });
      }
      return Promise.resolve(null);
    });

    const rows = await getBlockKramdowns(["a", "b"]);
    expect(rows).toEqual([{ id: "a", kramdown: "A" }]);
    expect(requestApiMock).not.toHaveBeenCalledWith("/api/block/getBlockKramdown", {
      id: "b",
    });
  });

  test("falls back to single-block API when batch endpoint throws", async () => {
    requestApiMock.mockImplementation((url: string, data?: any) => {
      if (url === "/api/block/getBlockKramdowns") {
        return Promise.reject(new Error("endpoint unavailable"));
      }
      if (url === "/api/block/getBlockKramdown") {
        return Promise.resolve({
          id: data?.id,
          kramdown: `md-${data?.id}`,
        });
      }
      return Promise.resolve(null);
    });

    const rows = await getBlockKramdowns(["a", "b"]);
    expect(rows).toEqual([
      { id: "a", kramdown: "md-a" },
      { id: "b", kramdown: "md-b" },
    ]);
  });
});
