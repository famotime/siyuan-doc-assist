import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("siyuan", () => ({
  fetchSyncPost: vi.fn(),
}));

import { fetchSyncPost } from "siyuan";
import { requestApi } from "@/services/request";

const fetchSyncPostMock = vi.mocked(fetchSyncPost);

describe("request service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns response data when api succeeds", async () => {
    fetchSyncPostMock.mockResolvedValue({
      code: 0,
      msg: "",
      data: { ok: true },
    } as any);

    const result = await requestApi<{ ok: boolean }>("/api/test", { id: "doc-1" });

    expect(fetchSyncPostMock).toHaveBeenCalledWith("/api/test", { id: "doc-1" });
    expect(result).toEqual({ ok: true });
  });

  test("throws backend message when api fails", async () => {
    fetchSyncPostMock.mockResolvedValue({
      code: -1,
      msg: "bad request",
      data: null,
    } as any);

    await expect(requestApi("/api/test")).rejects.toThrow("bad request");
  });

  test("throws default message when response is empty", async () => {
    fetchSyncPostMock.mockResolvedValue(undefined as any);

    await expect(requestApi("/api/empty")).rejects.toThrow("Request failed: /api/empty");
  });
});
