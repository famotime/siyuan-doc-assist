import { describe, expect, test } from "vitest";
import { planMoveWithConflictHandling } from "@/core/move-core";

describe("move-core", () => {
  test("skips doc already under target parent", () => {
    const plan = planMoveWithConflictHandling({
      sourceDoc: {
        id: "doc1",
        title: "Alpha",
        parentId: "target",
      },
      targetParentId: "target",
      existingChildTitles: ["Alpha"],
    });

    expect(plan).toEqual({
      action: "skip",
      reason: "already-child",
    });
  });

  test("renames when same title exists under target parent", () => {
    const plan = planMoveWithConflictHandling({
      sourceDoc: {
        id: "doc2",
        title: "Alpha",
        parentId: "other",
      },
      targetParentId: "target",
      existingChildTitles: ["Alpha", "Alpha (1)"],
    });

    expect(plan).toEqual({
      action: "rename-and-move",
      newTitle: "Alpha (2)",
    });
  });

  test("moves directly when there is no conflict", () => {
    const plan = planMoveWithConflictHandling({
      sourceDoc: {
        id: "doc3",
        title: "Beta",
        parentId: "other",
      },
      targetParentId: "target",
      existingChildTitles: ["Alpha"],
    });

    expect(plan).toEqual({
      action: "move",
    });
  });
});
