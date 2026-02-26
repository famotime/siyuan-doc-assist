import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/services/kernel", () => ({
  sql: vi.fn(),
}));

import { sql } from "@/services/kernel";
import { resolveDocDirectChildBlockId } from "@/services/block-lineage";

const sqlMock = vi.mocked(sql);

describe("block-lineage", () => {
  beforeEach(() => {
    sqlMock.mockReset();
  });

  test("returns direct child id when block parent is target doc", async () => {
    sqlMock.mockResolvedValue([
      { id: "child-1", parent_id: "doc-1", root_id: "doc-1" } as any,
    ]);

    const result = await resolveDocDirectChildBlockId("doc-1", "child-1");

    expect(result).toBe("child-1");
  });

  test("walks ancestors and returns first direct child under target doc", async () => {
    sqlMock
      .mockResolvedValueOnce([
        { id: "nested-1", parent_id: "child-1", root_id: "doc-1" } as any,
      ])
      .mockResolvedValueOnce([
        { id: "child-1", parent_id: "doc-1", root_id: "doc-1" } as any,
      ]);

    const result = await resolveDocDirectChildBlockId("doc-1", "nested-1");

    expect(result).toBe("child-1");
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  test("returns empty when block is outside target doc root", async () => {
    sqlMock.mockResolvedValue([
      { id: "nested-1", parent_id: "child-1", root_id: "doc-2" } as any,
    ]);

    const result = await resolveDocDirectChildBlockId("doc-1", "nested-1");

    expect(result).toBe("");
  });

  test("returns empty when chain cycles", async () => {
    sqlMock.mockResolvedValue([
      { id: "nested-1", parent_id: "nested-1", root_id: "doc-1" } as any,
    ]);

    const result = await resolveDocDirectChildBlockId("doc-1", "nested-1");

    expect(result).toBe("");
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  test("returns empty when candidate block id equals doc id", async () => {
    const result = await resolveDocDirectChildBlockId("doc-1", "doc-1");

    expect(result).toBe("");
    expect(sqlMock).not.toHaveBeenCalled();
  });
});
