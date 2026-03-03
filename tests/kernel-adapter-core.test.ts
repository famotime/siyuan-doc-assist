import { describe, expect, test, vi } from "vitest";
import {
  parseKernelTextRows,
  requestBatchRowsWithSingleFallback,
} from "@/services/kernel-adapter-core";

describe("kernel-adapter-core", () => {
  test("parses mixed payload shapes and keeps first row per id", () => {
    const rows = parseKernelTextRows(
      {
        items: [{ id: "a", kramdown: "A" }],
        blocks: [{ id: "a", kramdown: "A-ignored" }, { id: "b", kramdown: 123 }],
        "20260224194151-rzj7ze5": "dict-value",
      },
      "kramdown"
    );

    expect(rows).toEqual([
      { id: "a", text: "A" },
      { id: "b", text: "123" },
      { id: "20260224194151-rzj7ze5", text: "dict-value" },
    ]);
  });

  test("requests batch rows by chunks and keeps source id order", async () => {
    const requestBatch = vi.fn(async (ids: string[]) => {
      if (ids.includes("a")) {
        return { rows: [{ id: "a", value: "A" }] };
      }
      return { rows: [{ id: "c", value: "C" }] };
    });
    const requestSingle = vi.fn(async () => null);

    const rows = await requestBatchRowsWithSingleFallback({
      ids: [" a ", "b", "", "c", "a"],
      chunkSize: 2,
      requestBatch,
      parseBatchRows: (payload) => {
        const source = payload as { rows?: Array<{ id: string; value: string }> };
        return (source.rows || []).map((item) => ({ id: item.id, value: item.value }));
      },
      requestSingle,
    });

    expect(requestBatch).toHaveBeenCalledTimes(2);
    expect(requestBatch).toHaveBeenNthCalledWith(1, ["a", "b"]);
    expect(requestBatch).toHaveBeenNthCalledWith(2, ["c"]);
    expect(requestSingle).not.toHaveBeenCalled();
    expect(rows).toEqual([
      { id: "a", value: "A" },
      { id: "c", value: "C" },
    ]);
  });

  test("falls back to single requests only for ids from failed chunks", async () => {
    const requestBatch = vi.fn(async (ids: string[]) => {
      if (ids.includes("b")) {
        throw new Error("batch-down");
      }
      return { rows: [{ id: "a", value: "A" }] };
    });
    const requestSingle = vi.fn(async (id: string) => {
      if (id === "b") {
        return { id: "b", value: "B" };
      }
      return null;
    });
    const onBatchError = vi.fn();
    const onSingleError = vi.fn();

    const rows = await requestBatchRowsWithSingleFallback({
      ids: ["a", "b"],
      chunkSize: 1,
      requestBatch,
      parseBatchRows: (payload) => {
        const source = payload as { rows?: Array<{ id: string; value: string }> };
        return (source.rows || []).map((item) => ({ id: item.id, value: item.value }));
      },
      requestSingle,
      onBatchError,
      onSingleError,
    });

    expect(onBatchError).toHaveBeenCalledTimes(1);
    expect(onBatchError).toHaveBeenCalledWith(expect.any(Error), ["b"]);
    expect(onSingleError).not.toHaveBeenCalled();
    expect(requestSingle).toHaveBeenCalledTimes(1);
    expect(requestSingle).toHaveBeenCalledWith("b");
    expect(rows).toEqual([
      { id: "a", value: "A" },
      { id: "b", value: "B" },
    ]);
  });
});
