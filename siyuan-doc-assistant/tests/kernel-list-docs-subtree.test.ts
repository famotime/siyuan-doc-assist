import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/services/request", () => ({
  requestApi: vi.fn(),
}));

import { listDocsByParentSubtree } from "@/services/kernel";
import { requestApi } from "@/services/request";

describe("kernel listDocsByParentSubtree", () => {
  const requestApiMock = vi.mocked(requestApi);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("loads all paged rows instead of stopping at the first SQL page", async () => {
    const rows = Array.from({ length: 65 }, (_, i) => ({
      id: `doc-${i + 1}`,
      hpath: `/Docs/Doc ${i + 1}`,
      updated: `20260222${String(i).padStart(6, "0")}`,
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
      // Simulate environments where SQL API without explicit pagination returns only the first page.
      return rows.slice(0, 64);
    });

    const result = await listDocsByParentSubtree("notebook-1", "/");

    expect(result).toHaveLength(65);
    expect(result[0].id).toBe("doc-1");
    expect(result[64].id).toBe("doc-65");
  });
});
