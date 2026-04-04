import { Setting } from "siyuan";
import {
  AiServiceConfig,
  normalizeAiServiceConfig,
} from "@/core/ai-service-config-core";
import { buildDockDocActions } from "@/core/dock-panel-core";
import {
  DocMenuRegistrationState,
  isAllDocMenuRegistrationEnabled,
} from "@/core/doc-menu-registration-core";
import { ActionConfig, ActionKey } from "@/plugin/actions";

type CreatePluginSettingsOptions = {
  actions: ActionConfig[];
  registration: DocMenuRegistrationState;
  isMobile: boolean;
  keepNewDocAfterPinnedTabs: boolean;
  aiSummaryConfig: AiServiceConfig;
  onAiSummaryConfigChange: (config: AiServiceConfig) => Promise<void> | void;
  onToggleKeepNewDocAfterPinnedTabs: (enabled: boolean) => Promise<void> | void;
  onToggleAll: (enabled: boolean) => Promise<void> | void;
  onToggleSingle: (key: ActionKey, enabled: boolean) => Promise<void> | void;
};

function createCheckbox(options: {
  checked: boolean;
  disabled?: boolean;
  title?: string;
  onChange: (checked: boolean) => Promise<void> | void;
}): HTMLInputElement {
  const checkbox = document.createElement("input");
  checkbox.className = "b3-switch fn__flex-center";
  checkbox.type = "checkbox";
  checkbox.checked = options.checked;
  checkbox.disabled = Boolean(options.disabled);
  if (options.title) {
    checkbox.title = options.title;
    checkbox.setAttribute("aria-label", options.title);
  }
  checkbox.addEventListener("change", () => {
    void options.onChange(checkbox.checked);
  });
  return checkbox;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  textContent?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (typeof textContent === "string") {
    element.textContent = textContent;
  }
  return element;
}

function createTextInput(options: {
  type?: "text" | "password" | "number";
  value: string;
  placeholder?: string;
  inputMode?: string;
  dataSettingKey: string;
  onChange: (value: string) => Promise<void> | void;
}): HTMLInputElement {
  const input = document.createElement("input");
  input.className = "b3-text-field";
  input.type = options.type || "text";
  input.value = options.value;
  input.dataset.settingKey = options.dataSettingKey;
  if (options.placeholder) {
    input.placeholder = options.placeholder;
  }
  if (options.inputMode) {
    input.inputMode = options.inputMode as any;
  }
  input.addEventListener("change", () => {
    void options.onChange(input.value);
  });
  return input;
}

function createFieldRow(options: {
  label: string;
  hint?: string;
  input: HTMLElement;
}): HTMLLabelElement {
  const field = createElement("label", "doc-assistant-settings__ai-field");
  const textWrap = createElement("div", "doc-assistant-settings__ai-field-text");
  textWrap.append(
    createElement("div", "doc-assistant-settings__ai-field-label", options.label)
  );
  if (options.hint) {
    textWrap.append(
      createElement("div", "doc-assistant-settings__ai-field-hint", options.hint)
    );
  }
  field.append(textWrap, options.input);
  return field;
}

function createCollapseButton(options: {
  key: string;
  label: string;
  content: HTMLElement;
  expanded?: boolean;
}): HTMLButtonElement {
  const button = document.createElement("button");
  const text = createElement("span", "doc-assistant-settings__collapse-button-label");
  const icon = createElement("span", "doc-assistant-settings__collapse-button-icon");
  let expanded = options.expanded ?? true;

  button.type = "button";
  button.className = "doc-assistant-settings__collapse-button";
  button.dataset.settingCollapse = options.key;
  button.append(text, icon);

  const sync = () => {
    options.content.hidden = !expanded;
    button.classList.toggle("is-collapsed", !expanded);
    button.setAttribute("aria-expanded", String(expanded));
    button.setAttribute("aria-label", `${expanded ? "折叠" : "展开"}${options.label}`);
    button.title = `${expanded ? "折叠" : "展开"}${options.label}`;
    text.textContent = expanded ? "收起" : "展开";
    icon.textContent = expanded ? "▾" : "▸";
  };

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    expanded = !expanded;
    sync();
  });

  sync();
  return button;
}

