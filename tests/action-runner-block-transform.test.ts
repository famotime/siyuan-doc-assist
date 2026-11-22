import { describe, expect, test, vi } from "vitest";
import {
  applyMarkdownTransformToBlocks,
  deleteBlocksWithTransactionFallback
} from "@/plugin/action-runner-block-transform";

describe("action-runner-block-transform", () => {
  test("updates changed blocks and aggregates successful change count", async () => {
    const updateBlockMarkdown = vi.fn().mockResolvedValue(undefined);
    const result = await applyMarkdownTransformToBlocks({
      blocks: [
        { id: "a", markdown: "A" } as any,
        { id: "b", markdown: "B" } as any
      ],
      isHighRisk: () => false,
      updateBlockMarkdown,
      transform: (source) => {
        if (source === "A") {
          return { markdown: "A*", changedCount: 2 };
        }
        return { markdown: source, changedCount: 0 };
      }
    });

    expect(updateBlockMarkdown).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdown).toHaveBeenCalledWith("a", "A*");
    expect(result).toEqual({
      changedCount: 2,
      updatedBlockCount: 1,
      failedBlockCount: 0,
      skippedRiskyIds: []
    });
  });

  test("skips risky blocks and tracks failed updates", async () => {
    const updateBlockMarkdown = vi
      .fn()
      .mockRejectedValueOnce(new Error("readonly"))
      .mockResolvedValueOnce(undefined);
    const result = await applyMarkdownTransformToBlocks({
      blocks: [
        { id: "a", markdown: "A" } as any,
        { id: "b", markdown: "B" } as any,
        { id: "c", markdown: "C" } as any
      ],
      isHighRisk: (source) => source === "B",
      updateBlockMarkdown,
      transform: (source) => {
        if (source === "A") {
          return { markdown: "A*", changedCount: 1 };
        }
        if (source === "C") {
          return { markdown: "C*", changedCount: 3 };
        }
        return { markdown: source, changedCount: 0 };
      }
    });

    expect(updateBlockMarkdown).toHaveBeenCalledTimes(2);
    expect(updateBlockMarkdown).toHaveBeenNthCalledWith(1, "a", "A*");
    expect(updateBlockMarkdown).toHaveBeenNthCalledWith(2, "c", "C*");
    expect(result).toEqual({
      changedCount: 3,
      updatedBlockCount: 1,
      failedBlockCount: 1,
      skippedRiskyIds: ["b"]
    });
  });

  test("ignores empty and unchanged block markdown", async () => {
    const updateBlockMarkdown = vi.fn().mockResolvedValue(undefined);
    const result = await applyMarkdownTransformToBlocks({
      blocks: [
        { id: "a", markdown: "" } as any,
        { id: "b", markdown: undefined } as any,
        { id: "c", markdown: "C" } as any
      ],
      isHighRisk: () => false,
      updateBlockMarkdown,
      transform: (source) => ({ markdown: source, changedCount: 0 })
    });

    expect(updateBlockMarkdown).not.toHaveBeenCalled();
    expect(result).toEqual({
      changedCount: 0,
      updatedBlockCount: 0,
      failedBlockCount: 0,
      skippedRiskyIds: []
    });
  });

  test("deleteBlocksWithTransactionFallback commits undoable transaction when all DOMs exist", async () => {
    const transaction = vi.fn();
    const getBlockDOMs = vi.fn().mockResolvedValue([
      { id: "b", dom: "<div data-node-id='b'>B</div>" }
    ]);
    const deleteBlocksByIds = vi.fn();

    const result = await deleteBlocksWithTransactionFallback({
      docId: "doc-1",
      protyle: { transaction } as any,
      blocks: [{ id: "a" }, { id: "b" }],
      deleteIds: ["b"],
      getBlockDOMs,
      deleteBlocksByIds,
      concurrency: 6
    });

    expect(result).toEqual({ usedTransaction: true, deletedCount: 1, failedCount: 0 });
    expect(transaction).toHaveBeenCalledWith(
      [{ action: "delete", id: "b" }],
      [{
        action: "insert",
        id: "b",
        data: "<div data-node-id='b'>B</div>",
        previousID: "a",
        parentID: "doc-1"
      }]
    );
    expect(deleteBlocksByIds).not.toHaveBeenCalled();
  });

  test("deleteBlocksWithTransactionFallback falls back to deleteBlocksByIds when DOM is missing", async () => {
    const transaction = vi.fn();
    const getBlockDOMs = vi.fn().mockResolvedValue([]);
    const deleteBlocksByIds = vi.fn().mockResolvedValue({ deletedCount: 1, failedIds: ["c"] });

    const result = await deleteBlocksWithTransactionFallback({
      docId: "doc-1",
      protyle: { transaction } as any,
      blocks: [{ id: "a" }, { id: "b" }, { id: "c" }],
      deleteIds: ["b", "c"],
      getBlockDOMs,
      deleteBlocksByIds,
      concurrency: 6
    });

    expect(transaction).not.toHaveBeenCalled();
    expect(deleteBlocksByIds).toHaveBeenCalledWith(["b", "c"], { concurrency: 6 });
    expect(result).toEqual({ usedTransaction: false, deletedCount: 1, failedCount: 1 });
  });
});
