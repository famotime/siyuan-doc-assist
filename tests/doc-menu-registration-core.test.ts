import { describe, expect, test } from "vitest";
import { ACTIONS } from "@/plugin/actions";
import {
  buildDefaultDocActionOrder,
  buildDefaultDocMenuRegistration,
  filterDocMenuActions,
  isAllDocMenuRegistrationEnabled,
  normalizeDocFavoriteActionKeys,
  normalizeDocActionOrder,
  normalizeDocMenuRegistration,
  reorderDocFavoriteActions,
  setAllDocMenuRegistration,
  setDocFavoriteAction,
  setSingleDocMenuRegistration,
  sortActionsByOrder,
} from "@/core/doc-menu-registration-core";

describe("doc-menu-registration-core", () => {
  test("builds default state with all actions disabled", () => {
    const state = buildDefaultDocMenuRegistration(ACTIONS);

    expect(Object.keys(state)).toHaveLength(ACTIONS.length);
    for (const action of ACTIONS) {
      expect(state[action.key]).toBe(false);
    }
    expect(isAllDocMenuRegistrationEnabled(state)).toBe(false);
  });

  test("normalizes invalid storage data with defaults", () => {
    const state = normalizeDocMenuRegistration(
      {
        version: 1,
        actionEnabled: {
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

  test("filters menu actions by registration state", () => {
    const state = setSingleDocMenuRegistration(
      buildDefaultDocMenuRegistration(ACTIONS),
      "export-current",
      true
    );
    const filtered = filterDocMenuActions(ACTIONS, state);

    expect(filtered.some((item) => item.key === "export-current")).toBe(true);
    expect(filtered).toHaveLength(1);
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
