import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/services/request", () => ({
  requestApi: vi.fn(),
}));

import { getDocTreeOrderFromSy } from "@/services/kernel";
import { requestApi } from "@/services/request";

describe("kernel getDocTreeOrderFromSy", () => {
  const requestApiMock = vi.mocked(requestApi);
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("parses .sy JSON when file API responds with application/json", async () => {
    requestApiMock.mockImplementation(async (url: string, data?: any) => {
      if (url === "/api/query/sql") {
        const stmt = String(data?.stmt || "");
        if (stmt.includes("where type='d' and id='doc-1'")) {
          return [
            {
              id: "doc-1",
              parent_id: "",
              root_id: "doc-1",
              box: "nb",
              path: "/20250615202038-dc41und.sy",
              hpath: "/doc",
              updated: "20260222000000",
            },
          ];
        }
        return [];
      }
      if (url === "/api/filetree/getPathByID") {
        return {
          notebook: "nb",
          path: "/20250615202038-dc41und.sy",
        };
      }
      return null as any;
    });

    globalThis.fetch = vi.fn(async () => {
      const body = JSON.stringify({
        ID: "doc-1",
        Type: "NodeDocument",
        Children: [
          { ID: "h-1", Type: "NodeHeading" },
          { ID: "h-2", Type: "NodeHeading" },
        ],
      });
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "application/json;charset=utf-8",
        },
      });
    }) as any;

    const orderMap = await getDocTreeOrderFromSy("doc-1");
    expect(orderMap.get("doc-1")).toBe(0);
    expect(orderMap.get("h-1")).toBe(1);
    expect(orderMap.get("h-2")).toBe(2);
  });

  test("returns empty map when file API returns error JSON envelope", async () => {
    requestApiMock.mockImplementation(async (url: string, data?: any) => {
      if (url === "/api/query/sql") {
        const stmt = String(data?.stmt || "");
        if (stmt.includes("where type='d' and id='doc-1'")) {
          return [
            {
              id: "doc-1",
              parent_id: "",
              root_id: "doc-1",
              box: "nb",
              path: "/20250615202038-dc41und.sy",
              hpath: "/doc",
              updated: "20260222000000",
            },
          ];
        }
        return [];
      }
      if (url === "/api/filetree/getPathByID") {
        return {
          notebook: "nb",
          path: "/20250615202038-dc41und.sy",
        };
      }
      return null as any;
    });

    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          code: 404,
          msg: "not found",
          data: null,
        }),
        {
          status: 202,
          headers: {
            "content-type": "application/json;charset=utf-8",
          },
        }
      );
    }) as any;

    const orderMap = await getDocTreeOrderFromSy("doc-1");
    expect(orderMap.size).toBe(0);
  });

  test("parses .sy when file API returns success envelope with string data", async () => {
    requestApiMock.mockImplementation(async (url: string, data?: any) => {
      if (url === "/api/query/sql") {
        const stmt = String(data?.stmt || "");
        if (stmt.includes("where type='d' and id='doc-1'")) {
          return [
            {
              id: "doc-1",
              parent_id: "",
              root_id: "doc-1",
              box: "nb",
              path: "/20250615202038-dc41und.sy",
              hpath: "/doc",
              updated: "20260222000000",
            },
          ];
        }
        return [];
      }
      if (url === "/api/filetree/getPathByID") {
        return {
          notebook: "nb",
          path: "/20250615202038-dc41und.sy",
        };
      }
      return null as any;
    });

    globalThis.fetch = vi.fn(async () => {
      const sy = JSON.stringify({
        ID: "doc-1",
        Type: "NodeDocument",
        Children: [{ ID: "h-1", Type: "NodeHeading" }],
      });
      const body = JSON.stringify({
        code: 0,
        msg: "",
        data: sy,
      });
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "application/json;charset=utf-8",
        },
      });
    }) as any;

    const orderMap = await getDocTreeOrderFromSy("doc-1");
    expect(orderMap.get("doc-1")).toBe(0);
    expect(orderMap.get("h-1")).toBe(1);
  });

  test("parses .sy when file API returns success envelope with object data", async () => {
    requestApiMock.mockImplementation(async (url: string, data?: any) => {
      if (url === "/api/query/sql") {
        const stmt = String(data?.stmt || "");
        if (stmt.includes("where type='d' and id='doc-1'")) {
          return [
            {
              id: "doc-1",
              parent_id: "",
              root_id: "doc-1",
              box: "nb",
              path: "/20250615202038-dc41und.sy",
              hpath: "/doc",
              updated: "20260222000000",
            },
          ];
        }
        return [];
      }
      if (url === "/api/filetree/getPathByID") {
        return {
          notebook: "nb",
          path: "/20250615202038-dc41und.sy",
        };
      }
      return null as any;
    });

    globalThis.fetch = vi.fn(async () => {
      const body = JSON.stringify({
        code: 0,
        msg: "",
        data: {
          ID: "doc-1",
          Type: "NodeDocument",
          Children: [{ ID: "h-2", Type: "NodeHeading" }],
        },
      });
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "application/json;charset=utf-8",
        },
      });
    }) as any;

    const orderMap = await getDocTreeOrderFromSy("doc-1");
    expect(orderMap.get("doc-1")).toBe(0);
    expect(orderMap.get("h-2")).toBe(1);
  });

});
