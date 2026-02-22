import { describe, expect, test } from "vitest";
import { ACTIONS } from "@/plugin/actions";
import {
  buildDefaultDocMenuRegistration,
  filterDocMenuActions,
  isAllDocMenuRegistrationEnabled,
  normalizeDocMenuRegistration,
  setAllDocMenuRegistration,
  setSingleDocMenuRegistration,
} from "@/core/doc-menu-registration-core";

describe("doc-menu-registration-core", () => {
  test("builds default state with all actions enabled", () => {
    const state = buildDefaultDocMenuRegistration(ACTIONS);

    expect(Object.keys(state)).toHaveLength(ACTIONS.length);
    for (const action of ACTIONS) {
      expect(state[action.key]).toBe(true);
    }
    expect(isAllDocMenuRegistrationEnabled(state)).toBe(true);
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
    expect(state["insert-backlinks"]).toBe(true);
    expect(state["move-backlinks"]).toBe(true);
  });

  test("switches all and single action states", () => {
    const defaultState = buildDefaultDocMenuRegistration(ACTIONS);
    const allOff = setAllDocMenuRegistration(defaultState, false);
    expect(isAllDocMenuRegistrationEnabled(allOff)).toBe(false);
    for (const action of ACTIONS) {
      expect(allOff[action.key]).toBe(false);
    }

    const singleOn = setSingleDocMenuRegistration(allOff, "export-current", true);
    expect(singleOn["export-current"]).toBe(true);
    expect(isAllDocMenuRegistrationEnabled(singleOn)).toBe(false);
  });

  test("filters menu actions by registration state", () => {
    const state = setSingleDocMenuRegistration(
      buildDefaultDocMenuRegistration(ACTIONS),
      "export-current",
      false
    );
    const filtered = filterDocMenuActions(ACTIONS, state);

    expect(filtered.some((item) => item.key === "export-current")).toBe(false);
    expect(filtered).toHaveLength(ACTIONS.length - 1);
  });
});
