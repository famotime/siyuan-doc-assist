import { describe, expect, test } from "vitest";
import { ACTIONS } from "@/plugin/actions";

describe("actions grouping", () => {
  test("assigns insert and image actions to expected groups", () => {
    const groups = new Map(ACTIONS.map((action) => [action.key, action.group]));

    expect(groups.get("insert-backlinks")).toBe("insert");
    expect(groups.get("insert-child-docs")).toBe("insert");
    expect(groups.get("insert-blank-before-headings")).toBe("insert");
    expect(groups.get("mark-invalid-links-refs")).toBe("insert");
    expect(groups.get("insert-doc-summary")).toBe("ai");
    expect(groups.get("mark-irrelevant-paragraphs")).toBe("ai");
    expect(groups.get("mark-key-content")).toBe("ai");
    expect(groups.get("convert-images-to-webp")).toBe("image");
    expect(groups.get("convert-images-to-png")).toBe("image");
    expect(groups.get("resize-images-to-display")).toBe("image");
    expect(groups.get("remove-doc-images")).toBe("image");
    expect(groups.get("export-child-key-info-zip")).toBe("export");
    expect(groups.get("create-open-docs-summary")).toBe("organize");
    expect(groups.get("toggle-links-refs")).toBe("insert");
    expect(groups.get("clean-ai-output")).toBe("ai");
    expect(groups.get("bold-selected-blocks")).toBe("edit");
    expect(groups.get("merge-selected-list-blocks")).toBe("edit");
    expect(groups.get("remove-strikethrough-marked-content")).toBe("edit");
    expect(groups.get("toggle-heading-bold")).toBe("edit");
    expect(groups.get("toggle-linebreaks-paragraphs")).toBe("edit");
    expect(groups.get("remove-selected-spacing")).toBe("edit");
    expect(groups.get("toggle-selected-punctuation")).toBe("edit");
  });
});
