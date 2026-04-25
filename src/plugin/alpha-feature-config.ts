import { ACTIONS, ActionConfig, ActionKey } from "@/plugin/actions";

export type HiddenPluginSettingKey = "ai-service" | "monthly-diary-template";

export type AlphaFeatureHideConfig = {
  hiddenActionKeys: ActionKey[];
  hiddenSettingKeys: HiddenPluginSettingKey[];
};

const ACTION_LINKED_SETTING_KEYS: Partial<Record<ActionKey, HiddenPluginSettingKey>> = {
  "create-monthly-diary": "monthly-diary-template",
};

const DEFAULT_HIDDEN_ACTION_KEYS: ActionKey[] = ACTIONS
  .filter((action) => action.group === "ai")
  .map((action) => action.key);

const AI_GROUP_ACTION_KEYS = new Set<ActionKey>(DEFAULT_HIDDEN_ACTION_KEYS);

export const ALPHA_FEATURE_HIDE_CONFIG: AlphaFeatureHideConfig = {
  hiddenActionKeys: DEFAULT_HIDDEN_ACTION_KEYS,
  hiddenSettingKeys: [],
};

export function getHiddenActionKeys(
  config: AlphaFeatureHideConfig = ALPHA_FEATURE_HIDE_CONFIG
): Set<ActionKey> {
  return new Set(config.hiddenActionKeys);
}

export function getHiddenPluginSettingKeys(
  config: AlphaFeatureHideConfig = ALPHA_FEATURE_HIDE_CONFIG
): Set<HiddenPluginSettingKey> {
  const hiddenSettingKeys = new Set<HiddenPluginSettingKey>(config.hiddenSettingKeys);
  getHiddenActionKeys(config).forEach((actionKey) => {
    if (AI_GROUP_ACTION_KEYS.has(actionKey)) {
      hiddenSettingKeys.add("ai-service");
    }
    const linkedSettingKey = ACTION_LINKED_SETTING_KEYS[actionKey];
    if (linkedSettingKey) {
      hiddenSettingKeys.add(linkedSettingKey);
    }
  });
  return hiddenSettingKeys;
}

export function filterVisibleActions<T extends Pick<ActionConfig, "key">>(
  actions: T[],
  config: AlphaFeatureHideConfig = ALPHA_FEATURE_HIDE_CONFIG
): T[] {
  const hiddenActionKeys = getHiddenActionKeys(config);
  return actions.filter((action) => !hiddenActionKeys.has(action.key));
}
