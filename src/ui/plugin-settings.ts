import { Setting } from "siyuan";
import { AiServiceConfig } from "@/core/ai-service-config-core";
import { DocMenuRegistrationState } from "@/core/doc-menu-registration-core";
import { ActionConfig, ActionKey } from "@/plugin/actions";
import { createAiSettingsPanel } from "@/ui/plugin-settings-ai";
import { createMonthlyDiarySettingsPanel } from "@/ui/plugin-settings-diary";
import { installSettingHostNormalizer } from "@/ui/plugin-settings-host";
import { createMenuRegistrationPanel } from "@/ui/plugin-settings-menu";
import { createCheckbox } from "@/ui/plugin-settings-shared";

type CreatePluginSettingsOptions = {
  actions: ActionConfig[];
  registration: DocMenuRegistrationState;
  isMobile: boolean;
  keepNewDocAfterPinnedTabs: boolean;
  aiSummaryConfig: AiServiceConfig;
  monthlyDiaryTemplate: string;
  onAiSummaryConfigChange: (config: AiServiceConfig) => Promise<void> | void;
  onMonthlyDiaryTemplateChange: (template: string) => Promise<void> | void;
  onToggleKeepNewDocAfterPinnedTabs: (enabled: boolean) => Promise<void> | void;
  onToggleAll: (enabled: boolean) => Promise<void> | void;
  onToggleSingle: (key: ActionKey, enabled: boolean) => Promise<void> | void;
};

export function createPluginSettings(options: CreatePluginSettingsOptions) {
  const setting = new Setting({ width: "640px" });

  const moveAfterPinnedSwitch = createCheckbox({
    checked: options.keepNewDocAfterPinnedTabs,
    onChange: async (checked) => {
      await options.onToggleKeepNewDocAfterPinnedTabs(checked);
    },
  });

  setting.addItem({
    title: "钉住页签始终保持可见",
    description: "桌面端开启后，打开新文档时会自动调整页签栏视野，尽量保持钉住页签始终可见。",
    actionElement: moveAfterPinnedSwitch,
  });

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

  const diaryPanel = createMonthlyDiarySettingsPanel({
    template: options.monthlyDiaryTemplate,
    onTemplateChange: options.onMonthlyDiaryTemplateChange,
  });
  setting.addItem({
    title: "本月日记模板",
    direction: "column",
    description: "定义单日模板，创建本月日记时会自动按当前月份逐日展开。",
    actionElement: diaryPanel,
  });

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

  installSettingHostNormalizer(setting, [aiPanel, diaryPanel, menuRegistrationPanel]);

  return setting;
}
