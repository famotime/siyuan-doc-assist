import { ActionConfig, ActionKey } from "@/plugin/actions";

export type HiddenPluginSettingKey = "ai-service";

export type AlphaFeatureHideConfig = {
  hiddenActionKeys: ActionKey[];
  hiddenSettingKeys: HiddenPluginSettingKey[];
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
 *     - 插入组: "set-selection-as-title", "toggle-heading-bold"
 *   hiddenSettingKeys:
 *     - "ai-service"               AI 服务接入配置（Base URL / API Key / Model）
 */
export const ALPHA_FEATURE_HIDE_CONFIG: AlphaFeatureHideConfig = {
  hiddenActionKeys: [
    // "create-doc-concept-map",
    // "insert-doc-summary",
    "mark-irrelevant-paragraphs",
    "mark-key-content",
    // "recognize-doc-images",
    // "clean-ai-output",
    "set-selection-as-title",
    // "toggle-heading-bold",
    "export-keymap",
    "import-keymap",
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
  return new Set(config.hiddenSettingKeys);
}

export function filterVisibleActions<T extends Pick<ActionConfig, "key">>(
  actions: T[],
  config: AlphaFeatureHideConfig = ALPHA_FEATURE_HIDE_CONFIG
): T[] {
  const hiddenActionKeys = getHiddenActionKeys(config);
  return actions.filter((action) => !hiddenActionKeys.has(action.key));
}
