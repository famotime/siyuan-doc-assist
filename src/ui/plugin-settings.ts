import { Setting } from "siyuan";
import { AiServiceConfig } from "@/core/ai-service-config-core";
import {
  DocActionEnabledState,
  DocMenuRegistrationState,
} from "@/core/doc-menu-registration-core";
import { HiddenPluginSettingKey } from "@/plugin/alpha-feature-config";
import { ActionConfig, ActionKey } from "@/plugin/actions";
import { createAiSettingsPanel } from "@/ui/plugin-settings-ai";
import { installSettingHostNormalizer } from "@/ui/plugin-settings-host";
import { createMenuRegistrationPanel } from "@/ui/plugin-settings-menu";
import { createFloatingSettingsPanel } from "@/ui/plugin-settings-floating";
import { loadFloatingTextConfig, saveFloatingTextConfig } from "@/services/floating-text/floating-text-storage";

type CreatePluginSettingsOptions = {
  actions: ActionConfig[];
  enabledState: DocActionEnabledState;
  registration: DocMenuRegistrationState;
  isMobile: boolean;
  aiSummaryConfig: AiServiceConfig;
  managedAiConfig: AiServiceConfig | null; // 添加被管家接管的配置
  debugLogEnabled: boolean;
  hiddenSettingKeys?: Iterable<HiddenPluginSettingKey>;
  onAiSummaryConfigChange: (config: AiServiceConfig) => Promise<void> | void;
  onToggleAllEnabled: (enabled: boolean) => Promise<void> | void;
  onToggleAllMenu: (enabled: boolean) => Promise<void> | void;
  onToggleSingleEnabled: (key: ActionKey, enabled: boolean) => Promise<void> | void;
  onToggleSingleMenu: (key: ActionKey, enabled: boolean) => Promise<void> | void;
  onDebugLogEnabledChange: (enabled: boolean) => Promise<void> | void;
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
  const setting = new Setting({ width: "640px" });
  const hiddenSettingKeys = new Set(options.hiddenSettingKeys || []);
  const hostNormalizedPanels: HTMLElement[] = [];

  if (!hiddenSettingKeys.has("ai-service")) {
    // 渲染时，如果有接管配置，用接管配置来展示
    const effectiveConfig = options.managedAiConfig || options.aiSummaryConfig;
    const aiPanel = createAiSettingsPanel({
      aiSummaryConfig: effectiveConfig,
      onAiSummaryConfigChange: options.onAiSummaryConfigChange,
    });

    if (options.managedAiConfig) {
      applyManagedStyles(aiPanel, options.managedAiConfig);
    }

    setting.addItem({
      title: "AI 服务",
      direction: "column",
      description: "配置兼容 OpenAI API 的服务，用于生成文档摘要和标记口水内容。",
      actionElement: aiPanel,
    });
    hostNormalizedPanels.push(aiPanel);
  }

  const menuRegistrationPanel = createMenuRegistrationPanel({
    actions: options.actions,
    enabledState: options.enabledState,
    registration: options.registration,
    isMobile: options.isMobile,
    onToggleAllEnabled: options.onToggleAllEnabled,
    onToggleAllMenu: options.onToggleAllMenu,
    onToggleSingleEnabled: options.onToggleSingleEnabled,
    onToggleSingleMenu: options.onToggleSingleMenu,
  });
  setting.addItem({
    title: "启用命令",
    direction: "column",
    description:
      "管理操作命令在侧面板“文档处理”中的显示及是否注册到文档标题菜单。只有已启用的命令才能注册到文档菜单。",
    actionElement: menuRegistrationPanel,
  });
  hostNormalizedPanels.push(menuRegistrationPanel);

  if (options.onDebugLogEnabledChange && !hiddenSettingKeys.has("debug-mode")) {
    const debugLogToggle = document.createElement("input");
    debugLogToggle.className = "b3-switch fn__flex-center";
    debugLogToggle.type = "checkbox";
    debugLogToggle.checked = options.debugLogEnabled;
    debugLogToggle.addEventListener("change", () => {
      options.onDebugLogEnabledChange?.(debugLogToggle.checked);
    });
    
    setting.addItem({
      title: "调试模式",
      direction: "row",
      description: "开启后，会在控制台打印插件执行操作时的 transaction 明细日志，方便定位撤销/重做失效等问题。",
      actionElement: debugLogToggle,
    });
  }

  if (!hiddenSettingKeys.has("floating-text")) {
    const floatingPanel = createFloatingSettingsPanel({
      floatingConfig: loadFloatingTextConfig(),
      onFloatingConfigChange: (cfg) => {
        saveFloatingTextConfig(cfg);
      },
    });
    setting.addItem({
      title: "悬浮文本",
      direction: "column",
      description: "配置桌面置顶悬浮文本窗口的默认不透明度、初始字号、视图模式与记忆行为。",
      actionElement: floatingPanel,
    });
    hostNormalizedPanels.push(floatingPanel);
  }

  installSettingHostNormalizer(setting, hostNormalizedPanels);

  // 注入 updateManagedConfig 方法供外部实时同步
  (setting as any).updateManagedConfig = (managed: any | null) => {
    const el = (setting as any).element as HTMLElement | undefined;
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
