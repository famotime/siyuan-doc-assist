import { describe, expect, test } from "vitest";
import { ACTIONS } from "@/plugin/actions";

describe("actions grouping", () => {
  test("assigns insert and image actions to expected groups", () => {
    const groups = new Map(ACTIONS.map((action) => [action.key, action.group]));

    expect(groups.get("insert-backlinks")).toBe("insert");
    expect(groups.get("insert-child-docs")).toBe("insert");
    expect(groups.get("insert-blank-before-headings")).toBe("insert");
    expect(groups.get("convert-images-to-webp")).toBe("image");
    expect(groups.get("convert-images-to-png")).toBe("image");
    expect(groups.get("remove-doc-images")).toBe("image");
    expect(groups.get("toggle-links-refs")).toBe("edit");
    expect(groups.get("bold-selected-blocks")).toBe("edit");
  });
});
