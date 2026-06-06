import { describe, expect, test } from "vitest";
import { ACTIONS } from "@/plugin/actions";
import {
  ALPHA_FEATURE_HIDE_CONFIG,
  filterVisibleActions,
  getHiddenPluginSettingKeys,
} from "@/plugin/alpha-feature-config";

describe("alpha feature config", () => {
  test("shows all actions by default when config is empty", () => {
    const aiActionKeys = ACTIONS
      .filter((action) => action.group === "ai")
      .map((action) => action.key);
    const visibleActionKeys = filterVisibleActions(ACTIONS, ALPHA_FEATURE_HIDE_CONFIG)
      .map((action) => action.key);

    expect(aiActionKeys).not.toHaveLength(0);
    aiActionKeys.forEach((actionKey) => {
      expect(visibleActionKeys).toContain(actionKey);
    });
  });

  test("shows all settings by default when config is empty", () => {
    const hiddenSettingKeys = getHiddenPluginSettingKeys(ALPHA_FEATURE_HIDE_CONFIG);

    expect(hiddenSettingKeys.has("ai-service")).toBe(false);
  });

  test("returns hidden setting keys from config directly", () => {
    const hiddenSettingKeys = getHiddenPluginSettingKeys({
      hiddenActionKeys: [],
      hiddenSettingKeys: ["ai-service"],
    });

    expect(hiddenSettingKeys.has("ai-service")).toBe(true);
  });

  test("does not auto-hide ai service setting when ai actions are hidden", () => {
    const aiActionKey = ACTIONS.find((action) => action.group === "ai")?.key;

    expect(aiActionKey).toBeTruthy();

    const hiddenSettingKeys = getHiddenPluginSettingKeys({
      hiddenActionKeys: [aiActionKey!],
      hiddenSettingKeys: [],
    });

    expect(hiddenSettingKeys.has("ai-service")).toBe(false);
  });

  test("filters hidden actions from visible action lists", () => {
    const visibleActions = filterVisibleActions(ACTIONS, {
      hiddenActionKeys: ["insert-backlinks", "mark-key-content"],
      hiddenSettingKeys: [],
    });

    expect(visibleActions.map((action) => action.key)).not.toContain("insert-backlinks");
    expect(visibleActions.map((action) => action.key)).not.toContain("mark-key-content");
    expect(visibleActions).toHaveLength(ACTIONS.length - 2);
  });
});
