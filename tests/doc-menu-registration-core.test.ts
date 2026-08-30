import { describe, expect, test } from "vitest";
import { ACTIONS } from "@/plugin/actions";
import {
  buildDefaultDocActionEnabled,
  buildDefaultDocActionOrder,
  buildDefaultDocMenuRegistration,
  filterDockVisibleActions,
  filterDocMenuActions,
  isAllDocActionEnabled,
  isAllDocMenuRegistrationEnabled,
  normalizeDocActionEnabled,
  normalizeDocFavoriteActionKeys,
  normalizeDocActionOrder,
  normalizeDocMenuRegistration,
  reorderDocFavoriteActions,
  setAllDocActionEnabled,
  setAllDocMenuRegistration,
  setDocFavoriteAction,
  setSingleDocActionEnabled,
  setSingleDocMenuRegistration,
  sortActionsByOrder,
} from "@/core/doc-menu-registration-core";

describe("doc-menu-registration-core", () => {
  test("builds default menu registration state with all actions disabled", () => {
    const state = buildDefaultDocMenuRegistration(ACTIONS);

    expect(Object.keys(state)).toHaveLength(ACTIONS.length);
    for (const action of ACTIONS) {
      expect(state[action.key]).toBe(false);
    }
    expect(isAllDocMenuRegistrationEnabled(state)).toBe(false);
  });

  test("builds default action enabled state with bold/highlight disabled and others enabled", () => {
    const state = buildDefaultDocActionEnabled(ACTIONS);

    expect(state["bold-selected-blocks"]).toBe(false);
    expect(state["highlight-selected-blocks"]).toBe(false);
    expect(state["export-current"]).toBe(true);
    expect(state["insert-backlinks"]).toBe(true);
    expect(isAllDocActionEnabled(state)).toBe(false);
  });

  test("normalizes invalid storage data with defaults", () => {
    const state = normalizeDocMenuRegistration(
      {
        version: 1,
        actionMenuRegistered: {
          "export-current": false,
          "insert-backlinks": "invalid",
          unknown: false,
        },
      },
      ACTIONS
    );

    expect(state["export-current"]).toBe(false);
    expect(state["insert-backlinks"]).toBe(false);
    expect(state["move-backlinks"]).toBe(false);
    expect(state["move-forward-links"]).toBe(false);
  });

  test("normalizes action enabled storage data when actionMenuRegistered is present", () => {
    const state = normalizeDocActionEnabled(
      {
        version: 1,
        actionMenuRegistered: {},
        actionEnabled: {
          "bold-selected-blocks": true,
          "export-current": false,
        },
      },
      ACTIONS
    );

    expect(state["bold-selected-blocks"]).toBe(true);
    expect(state["export-current"]).toBe(false);
    expect(state["highlight-selected-blocks"]).toBe(false);
    expect(state["insert-backlinks"]).toBe(true);
  });

  test("resets legacy storage without actionMenuRegistered to clean default enabled state", () => {
    const state = normalizeDocActionEnabled(
      {
        version: 1,
        actionEnabled: {
          "export-current": false,
          "insert-backlinks": false,
        },
      },
      ACTIONS
    );

    expect(state["export-current"]).toBe(true);
    expect(state["insert-backlinks"]).toBe(true);
    expect(state["bold-selected-blocks"]).toBe(false);
  });

  test("switches all and single action states", () => {
    const defaultState = buildDefaultDocMenuRegistration(ACTIONS);
    expect(isAllDocMenuRegistrationEnabled(defaultState)).toBe(false);

    const allOn = setAllDocMenuRegistration(defaultState, true);
    expect(isAllDocMenuRegistrationEnabled(allOn)).toBe(true);
    for (const action of ACTIONS) {
      expect(allOn[action.key]).toBe(true);
    }

    const singleOff = setSingleDocMenuRegistration(allOn, "export-current", false);
    expect(singleOff["export-current"]).toBe(false);
    expect(isAllDocMenuRegistrationEnabled(singleOff)).toBe(false);
  });

  test("filters dock visible actions by enabled state", () => {
    const defaultEnabled = buildDefaultDocActionEnabled(ACTIONS);
    const visible = filterDockVisibleActions(ACTIONS, defaultEnabled);

    expect(visible.some((item) => item.key === "bold-selected-blocks")).toBe(false);
    expect(visible.some((item) => item.key === "highlight-selected-blocks")).toBe(false);
    expect(visible.some((item) => item.key === "export-current")).toBe(true);
    expect(visible).toHaveLength(ACTIONS.length - 2);
  });

  test("filters menu actions by registration state and enabled state", () => {
    const menuState = setSingleDocMenuRegistration(
      buildDefaultDocMenuRegistration(ACTIONS),
      "export-current",
      true
    );
    // When enabled
    const enabledState = buildDefaultDocActionEnabled(ACTIONS);
    const filtered1 = filterDocMenuActions(ACTIONS, menuState, enabledState);
    expect(filtered1.some((item) => item.key === "export-current")).toBe(true);
    expect(filtered1).toHaveLength(1);

    // When disabled in enabledState, should not appear in menu
    const disabledState = setSingleDocActionEnabled(enabledState, "export-current", false);
    const filtered2 = filterDocMenuActions(ACTIONS, menuState, disabledState);
    expect(filtered2.some((item) => item.key === "export-current")).toBe(false);
    expect(filtered2).toHaveLength(0);
  });

  test("normalizes custom action order and appends missing keys", () => {
    const order = normalizeDocActionOrder(
      {
        actionOrder: ["insert-backlinks", "export-current", "invalid-key", "insert-backlinks"],
      },
      ACTIONS
    );
    expect(order[0]).toBe("insert-backlinks");
    expect(order[1]).toBe("export-current");
    expect(order).toHaveLength(ACTIONS.length);
    expect(new Set(order).size).toBe(ACTIONS.length);
  });

  test("sorts actions by saved order", () => {
    const defaultOrder = buildDefaultDocActionOrder(ACTIONS);
    const customOrder = normalizeDocActionOrder(
      { actionOrder: ["insert-backlinks", "export-current"] },
      ACTIONS
    );
    expect(customOrder).toHaveLength(defaultOrder.length);
    const sorted = sortActionsByOrder(ACTIONS, customOrder);
    expect(sorted[0]?.key).toBe("insert-backlinks");
    expect(sorted[1]?.key).toBe("export-current");
  });

  test("places set-selection-as-title at the end of insert group by default", () => {
    const defaultOrder = buildDefaultDocActionOrder(ACTIONS);
    const sorted = sortActionsByOrder(ACTIONS, defaultOrder);
    const insertKeys = sorted
      .filter((action) => action.group === "insert")
      .map((action) => action.key);

    expect(insertKeys[insertKeys.length - 1]).toBe("set-selection-as-title");
  });

  test("allows moving insert-blank-before-headings via custom order", () => {
    const customOrder = normalizeDocActionOrder(
      {
        actionOrder: [
          "insert-blank-before-headings",
          "insert-backlinks",
          "insert-child-docs",
        ],
      },
      ACTIONS
    );
    const sorted = sortActionsByOrder(ACTIONS, customOrder);
    const insertKeys = sorted
      .filter((action) => action.group === "insert")
      .map((action) => action.key);

    expect(insertKeys[0]).toBe("insert-blank-before-headings");
  });

  test("normalizes favorite action keys and removes invalid values", () => {
    const favorites = normalizeDocFavoriteActionKeys(
      {
        favoriteActionKeys: [
          "insert-backlinks",
          "invalid-key",
          "export-current",
          "insert-backlinks",
        ],
      },
      ACTIONS
    );

    expect(favorites).toEqual(["insert-backlinks", "export-current"]);
  });

  test("sets and unsets single favorite action", () => {
    const added = setDocFavoriteAction([], "insert-backlinks", true);
    expect(added).toEqual(["insert-backlinks"]);

    const stable = setDocFavoriteAction(added, "insert-backlinks", true);
    expect(stable).toEqual(["insert-backlinks"]);

    const removed = setDocFavoriteAction(stable, "insert-backlinks", false);
    expect(removed).toEqual([]);
  });

  test("reorders favorite actions with stable fallback", () => {
    const reordered = reorderDocFavoriteActions(
      ["export-current", "insert-backlinks", "trim-trailing-whitespace"],
      ["insert-backlinks", "export-current"]
    );
    expect(reordered).toEqual([
      "insert-backlinks",
      "export-current",
      "trim-trailing-whitespace",
    ]);
  });
});
