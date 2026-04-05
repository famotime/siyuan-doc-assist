import { describe, expect, test } from "vitest";
import { ACTIONS } from "@/plugin/actions";
import {
  filterVisibleActions,
  getHiddenPluginSettingKeys,
} from "@/plugin/alpha-feature-config";

describe("alpha feature config", () => {
  test("hides linked settings when related actions are hidden", () => {
    const hiddenSettingKeys = getHiddenPluginSettingKeys({
      hiddenActionKeys: ["create-monthly-diary"],
      hiddenSettingKeys: [],
    });

    expect(hiddenSettingKeys.has("monthly-diary-template")).toBe(true);
    expect(hiddenSettingKeys.has("ai-service")).toBe(false);
  });

  test("filters hidden actions from visible action lists", () => {
    const visibleActions = filterVisibleActions(ACTIONS, {
      hiddenActionKeys: ["create-monthly-diary", "mark-key-content"],
      hiddenSettingKeys: [],
    });

    expect(visibleActions.map((action) => action.key)).not.toContain("create-monthly-diary");
    expect(visibleActions.map((action) => action.key)).not.toContain("mark-key-content");
    expect(visibleActions).toHaveLength(ACTIONS.length - 2);
  });
});
