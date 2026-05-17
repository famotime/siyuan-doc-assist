import { ActionConfig, ActionKey } from "@/plugin/actions";

export type HiddenPluginSettingKey = "ai-service" | "monthly-diary-template";

export type AlphaFeatureHideConfig = {
  hiddenActionKeys: ActionKey[];
  hiddenSettingKeys: HiddenPluginSettingKey[];
};

const ACTION_LINKED_SETTING_KEYS: Partial<Record<ActionKey, HiddenPluginSettingKey>> = {
  "create-monthly-diary": "monthly-diary-template",
};

/**
 * 在此处手动配置需要隐藏的动作和设置项。
 * 修改后重新构建即可生效，无需改其他文件。
 *
 * 完整的可用 key 清单请参阅 docs/alpha-feature-hidden-config.md。
 *
 * 常用隐藏 key 速览：
 *   hiddenActionKeys:
 *     - AI 组: "create-doc-concept-map", "insert-doc-summary",
 *       "mark-irrelevant-paragraphs", "mark-key-content",
 *       "recognize-doc-images", "clean-ai-output"
 *     - 插入组: "create-monthly-diary"（联动隐藏 monthly-diary-template 设置项）
 *   hiddenSettingKeys:
 *     - "ai-service"               AI 服务接入配置（Base URL / API Key / Model）
 *     - "monthly-diary-template"   本月日记模板
 */
export const ALPHA_FEATURE_HIDE_CONFIG: AlphaFeatureHideConfig = {
  hiddenActionKeys: [
    // "create-doc-concept-map",
    // "insert-doc-summary",
    // "mark-irrelevant-paragraphs",
    // "mark-key-content",
    // "recognize-doc-images",
    // "clean-ai-output",
    // "create-monthly-diary",
    // "set-selection-as-title",
    // "toggle-heading-bold",
    // "export-keymap",
    // "import-keymap",
  ],
  hiddenSettingKeys: [
    // "ai-service"
  ],
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
