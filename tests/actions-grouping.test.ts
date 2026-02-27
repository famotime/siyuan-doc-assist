import { describe, expect, test } from "vitest";
import { ACTIONS } from "@/plugin/actions";

describe("actions grouping", () => {
  test("assigns insert-related actions to insert group", () => {
    const groups = new Map(ACTIONS.map((action) => [action.key, action.group]));

    expect(groups.get("insert-backlinks")).toBe("insert");
    expect(groups.get("insert-child-docs")).toBe("insert");
    expect(groups.get("insert-blank-before-headings")).toBe("insert");
    expect(groups.get("bold-selected-blocks")).toBe("edit");
  });
});
