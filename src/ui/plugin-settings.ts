import { Setting } from "siyuan";
import { AiServiceConfig } from "@/core/ai-service-config-core";
import { DynamicOutlineViewMode } from "@/core/dynamic-outline-core";
import {
  DocActionEnabledState,
  DocMenuRegistrationState
} from "@/core/doc-menu-registration-core";
import { HiddenPluginSettingKey } from "@/plugin/alpha-feature-config";
import { ActionConfig, ActionKey } from "@/plugin/actions";
import { DEFAULT_GESTURE_BINDINGS, GestureBindings } from "@/core/gesture-recognition-core";
import { createAiSettingsPanel } from "@/ui/plugin-settings-ai";
import { createDynamicOutlineSettingsPanel } from "@/ui/plugin-settings-dynamic-outline";
import { createGestureSettingsPanel } from "@/ui/plugin-settings-gesture";
import {
  installSettingHostNormalizer,
  SettingHostPanelConfig,
  SettingHostRowConfig
} from "@/ui/plugin-settings-host";
import { createMenuRegistrationPanel } from "@/ui/plugin-settings-menu";
import { createElement } from "@/ui/plugin-settings-shared";


type CreatePluginSettingsOptions = {
  actions: ActionConfig[];
  enabledState: DocActionEnabledState;
  registration: DocMenuRegistrationState;
  isMobile: boolean;
  aiSummaryConfig: AiServiceConfig;
  managedAiConfig: AiServiceConfig | null; // 添加被管家接管的配置
  debugLogEnabled: boolean;
  autoPasteOnSelect?: boolean;
  startupDocProcessTabEnabled?: boolean;
  mouseGestureEnabled?: boolean;
  mouseGestureBindings?: GestureBindings;
  dynamicOutlineEnabled?: boolean;
  dynamicOutlineFollowKeyInfo?: boolean;
  dynamicOutlineViewModes?: DynamicOutlineViewMode[];
  hiddenSettingKeys?: Iterable<HiddenPluginSettingKey>;
  onAiSummaryConfigChange: (config: AiServiceConfig) => Promise<void> | void;
  onToggleAllEnabled: (enabled: boolean) => Promise<void> | void;
  onToggleAllMenu: (enabled: boolean) => Promise<void> | void;
  onToggleSingleEnabled: (key: ActionKey, enabled: boolean) => Promise<void> | void;
  onToggleSingleMenu: (key: ActionKey, enabled: boolean) => Promise<void> | void;
  onDebugLogEnabledChange: (enabled: boolean) => Promise<void> | void;
  onAutoPasteOnSelectChange?: (enabled: boolean) => Promise<void> | void;
  onStartupDocProcessTabEnabledChange?: (enabled: boolean) => Promise<void> | void;
  onMouseGestureEnabledChange?: (enabled: boolean) => Promise<void> | void;
  onMouseGestureBindingsChange?: (bindings: GestureBindings) => Promise<void> | void;
  onGestureRecordingChange?: (recording: boolean) => void;
  onDynamicOutlineEnabledChange?: (enabled: boolean) => Promise<void> | void;
  onDynamicOutlineFollowKeyInfoChange?: (follow: boolean) => Promise<void> | void;
  onDynamicOutlineViewModesChange?: (modes: DynamicOutlineViewMode[]) => Promise<void> | void;
};

