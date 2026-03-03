import { describe, expect, test, vi } from "vitest";
import { applyMarkdownTransformToBlocks } from "@/plugin/action-runner-block-transform";

describe("action-runner-block-transform", () => {
  test("updates changed blocks and aggregates successful change count", async () => {
    const updateBlockMarkdown = vi.fn().mockResolvedValue(undefined);
    const result = await applyMarkdownTransformToBlocks({
      blocks: [
        { id: "a", markdown: "A" } as any,
        { id: "b", markdown: "B" } as any,
      ],
      isHighRisk: () => false,
      updateBlockMarkdown,
      transform: (source) => {
        if (source === "A") {
          return { markdown: "A*", changedCount: 2 };
        }
        return { markdown: source, changedCount: 0 };
      },
    });

    expect(updateBlockMarkdown).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdown).toHaveBeenCalledWith("a", "A*");
    expect(result).toEqual({
      changedCount: 2,
      updatedBlockCount: 1,
      failedBlockCount: 0,
      skippedRiskyIds: [],
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
        { id: "c", markdown: "C" } as any,
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
      },
    });

    expect(updateBlockMarkdown).toHaveBeenCalledTimes(2);
    expect(updateBlockMarkdown).toHaveBeenNthCalledWith(1, "a", "A*");
    expect(updateBlockMarkdown).toHaveBeenNthCalledWith(2, "c", "C*");
    expect(result).toEqual({
      changedCount: 3,
      updatedBlockCount: 1,
      failedBlockCount: 1,
      skippedRiskyIds: ["b"],
    });
  });

  test("ignores empty and unchanged block markdown", async () => {
    const updateBlockMarkdown = vi.fn().mockResolvedValue(undefined);
    const result = await applyMarkdownTransformToBlocks({
      blocks: [
        { id: "a", markdown: "" } as any,
        { id: "b", markdown: undefined } as any,
        { id: "c", markdown: "C" } as any,
      ],
      isHighRisk: () => false,
      updateBlockMarkdown,
      transform: (source) => ({ markdown: source, changedCount: 0 }),
    });

    expect(updateBlockMarkdown).not.toHaveBeenCalled();
    expect(result).toEqual({
      changedCount: 0,
      updatedBlockCount: 0,
      failedBlockCount: 0,
      skippedRiskyIds: [],
    });
  });
});
