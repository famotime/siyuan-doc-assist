import {
  AiServiceConfig,
  DEFAULT_AI_MAX_TOKENS,
  DEFAULT_AI_TEMPERATURE,
  normalizeAiServiceConfig,
} from "@/core/ai-service-config-core";
import {
  isDocAssistantDebugEnabled,
  setDocAssistantDebugEnabled,
} from "@/core/logger-core";
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
    timeoutInput: HTMLInputElement,
    temperatureInput: HTMLInputElement,
    maxTokensInput: HTMLInputElement,
  ) => {
    enabledInput.checked = aiConfig.enabled;
    baseUrlInput.value = aiConfig.baseUrl;
    apiKeyInput.value = aiConfig.apiKey;
    modelInput.value = aiConfig.model;
    timeoutInput.value = String(aiConfig.requestTimeoutSeconds);
    temperatureInput.value = String(aiConfig.temperature);
    maxTokensInput.value = String(aiConfig.maxTokens);
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
        aiTimeoutInput,
        aiTemperatureInput,
        aiMaxTokensInput,
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
        aiTimeoutInput,
        aiTemperatureInput,
        aiMaxTokensInput,
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
        aiTimeoutInput,
        aiTemperatureInput,
        aiMaxTokensInput,
      );
      await options.onAiSummaryConfigChange({ ...aiConfig });
    },
  });
  aiApiKeyInput.classList.add("doc-assistant-settings__api-key-input");

  const eyeOpenSvg = `<svg class="doc-assistant-settings__api-key-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/><circle cx="12" cy="12" r="3.25" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;
  const eyeOffSvg = `<svg class="doc-assistant-settings__api-key-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/><path d="M10.7 5.52A10.56 10.56 0 0 1 12 5.25c6 0 9.75 6.75 9.75 6.75a18.78 18.78 0 0 1-4.02 4.85M6.68 6.69C4.04 8.42 2.25 12 2.25 12s3.75 6.75 9.75 6.75c1.85 0 3.47-.64 4.85-1.55M9.88 9.88A3 3 0 0 0 9 12a3 3 0 0 0 3 3c.8 0 1.53-.31 2.07-.82" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>`;

  let isApiKeyVisible = false;
  const apiKeyToggleBtn = createElement("button", "doc-assistant-settings__api-key-toggle");
  apiKeyToggleBtn.type = "button";
  apiKeyToggleBtn.innerHTML = eyeOpenSvg;
  apiKeyToggleBtn.title = "显示 API Key";
  apiKeyToggleBtn.setAttribute("aria-label", "显示 API Key");
  apiKeyToggleBtn.addEventListener("click", (event) => {
    event.preventDefault();
    isApiKeyVisible = !isApiKeyVisible;
    aiApiKeyInput.type = isApiKeyVisible ? "text" : "password";
    apiKeyToggleBtn.innerHTML = isApiKeyVisible ? eyeOffSvg : eyeOpenSvg;
    apiKeyToggleBtn.title = isApiKeyVisible ? "隐藏 API Key" : "显示 API Key";
    apiKeyToggleBtn.setAttribute(
      "aria-label",
      isApiKeyVisible ? "隐藏 API Key" : "显示 API Key"
    );
  });

  const apiKeyFieldWrap = createElement("div", "doc-assistant-settings__api-key-wrap");
  apiKeyFieldWrap.append(aiApiKeyInput, apiKeyToggleBtn);

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
        aiTimeoutInput,
        aiTemperatureInput,
        aiMaxTokensInput,
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
        aiTimeoutInput,
        aiTemperatureInput,
        aiMaxTokensInput,
      );
      await options.onAiSummaryConfigChange({ ...aiConfig });
    },
  });

  const aiTemperatureInput = createTextInput({
    type: "number",
    value: String(aiConfig.temperature),
    dataSettingKey: "ai-temperature",
    inputMode: "decimal",
    onChange: async (value) => {
      Object.assign(aiConfig, normalizeAiServiceConfig({
        ...aiConfig,
        temperature: value,
      }));
      syncAiInputs(
        aiEnabledInput,
        aiBaseUrlInput,
        aiApiKeyInput,
        aiModelInput,
        aiTimeoutInput,
        aiTemperatureInput,
        aiMaxTokensInput,
      );
      await options.onAiSummaryConfigChange({ ...aiConfig });
    },
  });

  const aiMaxTokensInput = createTextInput({
    type: "number",
    value: String(aiConfig.maxTokens),
    dataSettingKey: "ai-max-tokens",
    inputMode: "numeric",
    onChange: async (value) => {
      Object.assign(aiConfig, normalizeAiServiceConfig({
        ...aiConfig,
        maxTokens: value,
      }));
      syncAiInputs(
        aiEnabledInput,
        aiBaseUrlInput,
        aiApiKeyInput,
        aiModelInput,
        aiTimeoutInput,
        aiTemperatureInput,
        aiMaxTokensInput,
      );
      await options.onAiSummaryConfigChange({ ...aiConfig });
    },
  });

  const panel = createElement(
    "div",
    "doc-assistant-settings__ai-panel doc-assistant-settings__section-card"
  );
  const switchRow = createElement("div", "doc-assistant-settings__ai-switch");
  const switchText = createElement("div", "doc-assistant-settings__ai-switch-text");
  switchText.append(
    createElement("div", "doc-assistant-settings__ai-switch-title", "启用 AI 文档功能"),
    createElement(
      "div",
      "doc-assistant-settings__ai-switch-hint",
      "发送当前文档内容到 AI，可用于生成摘要、概念地图（含关联文档），或筛选应加删除线的口水段落。"
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
      input: apiKeyFieldWrap,
    }),
    createFieldRow({
      label: "Model",
      input: aiModelInput,
    }),
    createFieldRow({
      label: "超时时间（秒）",
      input: aiTimeoutInput,
    }),
    createFieldRow({
      label: "Temperature",
      hint: `控制输出的随机性，范围 0-2，默认 ${DEFAULT_AI_TEMPERATURE}。值越小越确定，值越大越发散。`,
      input: aiTemperatureInput,
    }),
    createFieldRow({
      label: "Max Tokens",
      hint: `最大输出 token 数量，默认 ${DEFAULT_AI_MAX_TOKENS}。`,
      input: aiMaxTokensInput,
    })
  );

  const aiDebugInput = createCheckbox({
    checked: isDocAssistantDebugEnabled(),
    title: "启用 AI 日志",
    onChange: (checked) => {
      setDocAssistantDebugEnabled(checked);
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem("doc-assistant.debug", checked ? "true" : "false");
        }
      } catch {
        // ignore
      }
    },
  });
  aiDebugInput.dataset.settingKey = "ai-debug";

  const debugFieldRow = createFieldRow({
    label: "AI 日志",
    hint: "打开后会在浏览器控制台输出 AI 服务的请求和响应日志，用于故障分析定位。",
    input: aiDebugInput,
  });
  debugFieldRow.classList.add("doc-assistant-settings__ai-debug-row");
  fields.append(debugFieldRow);

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