function applyManagedStyles(aiPanel: HTMLElement, managedConfig: any) {
  // 查找各个输入框并置灰
  const inputs = aiPanel.querySelectorAll("input, textarea, select");
  inputs.forEach((input) => {
    const key = (input as HTMLElement).dataset.settingKey;
    if (key === "ai-enabled") {
      return;
    }
    input.setAttribute("disabled", "true");
  });

  // 禁用密码眼睛切换按钮
  const toggleBtn = aiPanel.querySelector(".doc-assistant-settings__api-key-toggle");
  if (toggleBtn) {
    toggleBtn.setAttribute("disabled", "true");
  }

  // 插入提示条
  const tip = document.createElement("div");
  tip.className = "doc-assistant-settings__managed-tip";
  tip.style.cssText = `
    background-color: rgba(63, 81, 181, 0.08);
    border: 1px solid rgba(63, 81, 181, 0.2);
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 12px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--b3-theme-on-background);
  `;
  tip.innerHTML = `💡 通用 AI API 已由 <strong>API 旋钮 (siyuan-api-switch)</strong> 接管 (Profile: ${managedConfig.profileName || '未命名'})。如需修改，请前往 API 旋钮插件面板。`;

  // 插入到面板最上方
  aiPanel.insertBefore(tip, aiPanel.firstChild);
}

