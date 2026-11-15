import {
  AiServiceConfig,
  buildDefaultAiServiceConfig,
  normalizeAiServiceConfig
} from "@/core/ai-service-config-core";
import {
  buildDefaultDocActionEnabled,
  buildDefaultDocActionOrder,
  buildDefaultDocMenuRegistration,
  DocActionEnabledState,
  DocMenuRegistrationState,
  DocMenuRegistrationStorageV1,
  normalizeDocActionEnabled,
  normalizeDocActionOrder,
  normalizeDocFavoriteActionKeys,
  normalizeDocMenuRegistration,
  reorderDocFavoriteActions,
  setAllDocActionEnabled as setAllDocActionEnabledState,
  setAllDocMenuRegistration as setAllDocMenuRegistrationState,
  setDocFavoriteAction as setDocFavoriteActionState,
  setSingleDocActionEnabled as setSingleDocActionEnabledState,
  setSingleDocMenuRegistration as setSingleDocMenuRegistrationState,
  sortActionsByOrder
} from "@/core/doc-menu-registration-core";
import {
  buildDefaultKeyInfoFilter,
  KeyInfoFilter,
  normalizeKeyInfoFilter
} from "@/core/key-info-core";
import { ActionConfig, ActionKey } from "@/plugin/actions";
import {
  DEFAULT_FLOATING_TEXT_CONFIG,
  FloatingTextConfig,
  normalizeFloatingConfig
} from "@/core/floating-text-core";
import {
  DEFAULT_GESTURE_BINDINGS,
  GestureBindings,
  normalizeGestureBindings
} from "@/core/gesture-recognition-core";

export type PluginDocMenuState = {
  docActionEnabledState: DocActionEnabledState;
  docMenuRegistrationState: DocMenuRegistrationState;
  docActionOrderState: ActionKey[];
  docFavoriteActionKeys: ActionKey[];
  keyInfoFilterState: KeyInfoFilter;
  aiSummaryConfig: AiServiceConfig;
  debugLogEnabled: boolean;
  floatingConfig: FloatingTextConfig;
  startupDocProcessTabEnabled: boolean;
  mouseGestureEnabled: boolean;
  mouseGestureBindings: GestureBindings;
};

type PluginDocMenuStorageV1 = DocMenuRegistrationStorageV1 & {
  keyInfoFilter?: unknown;
  aiSummaryConfig?: unknown;
  debugLogEnabled?: unknown;
  floatingConfig?: unknown;
  startupDocProcessTabEnabled?: unknown;
  mouseGestureEnabled?: unknown;
  mouseGestureBindings?: unknown;
};

export function buildDefaultPluginDocMenuState(
  actions: ActionConfig[]
): PluginDocMenuState {
  return {
    docActionEnabledState: buildDefaultDocActionEnabled(actions),
    docMenuRegistrationState: buildDefaultDocMenuRegistration(actions),
    docActionOrderState: buildDefaultDocActionOrder(actions),
    docFavoriteActionKeys: [],
    keyInfoFilterState: buildDefaultKeyInfoFilter(),
    aiSummaryConfig: buildDefaultAiServiceConfig(),
    debugLogEnabled: false,
    floatingConfig: { ...DEFAULT_FLOATING_TEXT_CONFIG },
    startupDocProcessTabEnabled: false,
    mouseGestureEnabled: false,
    mouseGestureBindings: { ...DEFAULT_GESTURE_BINDINGS }
  };
}

export function normalizePluginDocMenuState(
  raw: unknown,
  actions: ActionConfig[]
): PluginDocMenuState {
  return {
    docActionEnabledState: normalizeDocActionEnabled(raw, actions),
    docMenuRegistrationState: normalizeDocMenuRegistration(raw, actions),
    docActionOrderState: normalizeDocActionOrder(raw, actions),
    docFavoriteActionKeys: normalizeDocFavoriteActionKeys(raw, actions),
    keyInfoFilterState: normalizeStoredKeyInfoFilter(raw),
    aiSummaryConfig: normalizeStoredAiSummaryConfig(raw),
    debugLogEnabled: normalizeStoredDebugLogEnabled(raw),
    floatingConfig: normalizeStoredFloatingConfig(raw),
    startupDocProcessTabEnabled: normalizeStoredStartupDocProcessTabEnabled(raw),
    mouseGestureEnabled: normalizeStoredMouseGestureEnabled(raw),
    mouseGestureBindings: normalizeStoredMouseGestureBindings(raw)
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

function normalizeStoredAiSummaryConfig(raw: unknown): AiServiceConfig {
  if (!raw || typeof raw !== "object") {
    return buildDefaultAiServiceConfig();
  }
  return normalizeAiServiceConfig((raw as PluginDocMenuStorageV1).aiSummaryConfig);
}

function normalizeStoredDebugLogEnabled(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") {
    return false;
  }
  const value = (raw as PluginDocMenuStorageV1).debugLogEnabled;
  return typeof value === "boolean" ? value : false;
}

function normalizeStoredFloatingConfig(raw: unknown): FloatingTextConfig {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_FLOATING_TEXT_CONFIG };
  }
  const value = (raw as PluginDocMenuStorageV1).floatingConfig;
  return normalizeFloatingConfig(value as any);
}

