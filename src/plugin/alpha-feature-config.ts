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
 * 可用 hiddenActionKeys（动作 key）：
 *   - "create-doc-concept-map"      生成概念地图
 *   - "insert-doc-summary"          插入文档摘要
 *   - "mark-irrelevant-paragraphs"  标记口水内容
 *   - "mark-key-content"            标记关键内容
 *   - "clean-ai-output"             清理AI输出内容
 *   - "create-monthly-diary"        新建本月日记（联动隐藏 monthly-diary-template 设置项）
 *
 * 可用 hiddenSettingKeys（设置项 key）：
 *   - "ai-service"               AI 服务接入配置（Base URL / API Key / Model）
 *   - "monthly-diary-template"   本月日记模板
 */
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
