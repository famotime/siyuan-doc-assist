import { Setting } from "siyuan";
import { AiServiceConfig } from "@/core/ai-service-config-core";
import { DocMenuRegistrationState } from "@/core/doc-menu-registration-core";
import { HiddenPluginSettingKey } from "@/plugin/alpha-feature-config";
import { ActionConfig, ActionKey } from "@/plugin/actions";
import { createAiSettingsPanel } from "@/ui/plugin-settings-ai";
import { installSettingHostNormalizer } from "@/ui/plugin-settings-host";
import { createMenuRegistrationPanel } from "@/ui/plugin-settings-menu";
type CreatePluginSettingsOptions = {
  actions: ActionConfig[];
  registration: DocMenuRegistrationState;
  isMobile: boolean;
  aiSummaryConfig: AiServiceConfig;
  hiddenSettingKeys?: Iterable<HiddenPluginSettingKey>;
  onAiSummaryConfigChange: (config: AiServiceConfig) => Promise<void> | void;
  onToggleAll: (enabled: boolean) => Promise<void> | void;
  onToggleSingle: (key: ActionKey, enabled: boolean) => Promise<void> | void;
};

export function createPluginSettings(options: CreatePluginSettingsOptions) {
  const setting = new Setting({ width: "640px" });
  const hiddenSettingKeys = new Set(options.hiddenSettingKeys || []);
  const hostNormalizedPanels: HTMLElement[] = [];

  if (!hiddenSettingKeys.has("ai-service")) {
    const aiPanel = createAiSettingsPanel({
      aiSummaryConfig: options.aiSummaryConfig,
      onAiSummaryConfigChange: options.onAiSummaryConfigChange,
    });
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
    registration: options.registration,
    isMobile: options.isMobile,
    onToggleAll: options.onToggleAll,
    onToggleSingle: options.onToggleSingle,
  });
  setting.addItem({
    title: "注册命令到文档菜单",
    direction: "column",
    description: "默认全部关闭。开启后会把对应命令加入文档标题菜单，可按分组集中管理。",
    actionElement: menuRegistrationPanel,
  });
  hostNormalizedPanels.push(menuRegistrationPanel);

  installSettingHostNormalizer(setting, hostNormalizedPanels);

  return setting;
}