function normalizeSettingPanelHost(panel: HTMLElement | null): void {
  if (!panel) {
    return;
  }

  const itemWrap = panel.parentElement;
  const titleWrap = itemWrap?.querySelector(":scope > .fn__flex-1");
  const spacer = itemWrap?.querySelector(":scope > .fn__space");

  panel.classList.remove("fn__flex-center", "fn__size200");
  panel.style.width = "100%";
  panel.style.height = "auto";
  panel.style.minHeight = "0";
  panel.style.flex = "none";
  panel.style.alignSelf = "stretch";

  if (itemWrap instanceof HTMLElement) {
    itemWrap.classList.add("doc-assistant-settings__host-item");
    itemWrap.style.height = "auto";
    itemWrap.style.minHeight = "0";
    itemWrap.style.alignItems = "start";
  }

  if (titleWrap instanceof HTMLElement) {
    titleWrap.classList.add("doc-assistant-settings__host-title");
    titleWrap.style.overflow = "visible";
    titleWrap.style.minHeight = "0";
  }

  if (spacer instanceof HTMLElement) {
    spacer.classList.add("doc-assistant-settings__host-space");
  }
}

type MenuRegistrationGroup = {
  key: string;
  label: string;
  actions: ReturnType<typeof buildDockDocActions<ActionKey>>;
};

function buildMenuRegistrationGroups(
  actions: ActionConfig[],
  isMobile: boolean,
  registration: DocMenuRegistrationState
): MenuRegistrationGroup[] {
  const menuActions = buildDockDocActions(actions, isMobile, registration);
  const groups: MenuRegistrationGroup[] = [];
  menuActions.forEach((action) => {
    const existing = groups.find((group) => group.key === action.group);
    if (existing) {
      existing.actions.push(action);
      return;
    }
    groups.push({
      key: action.group,
      label: action.groupLabel,
      actions: [action],
    });
  });
  return groups;
}

