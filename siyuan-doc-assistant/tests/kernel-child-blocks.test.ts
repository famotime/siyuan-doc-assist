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
});
