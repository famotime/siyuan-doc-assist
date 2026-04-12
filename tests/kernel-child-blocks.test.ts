import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  deleteBlocksByIds,
  getChildBlockRefsByParentId,
  getChildBlocksByParentId,
} from "@/services/kernel";
import { requestApi } from "@/services/request";

vi.mock("@/services/request", () => ({
  requestApi: vi.fn(),
}));

const requestApiMock = requestApi as unknown as vi.Mock;

async function flushMicrotasks(times = 8) {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

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

  test("loads child block refs without extra SQL hydration", async () => {
    requestApiMock.mockImplementation((url: string) => {
      if (url === "/api/block/getChildBlocks") {
        return Promise.resolve([
          { id: "a", type: "p" },
          { id: "a", type: "p" },
          { id: "b", type: "h" },
        ]);
      }
      if (url === "/api/query/sql") {
        throw new Error("should not query sql");
      }
      return Promise.resolve([]);
    });

    const result = await getChildBlockRefsByParentId("doc-1");

    expect(result).toEqual([
      { id: "a", type: "p" },
      { id: "b", type: "h" },
    ]);
    expect(requestApiMock).toHaveBeenCalledTimes(1);
    expect(requestApiMock).toHaveBeenCalledWith("/api/block/getChildBlocks", {
      id: "doc-1",
    });
  });

  test("falls back to kramdown when SQL misses ids", async () => {
    requestApiMock.mockImplementation((url: string) => {
      if (url === "/api/block/getChildBlocks") {
        return Promise.resolve([
          { id: "a", type: "p" },
          { id: "b", type: "p" },
        ]);
      }
      if (url === "/api/query/sql") {
        return Promise.resolve([{ id: "a", type: "p", content: "text", markdown: "text" }]);
      }
      if (url === "/api/block/getBlockKramdowns") {
        return Promise.resolve({ kramdowns: [{ id: "b", kramdown: "" }] });
      }
      return Promise.resolve([]);
    });

    const result = await getChildBlocksByParentId("doc-1");
    expect(result.map((item) => item.id)).toEqual(["a", "b"]);
    expect(result[1]?.markdown || "").toBe("");
    expect(result[1]?.resolved).toBe(true);
  });

  test("chunks kramdown fallback requests and marks unresolved blocks", async () => {
    const childIds = Array.from({ length: 120 }, (_, index) => `id-${index}`);
    const chunkSizes: number[] = [];
    requestApiMock.mockImplementation((url: string, data?: any) => {
      if (url === "/api/block/getChildBlocks") {
        return Promise.resolve(childIds.map((id) => ({ id, type: "p" })));
      }
      if (url === "/api/query/sql") {
        return Promise.resolve([]);
      }
      if (url === "/api/block/getBlockKramdowns") {
        const ids = (data?.ids || []) as string[];
        chunkSizes.push(ids.length);
        return Promise.resolve({
          kramdowns: ids
            .filter((id) => id !== "id-119")
            .map((id) => ({ id, kramdown: `text-${id}` })),
        });
      }
      return Promise.resolve([]);
    });

    const result = await getChildBlocksByParentId("doc-1");
    expect(chunkSizes).toEqual([50, 50, 20]);
    expect(result).toHaveLength(120);
    expect(result.find((item) => item.id === "id-118")?.resolved).toBe(true);
    expect(result.find((item) => item.id === "id-119")?.resolved).toBe(false);
  });

  test("paginates SQL query to avoid default row cap on large docs", async () => {
    const childIds = Array.from({ length: 130 }, (_, index) => `id-${index}`);
    const allRows = childIds.map((id) => ({
      id,
      type: "p",
      content: id,
      markdown: id,
    }));
    let kramdownCalls = 0;

    requestApiMock.mockImplementation((url: string, data?: any) => {
      if (url === "/api/block/getChildBlocks") {
        return Promise.resolve(childIds.map((id) => ({ id, type: "p" })));
      }
      if (url === "/api/query/sql") {
        const stmt = String(data?.stmt || "");
        const offsetMatch = stmt.match(/\boffset\s+(\d+)\b/i);
        const offset = Number(offsetMatch?.[1] || "0");
        const pageSize = 64;
        return Promise.resolve(allRows.slice(offset, offset + pageSize));
      }
      if (url === "/api/block/getBlockKramdowns") {
        kramdownCalls += 1;
        return Promise.resolve({ kramdowns: [] });
      }
      return Promise.resolve([]);
    });

    const result = await getChildBlocksByParentId("doc-1");
    expect(result).toHaveLength(130);
    expect(result.every((item) => item.resolved === true)).toBe(true);
    expect(kramdownCalls).toBe(0);
  });

  test("deletes blocks with bounded concurrency", async () => {
    const started: string[] = [];
    const resolvers = new Map<string, () => void>();
    let inFlight = 0;
    let maxInFlight = 0;

    requestApiMock.mockImplementation((url: string, data?: any) => {
      if (url === "/api/block/deleteBlock") {
        const id = String(data?.id || "");
        started.push(id);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return new Promise<void>((resolve) => {
          resolvers.set(id, () => {
            inFlight -= 1;
            resolve();
          });
        });
      }
      return Promise.resolve([]);
    });

    const pending = deleteBlocksByIds(["a", "b", "c", "d"], {
      concurrency: 2,
    });

    await Promise.resolve();
    expect(started).toEqual(["a", "b"]);

    resolvers.get("a")?.();
    await flushMicrotasks();
    expect(started).toContain("c");

    resolvers.get("b")?.();
    await flushMicrotasks();
    expect(started).toContain("d");

    resolvers.get("c")?.();
    resolvers.get("d")?.();

    const result = await pending;
    expect(result).toEqual({
      deletedCount: 4,
      failedIds: [],
    });
    expect(maxInFlight).toBe(2);
  });

  test("times out hanging delete requests and continues with remaining ids", async () => {
    vi.useFakeTimers();
    const started: string[] = [];

    requestApiMock.mockImplementation((url: string, data?: any) => {
      if (url === "/api/block/deleteBlock") {
        const id = String(data?.id || "");
        started.push(id);
        if (id === "b") {
          return new Promise<void>(() => {});
        }
        return Promise.resolve();
      }
      return Promise.resolve([]);
    });

    const pending = deleteBlocksByIds(["a", "b", "c"], {
      concurrency: 2,
      timeoutMs: 50,
    });

    await flushMicrotasks();
    expect(started).toContain("c");

    await vi.advanceTimersByTimeAsync(50);

    await expect(pending).resolves.toEqual({
      deletedCount: 2,
      failedIds: ["b"],
    });

    vi.useRealTimers();
  });
});
