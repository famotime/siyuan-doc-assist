import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/services/request", () => ({
  requestApi: vi.fn(),
}));

import { listNotebookDocs } from "@/services/kernel";
import { requestApi } from "@/services/request";

describe("kernel listNotebookDocs", () => {
  const requestApiMock = vi.mocked(requestApi);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("loads all paged notebook docs instead of stopping at the first SQL page", async () => {
    const rows = Array.from({ length: 65 }, (_, i) => ({
      id: `doc-${i + 1}`,
      box: "notebook-1",
      path: `/${String(i + 1).padStart(2, "0")}.sy`,
      hpath: `/文档 ${i + 1}`,
      updated: `20260428${String(i).padStart(6, "0")}`,
    }));

    requestApiMock.mockImplementation(async (url: string, payload?: any) => {
      if (url !== "/api/query/sql") {
        return null as any;
      }

      const stmt = String(payload?.stmt || "");
      if (stmt.includes("limit 64 offset 0")) {
        return rows.slice(0, 64);
      }
      if (stmt.includes("limit 64 offset 64")) {
        return rows.slice(64);
      }
      if (stmt.includes("limit 64 offset 65")) {
        return [];
      }

      return rows.slice(0, 64);
    });

    const result = await listNotebookDocs("notebook-1");

    expect(result).toHaveLength(65);
    expect(result[0]).toEqual({
      id: "doc-1",
      box: "notebook-1",
      path: "/01.sy",
      hPath: "/文档 1",
      updated: "20260428000000",
      title: "文档 1",
    });
    expect(result[64]?.id).toBe("doc-65");
  });
});