export function createPluginSettings(
  options: CreatePluginSettingsOptions
) {
  const {
    actions,
    registration,
    isMobile,
    keepNewDocAfterPinnedTabs,
    aiSummaryConfig,
    onAiSummaryConfigChange,
    onToggleKeepNewDocAfterPinnedTabs,
    onToggleAll,
    onToggleSingle,
  } = options;
  const state: DocMenuRegistrationState = { ...registration };
  const aiConfig = normalizeAiServiceConfig(aiSummaryConfig);
  const actionSwitches = new Map<ActionKey, HTMLInputElement>();
  const totalActionCount = Object.keys(state).length;
  const setting = new Setting({ width: "640px" });
  let aiPanel: HTMLDivElement | null = null;
  let menuRegistrationPanel: HTMLDivElement | null = null;
  const enabledSummary = createElement(
    "div",
    "doc-assistant-settings__menu-registration-summary-meta"
  );
  const syncEnabledSummary = () => {
    const enabledCount = Object.values(state).filter((enabled) => enabled === true).length;
    enabledSummary.textContent = `加入文档标题菜单 · 已启用 ${enabledCount}/${totalActionCount} 项`;
  };
  const syncAllSwitch = (allSwitch: HTMLInputElement) => {
    allSwitch.checked = isAllDocMenuRegistrationEnabled(state);
    syncEnabledSummary();
  };
  const syncActionSwitches = () => {
    actionSwitches.forEach((checkbox, key) => {
      checkbox.checked = state[key] === true;
    });
    syncEnabledSummary();
  };

  const allSwitch = createCheckbox({
    checked: isAllDocMenuRegistrationEnabled(state),
    title: "全部启用文档标题菜单命令",
    onChange: async (checked) => {
      for (const key of Object.keys(state) as ActionKey[]) {
        state[key] = checked;
      }
      syncActionSwitches();
      syncAllSwitch(allSwitch);
      await onToggleAll(checked);
    },
  });

  const moveAfterPinnedSwitch = createCheckbox({
    checked: keepNewDocAfterPinnedTabs,
    onChange: async (checked) => {
      await onToggleKeepNewDocAfterPinnedTabs(checked);
    },
  });

  setting.addItem({
    title: "钉住页签始终保持可见",
    description: "桌面端开启后，打开新文档时会自动调整页签栏视野，尽量保持钉住页签始终可见。",
    actionElement: moveAfterPinnedSwitch,
  });

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
      await onAiSummaryConfigChange({ ...aiConfig });
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
      await onAiSummaryConfigChange({ ...aiConfig });
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
      await onAiSummaryConfigChange({ ...aiConfig });
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
      await onAiSummaryConfigChange({ ...aiConfig });
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
      await onAiSummaryConfigChange({ ...aiConfig });
    },
  });

  setting.addItem({
    title: "AI 服务",
    direction: "column",
    description: "配置兼容 OpenAI API 的服务，用于生成文档摘要和标记口水内容。",
    actionElement: (() => {
      const panel = createElement("div", "doc-assistant-settings__ai-panel");
      aiPanel = panel;
      const switchRow = createElement("div", "doc-assistant-settings__ai-switch");
      const switchText = createElement("div", "doc-assistant-settings__ai-switch-text");
      switchText.append(
        createElement("div", "doc-assistant-settings__ai-switch-title", "启用 AI 文档功能"),
        createElement(
          "div",
          "doc-assistant-settings__ai-switch-hint",
          "发送当前文档内容到 AI，可用于生成摘要或筛选应加删除线的口水段落。"
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
    })(),
  });

  setting.addItem({
    title: "注册命令到文档菜单",
    direction: "column",
    description: "默认全部关闭。开启后会把对应命令加入文档标题菜单，可按分组集中管理。",
    actionElement: (() => {
      const panel = createElement("div", "doc-assistant-settings__menu-registration");
      menuRegistrationPanel = panel;
      const summary = createElement(
        "div",
        "doc-assistant-settings__menu-registration-summary"
      );
      const summaryText = createElement(
        "div",
        "doc-assistant-settings__menu-registration-summary-text"
      );
      summaryText.append(
        createElement(
          "div",
          "doc-assistant-settings__menu-registration-summary-title",
          "文档标题菜单命令"
        ),
        enabledSummary
      );

      const summarySwitch = createElement(
        "label",
        "doc-assistant-settings__menu-registration-summary-switch"
      );
      summarySwitch.append(
        createElement(
          "span",
          "doc-assistant-settings__menu-registration-summary-switch-label",
          "全部启用"
        ),
        allSwitch
      );

      const groupsWrap = createElement(
        "div",
        "doc-assistant-settings__menu-registration-groups"
      );
      groupsWrap.dataset.settingSection = "menu-registration-groups";
      const summaryControls = createElement(
        "div",
        "doc-assistant-settings__section-controls"
      );
      summaryControls.append(
        summarySwitch,
        createCollapseButton({
          key: "menu-registration-groups",
          label: "文档标题菜单命令",
          content: groupsWrap,
        })
      );
      summary.append(summaryText, summaryControls);
      panel.append(summary, groupsWrap);

      buildMenuRegistrationGroups(actions, isMobile, state).forEach((group) => {
        const groupCard = createElement(
          "section",
          "doc-assistant-settings__menu-registration-group"
        );
        const groupHeader = createElement(
          "div",
          "doc-assistant-settings__menu-registration-group-header"
        );
        groupHeader.append(
          createElement(
            "div",
            "doc-assistant-settings__menu-registration-group-title",
            group.label
          )
        );
        groupHeader.append(
          createElement(
            "span",
            "doc-assistant-settings__menu-registration-group-count",
            `${group.actions.length} 项`
          )
        );

        const groupList = createElement(
          "div",
          "doc-assistant-settings__menu-registration-group-list"
        );

        group.actions.forEach((action) => {
          const row = createElement(
            "label",
            "doc-assistant-settings__menu-registration-action"
          );
          row.dataset.actionKey = action.key;
          if (action.menuToggleDisabled) {
            row.dataset.disabled = "true";
          }

          const rowText = createElement(
            "div",
            "doc-assistant-settings__menu-registration-action-text"
          );
          rowText.append(
            createElement(
              "div",
              "doc-assistant-settings__menu-registration-action-label",
              action.label
            )
          );
          if (action.menuToggleDisabledReason) {
            rowText.append(
              createElement(
                "div",
                "doc-assistant-settings__menu-registration-action-meta",
                action.menuToggleDisabledReason
              )
            );
          }

          const checkbox = createCheckbox({
            checked: action.menuRegistered,
            disabled: action.menuToggleDisabled,
            title: action.menuToggleDisabledReason || action.label,
            onChange: async (checked) => {
              state[action.key] = checked;
              syncAllSwitch(allSwitch);
              await onToggleSingle(action.key, checked);
            },
          });

          actionSwitches.set(action.key, checkbox);
          row.append(rowText, checkbox);
          groupList.append(row);
        });

        groupCard.append(groupHeader, groupList);
        groupsWrap.append(groupCard);
      });

      syncEnabledSummary();
      return panel;
    })(),
  });

  const originalOpen = setting.open.bind(setting);
  const stripDefaultSettingClasses = (panel: HTMLElement | null) => {
    if (!panel) {
      return;
    }
    normalizeSettingPanelHost(panel);
  };
  setting.open = ((name: string) => {
    originalOpen(name);
    stripDefaultSettingClasses(aiPanel);
    stripDefaultSettingClasses(menuRegistrationPanel);
    setTimeout(() => {
      stripDefaultSettingClasses(aiPanel);
      stripDefaultSettingClasses(menuRegistrationPanel);
    }, 0);
  }) as typeof setting.open;

  return setting;
}
