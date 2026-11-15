import { describe, expect, vi, test } from "vitest";
import { requestApi } from "@/services/request";

const fetchSyncPostMock = vi.hoisted(() => vi.fn());
vi.mock("siyuan", () => ({
  fetchSyncPost: fetchSyncPostMock
}));

describe("requestApi timeout option", () => {
  test("resolves without a timeout option", async () => {
    fetchSyncPostMock.mockResolvedValueOnce({ code: 0, msg: "", data: { ok: 1 } });

    await expect(requestApi("/api/test", {})).resolves.toEqual({ ok: 1 });
    expect(fetchSyncPostMock).toHaveBeenCalledWith("/api/test", {});
  });

  test("rejects when the kernel does not answer within timeoutMs", async () => {
    fetchSyncPostMock.mockImplementationOnce(
      () => new Promise(() => undefined)
    );

    await expect(
      requestApi("/api/slow", {}, { timeoutMs: 20 })
    ).rejects.toThrow("请求超时");
  });

  test("clears the timer once the kernel answers", async () => {
    fetchSyncPostMock.mockResolvedValueOnce({ code: 0, msg: "", data: null });

    const result = await requestApi("/api/quick", {}, { timeoutMs: 5000 });
    expect(result).toBeNull();
  });

  test("propagates kernel error envelopes", async () => {
    fetchSyncPostMock.mockResolvedValueOnce({ code: -1, msg: "boom", data: null });

    await expect(requestApi("/api/boom", {})).rejects.toThrow("boom");
  });
});
