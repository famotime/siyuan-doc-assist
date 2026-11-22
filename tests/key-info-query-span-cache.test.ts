import { beforeEach, describe, expect, test, vi } from "vitest";

const sqlMock = vi.fn();

vi.mock("@/services/kernel-shared", () => ({
  escapeSqlLiteral: (value: string) => value.replace(/'/g, "''"),
  queryAllRows: async (stmt: string) => {
    await sqlMock(stmt);
    return [];
  },
  sql: (...args: unknown[]) => sqlMock(...args)
}));

describe("key-info-query span order column cache (SM-09)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { resetSpanOrderColumnCache } = await import("@/services/key-info-query");
    resetSpanOrderColumnCache();
  });

  test("deduplicates concurrent pragma queries and shares resolved order column", async () => {
    let releasePragma!: (rows: Array<{ name: string }>) => void;
    sqlMock.mockImplementation((stmt: string) => {
      if (stmt.includes("pragma table_info(spans)")) {
        return new Promise((resolve) => {
          releasePragma = resolve;
        });
      }
      return Promise.resolve([]);
    });

    const { listSpanRows } = await import("@/services/key-info-query");
    const first = listSpanRows("doc-1");
    const second = listSpanRows("doc-2");

    expect(sqlMock).toHaveBeenCalledTimes(1);
    releasePragma([{ name: "start_offset" }]);
    await Promise.all([first, second]);

    const selectCalls = sqlMock.mock.calls.filter((call) => String(call[0]).includes("from spans"));
    expect(selectCalls).toHaveLength(2);
    expect(selectCalls[0][0]).toContain("s.start_offset asc");
    expect(selectCalls[1][0]).toContain("s.start_offset asc");
  });

  test("retries pragma probe on later calls after transient failure", async () => {
    sqlMock
      .mockRejectedValueOnce(new Error("db busy"))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ name: "offset" }])
      .mockResolvedValueOnce([]);

    const { listSpanRows } = await import("@/services/key-info-query");
    await listSpanRows("doc-1");
    await listSpanRows("doc-2");

    const selectCalls = sqlMock.mock.calls.filter((call) => String(call[0]).includes("from spans"));
    expect(selectCalls[0][0]).toContain("s.id asc");
    expect(selectCalls[1][0]).toContain("s.offset asc");
  });
});
