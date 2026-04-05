import {
  AiServiceConfig,
  normalizeAiServiceConfig,
} from "@/core/ai-service-config-core";
import {
  createCheckbox,
  createCollapseButton,
  createElement,
  createFieldRow,
  createTextInput,
} from "@/ui/plugin-settings-shared";

type CreateAiSettingsPanelOptions = {
  aiSummaryConfig: AiServiceConfig;
  onAiSummaryConfigChange: (config: AiServiceConfig) => Promise<void> | void;
};

export function createAiSettingsPanel(
  options: CreateAiSettingsPanelOptions
): HTMLDivElement {
  const aiConfig = normalizeAiServiceConfig(options.aiSummaryConfig);

  const syncAiInputs = (
    enabledInput: HTMLInputElement,
    baseUrlInput: HTMLInputElement,
    apiKeyInput: HTMLInputElement,
    modelInput: HTMLInputElement,
    timeoutInput: HTMLInputElement
  ) => {
    enabledInput.checked = aiConfig.enabled;
    baseUrlInput.value = aiConfig.baseUrl;
    apiKeyInput.value = aiConfig.apiKey;
    modelInput.value = aiConfig.model;
    timeoutInput.value = String(aiConfig.requestTimeoutSeconds);
  };

  const aiEnabledInput = createCheckbox({
    checked: aiConfig.enabled,
    title: "启用 AI 文档功能",
    onChange: async (checked) => {
      Object.assign(aiConfig, normalizeAiServiceConfig({
        ...aiConfig,
        enabled: checked,
      }));
      syncAiInputs(
        aiEnabledInput,
        aiBaseUrlInput,
        aiApiKeyInput,
        aiModelInput,
        aiTimeoutInput
      );
      await options.onAiSummaryConfigChange({ ...aiConfig });
    },
  });
  aiEnabledInput.dataset.settingKey = "ai-enabled";

  const aiBaseUrlInput = createTextInput({
    value: aiConfig.baseUrl,
    placeholder: "https://api.openai.com/v1",
    dataSettingKey: "ai-base-url",
    onChange: async (value) => {
      Object.assign(aiConfig, normalizeAiServiceConfig({
        ...aiConfig,
        baseUrl: value,
      }));
      syncAiInputs(
        aiEnabledInput,
        aiBaseUrlInput,
        aiApiKeyInput,
        aiModelInput,
        aiTimeoutInput
      );
      await options.onAiSummaryConfigChange({ ...aiConfig });
    },
  });

  const aiApiKeyInput = createTextInput({
    type: "password",
    value: aiConfig.apiKey,
    placeholder: "sk-...",
    dataSettingKey: "ai-api-key",
    onChange: async (value) => {
      Object.assign(aiConfig, normalizeAiServiceConfig({
        ...aiConfig,
        apiKey: value,
      }));
      syncAiInputs(
        aiEnabledInput,
        aiBaseUrlInput,
        aiApiKeyInput,
        aiModelInput,
        aiTimeoutInput
      );
      await options.onAiSummaryConfigChange({ ...aiConfig });
    },
  });

  const aiModelInput = createTextInput({
    value: aiConfig.model,
    placeholder: "gpt-4.1-mini",
    dataSettingKey: "ai-model",
    onChange: async (value) => {
      Object.assign(aiConfig, normalizeAiServiceConfig({
        ...aiConfig,
        model: value,
      }));
      syncAiInputs(
        aiEnabledInput,
        aiBaseUrlInput,
        aiApiKeyInput,
        aiModelInput,
        aiTimeoutInput
      );
      await options.onAiSummaryConfigChange({ ...aiConfig });
    },
  });

  const aiTimeoutInput = createTextInput({
    type: "number",
    value: String(aiConfig.requestTimeoutSeconds),
    dataSettingKey: "ai-timeout-seconds",
    inputMode: "numeric",
    onChange: async (value) => {
      Object.assign(aiConfig, normalizeAiServiceConfig({
        ...aiConfig,
        requestTimeoutSeconds: value,
      }));
      syncAiInputs(
        aiEnabledInput,
        aiBaseUrlInput,
        aiApiKeyInput,
        aiModelInput,
        aiTimeoutInput
      );
      await options.onAiSummaryConfigChange({ ...aiConfig });
    },
  });

  const panel = createElement("div", "doc-assistant-settings__ai-panel");
  const switchRow = createElement("div", "doc-assistant-settings__ai-switch");
  const switchText = createElement("div", "doc-assistant-settings__ai-switch-text");
  switchText.append(
    createElement("div", "doc-assistant-settings__ai-switch-title", "启用 AI 文档功能"),
    createElement(
      "div",
      "doc-assistant-settings__ai-switch-hint",
      "发送当前文档内容到 AI，可用于生成摘要、概念地图，或筛选应加删除线的口水段落。"
    )
  );

  const fields = createElement("div", "doc-assistant-settings__ai-fields");
  fields.dataset.settingSection = "ai-fields";
  fields.append(
    createFieldRow({
      label: "Base URL",
      hint: "通常需要填写到 /v1，例如 https://api.openai.com/v1",
      input: aiBaseUrlInput,
    }),
    createFieldRow({
      label: "API Key",
      input: aiApiKeyInput,
    }),
    createFieldRow({
      label: "Model",
      input: aiModelInput,
    }),
    createFieldRow({
      label: "超时时间（秒）",
      input: aiTimeoutInput,
    })
  );

  const controls = createElement("div", "doc-assistant-settings__section-controls");
  controls.append(
    aiEnabledInput,
    createCollapseButton({
      key: "ai-fields",
      label: "AI 服务设置",
      content: fields,
    })
  );

  switchRow.append(switchText, controls);
  panel.append(switchRow, fields);
  return panel;
}
