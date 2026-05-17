import {
  ACTION_DOCK_ICON_TEXT,
  BASE_ACTIONS,
  type ActionConfig,
  type ActionKey,
} from "@/plugin/action-definitions";

export type { ActionConfig, ActionKey } from "@/plugin/action-definitions";
export { formatActionTooltip } from "@/plugin/action-definitions";

export const ACTIONS: ActionConfig[] = BASE_ACTIONS.map((action) => ({
  ...action,
  dockIconText: ACTION_DOCK_ICON_TEXT[action.key],
}));

export const ACTION_CONFIG_BY_KEY = new Map<ActionKey, ActionConfig>(
  ACTIONS.map((action) => [action.key, action])
);

const ACTION_KEY_SET = new Set<ActionKey>(ACTIONS.map((action) => action.key));

export function isActionKey(value: string): value is ActionKey {
  return ACTION_KEY_SET.has(value as ActionKey);
}

export function getActionConfigByKey(key: ActionKey): ActionConfig {
  const action = ACTION_CONFIG_BY_KEY.get(key);
  if (!action) {
    throw new Error(`Unknown action key: ${key}`);
  }
  return action;
}

export function getActionDockIconTextByKey(key: string): string | undefined {
  return ACTION_CONFIG_BY_KEY.get(key as ActionKey)?.dockIconText;
}
