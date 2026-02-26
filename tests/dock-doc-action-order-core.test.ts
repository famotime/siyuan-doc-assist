import { describe, expect, test } from "vitest";
import {
  canDropDocActionWithinGroup,
  hasDocActionOrderChanged,
  moveDocActionToGroupEnd,
  normalizeDocActionsByGroup,
  reorderDocActionsWithinGroup,
} from "@/core/dock-doc-action-order-core";
import { DockDocAction } from "@/core/dock-panel-core";

function buildAction(
  key: string,
  group: DockDocAction["group"]
): DockDocAction {
  return {
    key,
    group,
    groupLabel: group,
    label: key,
    icon: "icon",
    disabled: false,
    menuRegistered: true,
    menuToggleDisabled: false,
  };
}

describe("dock-doc-action-order-core", () => {
  test("normalizes action list by first-seen group order", () => {
    const actions = [
      buildAction("export-1", "export"),
      buildAction("edit-1", "edit"),
      buildAction("export-2", "export"),
      buildAction("edit-2", "edit"),
      buildAction("insert-1", "insert"),
    ];

    const normalized = normalizeDocActionsByGroup(actions).map((item) => item.key);
    expect(normalized).toEqual([
      "export-1",
      "export-2",
      "edit-1",
      "edit-2",
      "insert-1",
    ]);
  });

  test("reorders within same group and ignores cross-group drop", () => {
    const actions = [
      buildAction("export-1", "export"),
      buildAction("export-2", "export"),
      buildAction("edit-1", "edit"),
    ];

    const reordered = reorderDocActionsWithinGroup(
      actions,
      "export-1",
      "export-2",
      false
    );
    expect(reordered.map((item) => item.key)).toEqual([
      "export-2",
      "export-1",
      "edit-1",
    ]);

    const unchanged = reorderDocActionsWithinGroup(
      actions,
      "export-1",
      "edit-1",
      false
    );
    expect(unchanged).toBe(actions);
  });

  test("moves action to group end", () => {
    const actions = [
      buildAction("edit-1", "edit"),
      buildAction("edit-2", "edit"),
      buildAction("edit-3", "edit"),
      buildAction("export-1", "export"),
    ];
    const moved = moveDocActionToGroupEnd(actions, "edit-1");
    expect(moved.map((item) => item.key)).toEqual([
      "edit-2",
      "edit-3",
      "edit-1",
      "export-1",
    ]);
  });

  test("checks drop compatibility and order change", () => {
    const actions = [
      buildAction("export-1", "export"),
      buildAction("edit-1", "edit"),
    ];
    const groupMap = new Map(actions.map((action) => [action.key, action.group]));
    expect(canDropDocActionWithinGroup(groupMap, "export-1", "edit-1")).toBe(false);
    expect(canDropDocActionWithinGroup(groupMap, "export-1", "export-1")).toBe(false);
    expect(hasDocActionOrderChanged(actions, actions)).toBe(false);
    expect(
      hasDocActionOrderChanged(actions, [
        buildAction("edit-1", "edit"),
        buildAction("export-1", "export"),
      ])
    ).toBe(true);
  });
});
