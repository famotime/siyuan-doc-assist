import { AiServiceConfig } from "@/core/ai-service-config-core";
import { FloatingTextConfig } from "@/core/floating-text-core";
import { GestureBindings } from "@/core/gesture-recognition-core";
import { DynamicOutlineViewMode } from "@/core/dynamic-outline-core";
import { ActionConfig, ActionKey } from "@/plugin/actions";
import {
  ALPHA_FEATURE_HIDE_CONFIG,
  getHiddenPluginSettingKeys
} from "@/plugin/alpha-feature-config";
import { PluginDocMenuState } from "@/plugin/plugin-lifecycle-state";
import { createPluginSettings } from "@/ui/plugin-settings";

export type BuildPluginSettingPageParams = {
  actions: ActionConfig[];
  state: PluginDocMenuState;
  isMobile: boolean;
  managedAiConfig: AiServiceConfig | null;
  onAiSummaryConfigChange: (config: AiServiceConfig) => Promise<void>;
  onToggleAllEnabled: (enabled: boolean) => Promise<void>;
  onToggleAllMenu: (enabled: boolean) => Promise<void>;
  onToggleSingleEnabled: (key: ActionKey, enabled: boolean) => Promise<void>;
  onToggleSingleMenu: (key: ActionKey, enabled: boolean) => Promise<void>;
  onDebugLogEnabledChange: (enabled: boolean) => Promise<void>;
  onAutoPasteOnSelectChange: (enabled: boolean) => Promise<void>;
  onStartupDocProcessTabEnabledChange: (enabled: boolean) => Promise<void>;
  onMouseGestureEnabledChange: (enabled: boolean) => Promise<void>;
  onMouseGestureBindingsChange: (bindings: GestureBindings) => Promise<void>;
  onGestureRecordingChange: (recording: boolean) => void;
  onDynamicOutlineEnabledChange: (enabled: boolean) => Promise<void>;
  onDynamicOutlineFollowKeyInfoChange: (follow: boolean) => Promise<void>;
  onDynamicOutlineQuickSwitchEnabledChange: (enabled: boolean) => Promise<void>;
  onDynamicOutlineViewModesChange: (modes: DynamicOutlineViewMode[]) => Promise<void>;
};

export function buildPluginLifecycleSettingPage(
  params: BuildPluginSettingPageParams
): ReturnType<typeof createPluginSettings> {
  const { state } = params;
  return createPluginSettings({
    actions: params.actions,
    enabledState: state.docActionEnabledState,
    registration: state.docMenuRegistrationState,
    isMobile: params.isMobile,
    aiSummaryConfig: state.aiSummaryConfig,
    managedAiConfig: params.managedAiConfig,
    debugLogEnabled: state.debugLogEnabled,
    autoPasteOnSelect: state.floatingConfig.autoPasteOnSelect ?? false,
    startupDocProcessTabEnabled: state.startupDocProcessTabEnabled,
    mouseGestureEnabled: state.mouseGestureEnabled,
    mouseGestureBindings: state.mouseGestureBindings,
    dynamicOutlineEnabled: state.dynamicOutlineEnabled,
    dynamicOutlineFollowKeyInfo: state.dynamicOutlineFollowKeyInfo,
    dynamicOutlineQuickSwitchEnabled: state.dynamicOutlineQuickSwitchEnabled,
    dynamicOutlineViewModes: state.dynamicOutlineViewModes,
    hiddenSettingKeys: getHiddenPluginSettingKeys(ALPHA_FEATURE_HIDE_CONFIG),
    onAiSummaryConfigChange: params.onAiSummaryConfigChange,
    onToggleAllEnabled: params.onToggleAllEnabled,
    onToggleAllMenu: params.onToggleAllMenu,
    onToggleSingleEnabled: params.onToggleSingleEnabled,
    onToggleSingleMenu: params.onToggleSingleMenu,
    onDebugLogEnabledChange: params.onDebugLogEnabledChange,
    onAutoPasteOnSelectChange: params.onAutoPasteOnSelectChange,
    onStartupDocProcessTabEnabledChange: params.onStartupDocProcessTabEnabledChange,
    onMouseGestureEnabledChange: params.onMouseGestureEnabledChange,
    onMouseGestureBindingsChange: params.onMouseGestureBindingsChange,
    onGestureRecordingChange: params.onGestureRecordingChange,
    onDynamicOutlineEnabledChange: params.onDynamicOutlineEnabledChange,
    onDynamicOutlineFollowKeyInfoChange: params.onDynamicOutlineFollowKeyInfoChange,
    onDynamicOutlineQuickSwitchEnabledChange: params.onDynamicOutlineQuickSwitchEnabledChange,
    onDynamicOutlineViewModesChange: params.onDynamicOutlineViewModesChange
  });
}

export type ApiSwitchSyncHandle = {
  dispose: () => void;
};

export function setupApiSwitchSync(params: {
  pluginName: string;
  pluginDisplayName: string;
  aiSummaryConfig: AiServiceConfig;
  onManagedConfigChange: (config: AiServiceConfig | null) => void;
}): ApiSwitchSyncHandle {
  const sync = (shared: any | null) => {
    if (shared) {
      params.onManagedConfigChange({
        enabled: true,
        baseUrl: shared.baseUrl,
        apiKey: shared.apiKey,
        model: shared.model,
        requestTimeoutSeconds: shared.requestTimeoutSeconds ?? 60,
        temperature: shared.temperature ?? 0.7,
        maxTokens: shared.maxTokens ?? 4096,
        headers: shared.headers,
        protocol: shared.protocol
      });
    } else {
      params.onManagedConfigChange(null);
    }
  };

  const local = {
    provider: "custom",
    baseUrl: params.aiSummaryConfig.baseUrl,
    apiKey: params.aiSummaryConfig.apiKey,
    model: params.aiSummaryConfig.model,
    requestTimeoutSeconds: params.aiSummaryConfig.requestTimeoutSeconds,
    temperature: params.aiSummaryConfig.temperature,
    maxTokens: params.aiSummaryConfig.maxTokens
  };

  let readyListener: (() => void) | undefined;
  if (window.siyuanApiSwitch) {
    window.siyuanApiSwitch.register(params.pluginName, params.pluginDisplayName, sync, local);
  } else {
    // Keep the listener reference so onunload can remove it; an orphaned
    // listener would register a dead plugin instance when api-switch loads later.
    readyListener = () => {
      if (window.siyuanApiSwitch) {
        window.siyuanApiSwitch.register(params.pluginName, params.pluginDisplayName, sync, local);
      }
    };
    window.addEventListener("siyuan-api-switch:ready", readyListener, { once: true });
  }

  return {
    dispose: () => {
      if (readyListener) {
        window.removeEventListener("siyuan-api-switch:ready", readyListener);
        readyListener = undefined;
      }
      if (window.siyuanApiSwitch) {
        window.siyuanApiSwitch.unregister(params.pluginName);
      }
    }
  };
}

export function shouldRunClipboardMonitor(params: {
  isMobile: boolean;
  state: Pick<PluginDocMenuState, "dynamicOutlineEnabled" | "dynamicOutlineViewModes">;
}): boolean {
  return (
    !params.isMobile &&
    params.state.dynamicOutlineEnabled &&
    params.state.dynamicOutlineViewModes.includes("clipboard")
  );
}

export function applyFloatingConfigPatch(
  prev: FloatingTextConfig,
  patch: Partial<FloatingTextConfig>
): FloatingTextConfig {
  return { ...prev, ...patch };
}
