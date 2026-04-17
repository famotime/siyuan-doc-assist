import { describe, expect, test } from "vitest";
import { buildSelectedBlockStyleTogglePreview } from "@/core/selected-block-style-toggle-core";

describe("selected-block-style-toggle-core", () => {
  test("adds bold only to plain blocks when selected blocks are mixed", () => {
    const preview = buildSelectedBlockStyleTogglePreview(
      [
        { id: "a", markdown: "Hello" },
        { id: "b", markdown: "**World**" },
      ],
      "bold"
    );

    expect(preview.mode).toBe("add-style");
    expect(preview.styledBlockCount).toBe(1);
    expect(preview.plainBlockCount).toBe(1);
    expect(preview.updateCount).toBe(1);
    expect(preview.updates).toEqual([{ id: "a", next: "**Hello**" }]);
  });

  test("removes bold from all selected blocks only when all are fully bold", () => {
    const preview = buildSelectedBlockStyleTogglePreview(
      [
        { id: "a", markdown: "**Hello**" },
        { id: "b", markdown: "# **Title** {: id=\"b\"}" },
      ],
      "bold"
    );

    expect(preview.mode).toBe("remove-style");
    expect(preview.styledBlockCount).toBe(2);
    expect(preview.plainBlockCount).toBe(0);
    expect(preview.updateCount).toBe(2);
    expect(preview.updates).toEqual([
      { id: "a", next: "Hello" },
      { id: "b", next: "# Title" },
    ]);
  });

  test("adds highlight only to plain blocks when selected blocks are mixed", () => {
    const preview = buildSelectedBlockStyleTogglePreview(
      [
        { id: "a", markdown: "item" },
        { id: "b", markdown: "==kept==" },
      ],
      "highlight"
    );

    expect(preview.mode).toBe("add-style");
    expect(preview.styledBlockCount).toBe(1);
    expect(preview.plainBlockCount).toBe(1);
    expect(preview.updateCount).toBe(1);
    expect(preview.updates).toEqual([{ id: "a", next: "==item==" }]);
  });

  test("removes highlight from all selected blocks only when all are fully highlighted", () => {
    const preview = buildSelectedBlockStyleTogglePreview(
      [
        { id: "a", markdown: "==item==" },
        { id: "b", markdown: "- ==kept==" },
      ],
      "highlight"
    );

    expect(preview.mode).toBe("remove-style");
    expect(preview.styledBlockCount).toBe(2);
    expect(preview.plainBlockCount).toBe(0);
    expect(preview.updateCount).toBe(2);
    expect(preview.updates).toEqual([
      { id: "a", next: "item" },
      { id: "b", next: "- kept" },
    ]);
  });
});
