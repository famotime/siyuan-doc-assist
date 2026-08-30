import {
  isActionDefaultEnabled,
  isActionDefaultMenuRegistered,
} from "@/core/action-default-config";
import { ActionConfig, ActionKey } from "@/plugin/actions";

export type DocActionEnabledState = Record<ActionKey, boolean>;
export type DocMenuRegistrationState = Record<ActionKey, boolean>;

export type DocMenuRegistrationStorageV1 = {
  version: 1;
  actionEnabled?: Partial<Record<ActionKey, boolean>>;
  actionMenuRegistered?: Partial<Record<ActionKey, boolean>>;
  actionOrder?: ActionKey[];
  favoriteActionKeys?: ActionKey[];
};

export function buildDefaultDocActionEnabled(
  actions: Pick<ActionConfig, "key">[]
): DocActionEnabledState {
  const state = {} as DocActionEnabledState;
  for (const action of actions) {
    state[action.key] = isActionDefaultEnabled(action.key);
  }
  return state;
}

export function buildDefaultDocMenuRegistration(
  actions: Pick<ActionConfig, "key">[]
): DocMenuRegistrationState {
  const state = {} as DocMenuRegistrationState;
  for (const action of actions) {
    state[action.key] = isActionDefaultMenuRegistered(action.key);
  }
  return state;
}

export function normalizeDocActionEnabled(
  raw: unknown,
  actions: Pick<ActionConfig, "key">[]
): DocActionEnabledState {
  const defaultState = buildDefaultDocActionEnabled(actions);
  if (!raw || typeof raw !== "object") {
    return defaultState;
  }
  // 老版本存储中 actionEnabled 实际为菜单注册数据，且不存在 actionMenuRegistered 字段。
  // 若未检测到 actionMenuRegistered，说明是老版本数据，直接返回全新默认启用状态，避免老数据污染。
  if (typeof (raw as Record<string, unknown>).actionMenuRegistered === "undefined") {
    return defaultState;
  }
  const source = (raw as { actionEnabled?: unknown }).actionEnabled;
  if (!source || typeof source !== "object") {
    return defaultState;
  }
  const normalized = { ...defaultState };
  for (const action of actions) {
    const value = (source as Record<string, unknown>)[action.key];
    if (typeof value === "boolean") {
      normalized[action.key] = value;
    }
  }
  return normalized;
}

export function normalizeDocMenuRegistration(
  raw: unknown,
  actions: Pick<ActionConfig, "key">[]
): DocMenuRegistrationState {
  const defaultState = buildDefaultDocMenuRegistration(actions);
  if (!raw || typeof raw !== "object") {
    return defaultState;
  }
  const source = (raw as { actionMenuRegistered?: unknown }).actionMenuRegistered;
  if (!source || typeof source !== "object") {
    return defaultState;
  }
  const normalized = { ...defaultState };
  for (const action of actions) {
    const value = (source as Record<string, unknown>)[action.key];
    if (typeof value === "boolean") {
      normalized[action.key] = value;
    }
  }
  return normalized;
}

export function isAllDocActionEnabled(
  state: DocActionEnabledState,
  actionKeys?: Iterable<ActionKey>
): boolean {
  const keys = actionKeys ? Array.from(actionKeys) : (Object.keys(state) as ActionKey[]);
  if (!keys.length) {
    return false;
  }
  return keys.every((key) => state[key] === true);
}

export function isAllDocMenuRegistrationEnabled(
  state: DocMenuRegistrationState,
  actionKeys?: Iterable<ActionKey>
): boolean {
  const keys = actionKeys ? Array.from(actionKeys) : (Object.keys(state) as ActionKey[]);
  if (!keys.length) {
    return false;
  }
  return keys.every((key) => state[key] === true);
}

export function setAllDocActionEnabled(
  state: DocActionEnabledState,
  enabled: boolean,
  actionKeys?: Iterable<ActionKey>
): DocActionEnabledState {
  const next = { ...state };
  const targetKeys = actionKeys ? Array.from(actionKeys) : (Object.keys(next) as ActionKey[]);
  for (const key of targetKeys) {
    next[key] = enabled;
  }
  return next;
}

export function setAllDocMenuRegistration(
  state: DocMenuRegistrationState,
  enabled: boolean,
  actionKeys?: Iterable<ActionKey>
): DocMenuRegistrationState {
  const next = { ...state };
  const targetKeys = actionKeys ? Array.from(actionKeys) : (Object.keys(next) as ActionKey[]);
  for (const key of targetKeys) {
    next[key] = enabled;
  }
  return next;
}