function normalizeStoredStartupDocProcessTabEnabled(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") {
    return false;
  }
  const value = (raw as PluginDocMenuStorageV1).startupDocProcessTabEnabled;
  return typeof value === "boolean" ? value : false;
}

function normalizeStoredMouseGestureEnabled(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") {
    return false;
  }
  const value = (raw as PluginDocMenuStorageV1).mouseGestureEnabled;
  return typeof value === "boolean" ? value : false;
}

function normalizeStoredMouseGestureBindings(raw: unknown): GestureBindings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_GESTURE_BINDINGS };
  }
  const value = (raw as PluginDocMenuStorageV1).mouseGestureBindings;
  return normalizeGestureBindings(value);
}

export function serializePluginDocMenuState(
  state: PluginDocMenuState
): PluginDocMenuStorageV1 {
  return {
    version: 1,
    actionEnabled: state.docActionEnabledState,
    actionMenuRegistered: state.docMenuRegistrationState,
    actionOrder: state.docActionOrderState,
    favoriteActionKeys: state.docFavoriteActionKeys,
    keyInfoFilter: state.keyInfoFilterState,
    aiSummaryConfig: state.aiSummaryConfig,
    debugLogEnabled: state.debugLogEnabled,
    floatingConfig: state.floatingConfig,
    startupDocProcessTabEnabled: state.startupDocProcessTabEnabled,
    mouseGestureEnabled: state.mouseGestureEnabled,
    mouseGestureBindings: state.mouseGestureBindings
  };
}

export function getOrderedPluginActions(
  actions: ActionConfig[],
  state: PluginDocMenuState
): ActionConfig[] {
  return sortActionsByOrder(actions, state.docActionOrderState);
}

export function setAllPluginDocActionEnabled(
  state: PluginDocMenuState,
  enabled: boolean,
  actionKeys?: Iterable<ActionKey>
): PluginDocMenuState {
  return {
    ...state,
    docActionEnabledState: setAllDocActionEnabledState(
      state.docActionEnabledState,
      enabled,
      actionKeys
    )
  };
}

export function setSinglePluginDocActionEnabled(
  state: PluginDocMenuState,
  key: ActionKey,
  enabled: boolean
): PluginDocMenuState {
  return {
    ...state,
    docActionEnabledState: setSingleDocActionEnabledState(
      state.docActionEnabledState,
      key,
      enabled
    )
  };
}

export function setAllPluginDocMenuRegistration(
  state: PluginDocMenuState,
  enabled: boolean,
  actionKeys?: Iterable<ActionKey>
): PluginDocMenuState {
  return {
    ...state,
    docMenuRegistrationState: setAllDocMenuRegistrationState(
      state.docMenuRegistrationState,
      enabled,
      actionKeys
    )
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
    )
  };
}

export function setPluginDocActionOrder(
  state: PluginDocMenuState,
  order: ActionKey[],
  actions: ActionConfig[]
): PluginDocMenuState {
  return {
    ...state,
    docActionOrderState: normalizeDocActionOrder({ actionOrder: order }, actions)
  };
}

export function resetPluginDocActionOrder(
  state: PluginDocMenuState,
  actions: ActionConfig[]
): PluginDocMenuState {
  return {
    ...state,
    docActionOrderState: buildDefaultDocActionOrder(actions)
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
    )
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
    )
  };
}

export function setPluginKeyInfoFilter(
  state: PluginDocMenuState,
  filter: KeyInfoFilter
): PluginDocMenuState {
  return {
    ...state,
    keyInfoFilterState: normalizeKeyInfoFilter(filter)
  };
}

export function setAiSummaryConfig(
  state: PluginDocMenuState,
  config: AiServiceConfig
): PluginDocMenuState {
  return {
    ...state,
    aiSummaryConfig: normalizeAiServiceConfig(config)
  };
}

export function setFloatingConfig(
  state: PluginDocMenuState,
  config: Partial<FloatingTextConfig>
): PluginDocMenuState {
  return {
    ...state,
    floatingConfig: normalizeFloatingConfig({
      ...state.floatingConfig,
      ...config
    })
  };
}

export function setPluginStartupDocProcessTabEnabled(
  state: PluginDocMenuState,
  enabled: boolean
): PluginDocMenuState {
  return {
    ...state,
    startupDocProcessTabEnabled: Boolean(enabled)
  };
}

export function setPluginMouseGestureEnabled(
  state: PluginDocMenuState,
  enabled: boolean
): PluginDocMenuState {
  return {
    ...state,
    mouseGestureEnabled: Boolean(enabled)
  };
}

export function setPluginMouseGestureBindings(
  state: PluginDocMenuState,
  bindings: GestureBindings
): PluginDocMenuState {
  return {
    ...state,
    mouseGestureBindings: normalizeGestureBindings(bindings)
  };
}

