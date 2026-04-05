import { ActionConfig, ActionKey } from "@/plugin/actions";

export type HiddenPluginSettingKey = "ai-service" | "monthly-diary-template";

export type AlphaFeatureHideConfig = {
  hiddenActionKeys: ActionKey[];
  hiddenSettingKeys: HiddenPluginSettingKey[];
};

const ACTION_LINKED_SETTING_KEYS: Partial<Record<ActionKey, HiddenPluginSettingKey>> = {
  "create-monthly-diary": "monthly-diary-template",
};

export const ALPHA_FEATURE_HIDE_CONFIG: AlphaFeatureHideConfig = {
  hiddenActionKeys: [],
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
