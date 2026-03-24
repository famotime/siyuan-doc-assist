import {
  buildDefaultDocActionOrder,
  buildDefaultDocMenuRegistration,
  DocMenuRegistrationState,
  DocMenuRegistrationStorageV1,
  normalizeDocActionOrder,
  normalizeDocFavoriteActionKeys,
  normalizeDocMenuRegistration,
  reorderDocFavoriteActions,
  setAllDocMenuRegistration as setAllDocMenuRegistrationState,
  setDocFavoriteAction as setDocFavoriteActionState,
  setSingleDocMenuRegistration as setSingleDocMenuRegistrationState,
  sortActionsByOrder,
} from "@/core/doc-menu-registration-core";
import {
  buildDefaultKeyInfoFilter,
  KeyInfoFilter,
  normalizeKeyInfoFilter,
} from "@/core/key-info-core";
import { ActionConfig, ActionKey } from "@/plugin/actions";

export type PluginDocMenuState = {
  docMenuRegistrationState: DocMenuRegistrationState;
  docActionOrderState: ActionKey[];
  docFavoriteActionKeys: ActionKey[];
  keyInfoFilterState: KeyInfoFilter;
  keepNewDocAfterPinnedTabs: boolean;
};

type PluginDocMenuStorageV1 = DocMenuRegistrationStorageV1 & {
  keyInfoFilter?: unknown;
  keepNewDocAfterPinnedTabs?: unknown;
};

export function buildDefaultPluginDocMenuState(
  actions: ActionConfig[]
): PluginDocMenuState {
  return {
    docMenuRegistrationState: buildDefaultDocMenuRegistration(actions),
    docActionOrderState: buildDefaultDocActionOrder(actions),
    docFavoriteActionKeys: [],
    keyInfoFilterState: buildDefaultKeyInfoFilter(),
    keepNewDocAfterPinnedTabs: false,
  };
}

export function normalizePluginDocMenuState(
  raw: unknown,
  actions: ActionConfig[]
): PluginDocMenuState {
  return {
    docMenuRegistrationState: normalizeDocMenuRegistration(raw, actions),
    docActionOrderState: normalizeDocActionOrder(raw, actions),
    docFavoriteActionKeys: normalizeDocFavoriteActionKeys(raw, actions),
    keyInfoFilterState: normalizeStoredKeyInfoFilter(raw),
    keepNewDocAfterPinnedTabs: normalizeKeepNewDocAfterPinnedTabs(raw),
  };
}

function normalizeStoredKeyInfoFilter(raw: unknown): KeyInfoFilter {
  if (!raw || typeof raw !== "object") {
    return buildDefaultKeyInfoFilter();
  }

  const value = (raw as PluginDocMenuStorageV1).keyInfoFilter;
  if (typeof value === "undefined") {
    return buildDefaultKeyInfoFilter();
  }

  return normalizeKeyInfoFilter(value);
}

function normalizeKeepNewDocAfterPinnedTabs(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") {
    return false;
  }
  return (raw as PluginDocMenuStorageV1).keepNewDocAfterPinnedTabs === true;
}

export function serializePluginDocMenuState(
  state: PluginDocMenuState
): PluginDocMenuStorageV1 {
  return {
    version: 1,
    actionEnabled: state.docMenuRegistrationState,
    actionOrder: state.docActionOrderState,
    favoriteActionKeys: state.docFavoriteActionKeys,
    keyInfoFilter: state.keyInfoFilterState,
    keepNewDocAfterPinnedTabs: state.keepNewDocAfterPinnedTabs,
  };
}

export function getOrderedPluginActions(
  actions: ActionConfig[],
  state: PluginDocMenuState
): ActionConfig[] {
  return sortActionsByOrder(actions, state.docActionOrderState);
}

export function setAllPluginDocMenuRegistration(
  state: PluginDocMenuState,
  enabled: boolean
): PluginDocMenuState {
  return {
    ...state,
    docMenuRegistrationState: setAllDocMenuRegistrationState(
      state.docMenuRegistrationState,
      enabled
    ),
  };
}

export function setSinglePluginDocMenuRegistration(
  state: PluginDocMenuState,
  key: ActionKey,
  enabled: boolean
): PluginDocMenuState {
  return {
    ...state,
    docMenuRegistrationState: setSingleDocMenuRegistrationState(
      state.docMenuRegistrationState,
      key,
      enabled
    ),
  };
}

export function setPluginDocActionOrder(
  state: PluginDocMenuState,
  order: ActionKey[],
  actions: ActionConfig[]
): PluginDocMenuState {
  return {
    ...state,
    docActionOrderState: normalizeDocActionOrder({ actionOrder: order }, actions),
  };
}

export function resetPluginDocActionOrder(
  state: PluginDocMenuState,
  actions: ActionConfig[]
): PluginDocMenuState {
  return {
    ...state,
    docActionOrderState: buildDefaultDocActionOrder(actions),
  };
}

export function setPluginDocActionFavorite(
  state: PluginDocMenuState,
  key: ActionKey,
  favorited: boolean
): PluginDocMenuState {
  return {
    ...state,
    docFavoriteActionKeys: setDocFavoriteActionState(
      state.docFavoriteActionKeys,
      key,
      favorited
    ),
  };
}

export function reorderPluginDocFavoriteActions(
  state: PluginDocMenuState,
  order: ActionKey[]
): PluginDocMenuState {
  return {
    ...state,
    docFavoriteActionKeys: reorderDocFavoriteActions(
      state.docFavoriteActionKeys,
      order
    ),
  };
}

export function setPluginKeyInfoFilter(
  state: PluginDocMenuState,
  filter: KeyInfoFilter
): PluginDocMenuState {
  return {
    ...state,
    keyInfoFilterState: normalizeKeyInfoFilter(filter),
  };
}

export function setKeepNewDocAfterPinnedTabs(
  state: PluginDocMenuState,
  enabled: boolean
): PluginDocMenuState {
  return {
    ...state,
    keepNewDocAfterPinnedTabs: enabled,
  };
}
