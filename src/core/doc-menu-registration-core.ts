import { ActionConfig, ActionKey } from "@/plugin/actions";

export type DocMenuRegistrationState = Record<ActionKey, boolean>;

export type DocMenuRegistrationStorageV1 = {
  version: 1;
  actionEnabled: Partial<Record<ActionKey, boolean>>;
  actionOrder?: ActionKey[];
};

export function buildDefaultDocMenuRegistration(
  actions: Pick<ActionConfig, "key">[]
): DocMenuRegistrationState {
  const state = {} as DocMenuRegistrationState;
  for (const action of actions) {
    state[action.key] = true;
  }
  return state;
}

export function normalizeDocMenuRegistration(
  raw: unknown,
  actions: Pick<ActionConfig, "key">[]
): DocMenuRegistrationState {
  const defaultState = buildDefaultDocMenuRegistration(actions);
  if (!raw || typeof raw !== "object") {
    return defaultState;
  }
  const source = (raw as { actionEnabled?: unknown }).actionEnabled;
  if (!source || typeof source !== "object") {
    return defaultState;
  }
  const normalized = { ...defaultState };
  for (const action of actions) {
    const value = (source as Record<string, unknown>)[action.key];
    normalized[action.key] = typeof value === "boolean" ? value : true;
  }
  return normalized;
}

export function isAllDocMenuRegistrationEnabled(
  state: DocMenuRegistrationState
): boolean {
  return Object.values(state).every(Boolean);
}

export function setAllDocMenuRegistration(
  state: DocMenuRegistrationState,
  enabled: boolean
): DocMenuRegistrationState {
  const next = { ...state };
  for (const key of Object.keys(next) as ActionKey[]) {
    next[key] = enabled;
  }
  return next;
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

export function filterDocMenuActions<T extends Pick<ActionConfig, "key">>(
  actions: T[],
  state: DocMenuRegistrationState
): T[] {
  return actions.filter((action) => state[action.key] !== false);
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
