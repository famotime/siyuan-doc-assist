import { ActionConfig, ActionKey } from "@/plugin/actions";

export type DocMenuRegistrationState = Record<ActionKey, boolean>;

export type DocMenuRegistrationStorageV1 = {
  version: 1;
  actionEnabled: Partial<Record<ActionKey, boolean>>;
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