export function createPluginSettings(options: CreatePluginSettingsOptions) {
  const panelDestroyCallbacks: Array<() => void> = [];
  const setting = new Setting({
    width: "640px",
    destroyCallback: () => {
      panelDestroyCallbacks.forEach((callback) => callback());
    }
  });
  const hiddenSettingKeys = new Set(options.hiddenSettingKeys || []);
  const hostNormalizedPanels: SettingHostPanelConfig[] = [];
  const hostNormalizedRows: SettingHostRowConfig[] = [];

  if (options.onStartupDocProcessTabEnabledChange) {
    const startupDocProcessTabToggle = document.createElement("input");
    startupDocProcessTabToggle.className = "b3-switch fn__flex-center";
    startupDocProcessTabToggle.type = "checkbox";
    startupDocProcessTabToggle.checked = Boolean(options.startupDocProcessTabEnabled);
    startupDocProcessTabToggle.addEventListener("change", () => {
      options.onStartupDocProcessTabEnabledChange?.(startupDocProcessTabToggle.checked);
    });

    const startupControlWrap = createElement(
      "div",
      "doc-assistant-settings__startup-tab-control"
    );
    startupControlWrap.append(startupDocProcessTabToggle);
    const tooltip =
      "开启时打开侧栏默认显示“文档处理”页签，关闭时保持默认“关键内容”页签或上次选中页签。";

    setting.addItem({
      title: "启动显示“文档处理”页签",
      actionElement: startupControlWrap
    });
    hostNormalizedRows.push({
      element: startupControlWrap,
      tooltip
    });
  }

  if (options.onAutoPasteOnSelectChange && !hiddenSettingKeys.has("floating-text")) {
    const autoPasteToggle = document.createElement("input");
    autoPasteToggle.className = "b3-switch fn__flex-center";
    autoPasteToggle.type = "checkbox";
    autoPasteToggle.checked = Boolean(options.autoPasteOnSelect);
    autoPasteToggle.addEventListener("change", () => {
      options.onAutoPasteOnSelectChange?.(autoPasteToggle.checked);
    });

    const autoPasteControlWrap = createElement(
      "div",
      "doc-assistant-settings__autopaste-control"
    );
    autoPasteControlWrap.append(autoPasteToggle);
    const tooltip =
      "开启后，在悬浮窗搜索栏选择匹配文本后自动复制：若浮窗未钉住，浮窗自动缩小并在当前焦点输入框自动粘贴；若浮窗为钉住状态，则保持浮窗置顶并在短暂间隔后自动粘贴。关闭时仅复制到剪贴板，保持浮窗显示。";

    setting.addItem({
      title: "浮窗命中文本直接粘贴",
      actionElement: autoPasteControlWrap
    });
    hostNormalizedRows.push({
      element: autoPasteControlWrap,
      tooltip
    });
  }

  if (options.onDynamicOutlineEnabledChange && !hiddenSettingKeys.has("dynamic-outline")) {
    const dynamicOutlinePanel = createDynamicOutlineSettingsPanel({
      enabled: Boolean(options.dynamicOutlineEnabled),
      followKeyInfo: Boolean(options.dynamicOutlineFollowKeyInfo),
      viewModes: options.dynamicOutlineViewModes,
      isMobile: options.isMobile,
      onEnabledChange: options.onDynamicOutlineEnabledChange,
      onFollowKeyInfoChange: options.onDynamicOutlineFollowKeyInfoChange,
      onViewModesChange: options.onDynamicOutlineViewModesChange
    });

    setting.addItem({
      title: "灵动浮岛",
      direction: "row",
      actionElement: dynamicOutlinePanel
    });
    hostNormalizedPanels.push({
      element: dynamicOutlinePanel,
      tooltip:
        "在文档编辑区边缘提供可悬浮展开的多功能浮岛面板，集成文档大纲、已打开文档与系统剪贴板历史。"
    });
  }

  if (options.onMouseGestureEnabledChange && !hiddenSettingKeys.has("mouse-gesture")) {
    const gesturePanel = createGestureSettingsPanel({
      enabled: Boolean(options.mouseGestureEnabled),
      bindings: options.mouseGestureBindings || { ...DEFAULT_GESTURE_BINDINGS },
      onEnabledChange: options.onMouseGestureEnabledChange,
      onBindingsChange: (bindings) =>
        options.onMouseGestureBindingsChange?.(bindings),
      onRecordingStateChange: options.onGestureRecordingChange
    });

    setting.addItem({
      title: "鼠标手势",
      direction: "row",
      actionElement: gesturePanel.panel
    });
    hostNormalizedPanels.push({
      element: gesturePanel.panel,
      tooltip:
        "开启后可在文档编辑器中按住鼠标右键划动手势：← 切换上一个文档，→ 切换下一个文档，↓→ 关闭当前文档。手势可自定义，切换为移动式（打开目标文档并关闭当前标签页）。"
    });
    panelDestroyCallbacks.push(gesturePanel.destroy);
  }

  const menuRegistrationPanel = createMenuRegistrationPanel({
    actions: options.actions,
    enabledState: options.enabledState,
    registration: options.registration,
    isMobile: options.isMobile,
    onToggleAllEnabled: options.onToggleAllEnabled,
    onToggleAllMenu: options.onToggleAllMenu,
    onToggleSingleEnabled: options.onToggleSingleEnabled,
    onToggleSingleMenu: options.onToggleSingleMenu
  });
  setting.addItem({
    title: "启用命令",
    direction: "row",
    actionElement: menuRegistrationPanel
  });
  hostNormalizedPanels.push({
    element: menuRegistrationPanel,
    tooltip:
      "管理操作命令在侧面板“文档处理”中的显示及是否注册到文档标题菜单。只有已启用的命令才能注册到文档菜单。"
  });

  if (!hiddenSettingKeys.has("ai-service")) {
    // 渲染时，如果有接管配置，用接管配置来展示
    const effectiveConfig = options.managedAiConfig || options.aiSummaryConfig;
    const aiPanel = createAiSettingsPanel({
      aiSummaryConfig: effectiveConfig,
      onAiSummaryConfigChange: options.onAiSummaryConfigChange
    });

    if (options.managedAiConfig) {
      applyManagedStyles(aiPanel, options.managedAiConfig);
    }

    setting.addItem({
      title: "AI 服务",
      direction: "row",
      actionElement: aiPanel
    });
    hostNormalizedPanels.push({
      element: aiPanel,
      tooltip: "配置兼容 OpenAI API 的服务，用于生成文档摘要和标记口水内容。"
    });
  }

  if (options.onDebugLogEnabledChange && !hiddenSettingKeys.has("debug-mode")) {
    const debugLogToggle = document.createElement("input");
    debugLogToggle.className = "b3-switch fn__flex-center";
    debugLogToggle.type = "checkbox";
    debugLogToggle.checked = options.debugLogEnabled;
    debugLogToggle.addEventListener("change", () => {
      options.onDebugLogEnabledChange?.(debugLogToggle.checked);
    });

    const debugControlWrap = createElement(
      "div",
      "doc-assistant-settings__debug-control"
    );
    debugControlWrap.append(debugLogToggle);
    const tooltip =
      "开启后，会在控制台打印插件执行操作时的 transaction 明细日志，方便定位撤销/重做失效等问题。";

    setting.addItem({
      title: "调试模式",
      actionElement: debugControlWrap
    });
    hostNormalizedRows.push({
      element: debugControlWrap,
      tooltip
    });
  }

  installSettingHostNormalizer(setting, hostNormalizedPanels, hostNormalizedRows);

  // 注入 updateManagedConfig 方法供外部实时同步。
  // SiYuan Setting 实例的面板 DOM 挂在其 dialog.element 上（无 element 属性）。
  (setting as any).updateManagedConfig = (managed: any | null) => {
    const el = (setting as any).dialog?.element as HTMLElement | undefined;
    if (!el) return;

    const aiPanel = el.querySelector(".doc-assistant-settings__ai-panel") as HTMLElement;
    if (!aiPanel) return;

    // 清理可能存在的提示条
    const existingTip = aiPanel.querySelector(".doc-assistant-settings__managed-tip");
    if (existingTip) {
      existingTip.remove();
    }

    // 启用所有输入框
    const inputs = aiPanel.querySelectorAll("input, textarea, select");
    inputs.forEach((input) => {
      input.removeAttribute("disabled");
    });
    const toggleBtn = aiPanel.querySelector(".doc-assistant-settings__api-key-toggle");
    if (toggleBtn) {
      toggleBtn.removeAttribute("disabled");
    }

    if (managed) {
      // 覆盖值
      const baseUrlInput = aiPanel.querySelector('[data-setting-key="ai-base-url"]') as HTMLInputElement;
      if (baseUrlInput) baseUrlInput.value = managed.baseUrl;
      const apiKeyInput = aiPanel.querySelector('[data-setting-key="ai-api-key"]') as HTMLInputElement;
      if (apiKeyInput) apiKeyInput.value = managed.apiKey;
      const modelInput = aiPanel.querySelector('[data-setting-key="ai-model"]') as HTMLInputElement;
      if (modelInput) modelInput.value = managed.model;
      const timeoutInput = aiPanel.querySelector('[data-setting-key="ai-timeout-seconds"]') as HTMLInputElement;
      if (timeoutInput) timeoutInput.value = String(managed.requestTimeoutSeconds);
      const tempInput = aiPanel.querySelector('[data-setting-key="ai-temperature"]') as HTMLInputElement;
      if (tempInput) tempInput.value = String(managed.temperature);
      const tokensInput = aiPanel.querySelector('[data-setting-key="ai-max-tokens"]') as HTMLInputElement;
      if (tokensInput) tokensInput.value = String(managed.maxTokens);

      applyManagedStyles(aiPanel, managed);
    } else {
      // 恢复为本地配置
      const local = options.aiSummaryConfig;
      const baseUrlInput = aiPanel.querySelector('[data-setting-key="ai-base-url"]') as HTMLInputElement;
      if (baseUrlInput) baseUrlInput.value = local.baseUrl;
      const apiKeyInput = aiPanel.querySelector('[data-setting-key="ai-api-key"]') as HTMLInputElement;
      if (apiKeyInput) apiKeyInput.value = local.apiKey;
      const modelInput = aiPanel.querySelector('[data-setting-key="ai-model"]') as HTMLInputElement;
      if (modelInput) modelInput.value = local.model;
      const timeoutInput = aiPanel.querySelector('[data-setting-key="ai-timeout-seconds"]') as HTMLInputElement;
      if (timeoutInput) timeoutInput.value = String(local.requestTimeoutSeconds);
      const tempInput = aiPanel.querySelector('[data-setting-key="ai-temperature"]') as HTMLInputElement;
      if (tempInput) tempInput.value = String(local.temperature);
      const tokensInput = aiPanel.querySelector('[data-setting-key="ai-max-tokens"]') as HTMLInputElement;
      if (tokensInput) tokensInput.value = String(local.maxTokens);
    }
  };

  return setting;
}