export function setSingleDocActionEnabled(
  state: DocActionEnabledState,
  key: ActionKey,
  enabled: boolean
): DocActionEnabledState {
  return {
    ...state,
    [key]: enabled,
  };
}

export function setSingleDocMenuRegistration(
  state: DocMenuRegistrationState,
  key: ActionKey,
  enabled: boolean
): DocMenuRegistrationState {
  return {
    ...state,
    [key]: enabled,
  };
}

export function filterDockVisibleActions<T extends Pick<ActionConfig, "key">>(
  actions: T[],
  enabledState: DocActionEnabledState
): T[] {
  return actions.filter((action) => enabledState[action.key] === true);
}

export function filterDocMenuActions<T extends Pick<ActionConfig, "key">>(
  actions: T[],
  menuRegistrationState: DocMenuRegistrationState,
  enabledState?: DocActionEnabledState
): T[] {
  return actions.filter((action) => {
    const isMenuRegistered = menuRegistrationState[action.key] === true;
    if (!isMenuRegistered) {
      return false;
    }
    if (enabledState) {
      return enabledState[action.key] === true;
    }
    return true;
  });
}

export function buildDefaultDocActionOrder(
  actions: Pick<ActionConfig, "key">[]
): ActionKey[] {
  return actions.map((action) => action.key);
}

export function normalizeDocActionOrder(
  raw: unknown,
  actions: Pick<ActionConfig, "key">[]
): ActionKey[] {
  const defaultOrder = buildDefaultDocActionOrder(actions);
  if (!raw || typeof raw !== "object") {
    return defaultOrder;
  }
  const source = (raw as { actionOrder?: unknown }).actionOrder;
  if (!Array.isArray(source)) {
    return defaultOrder;
  }

  const allowed = new Set<ActionKey>(defaultOrder);
  const used = new Set<ActionKey>();
  const normalized: ActionKey[] = [];
  for (const item of source) {
    const key = typeof item === "string" ? (item as ActionKey) : null;
    if (!key || !allowed.has(key) || used.has(key)) {
      continue;
    }
    used.add(key);
    normalized.push(key);
  }
  for (const key of defaultOrder) {
    if (used.has(key)) {
      continue;
    }
    normalized.push(key);
  }
  return normalized;
}

export function normalizeDocFavoriteActionKeys(
  raw: unknown,
  actions: Pick<ActionConfig, "key">[]
): ActionKey[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const source = (raw as { favoriteActionKeys?: unknown }).favoriteActionKeys;
  if (!Array.isArray(source)) {
    return [];
  }
  const allowed = new Set<ActionKey>(actions.map((action) => action.key));
  const used = new Set<ActionKey>();
  const normalized: ActionKey[] = [];
  for (const item of source) {
    const key = typeof item === "string" ? (item as ActionKey) : null;
    if (!key || !allowed.has(key) || used.has(key)) {
      continue;
    }
    used.add(key);
    normalized.push(key);
  }
  return normalized;
}

export function setDocFavoriteAction(
  state: ActionKey[],
  key: ActionKey,
  favorited: boolean
): ActionKey[] {
  const exists = state.includes(key);
  if (favorited) {
    if (exists) {
      return state;
    }
    return [...state, key];
  }
  if (!exists) {
    return state;
  }
  return state.filter((item) => item !== key);
}

export function reorderDocFavoriteActions(
  current: ActionKey[],
  nextOrder: ActionKey[]
): ActionKey[] {
  const allowed = new Set<ActionKey>(current);
  const used = new Set<ActionKey>();
  const reordered: ActionKey[] = [];
  for (const key of nextOrder) {
    if (!allowed.has(key) || used.has(key)) {
      continue;
    }
    used.add(key);
    reordered.push(key);
  }
  for (const key of current) {
    if (used.has(key)) {
      continue;
    }
    reordered.push(key);
  }
  return reordered;
}

export function sortActionsByOrder<T extends Pick<ActionConfig, "key">>(
  actions: T[],
  order: Array<T["key"]>
): T[] {
  const indexMap = new Map<T["key"], number>();
  order.forEach((key, index) => {
    indexMap.set(key, index);
  });
  const fallbackBase = order.length + 1;
  return [...actions].sort((a, b) => {
    const ai = indexMap.get(a.key) ?? fallbackBase;
    const bi = indexMap.get(b.key) ?? fallbackBase;
    return ai - bi;
  });
}
