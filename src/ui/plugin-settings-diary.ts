import { normalizeMonthlyDiaryTemplate } from "@/core/monthly-diary-core";
import {
  createCollapseButton,
  createElement,
  createFieldRow,
  createTextareaInput,
} from "@/ui/plugin-settings-shared";

type CreateMonthlyDiarySettingsPanelOptions = {
  template: string;
  onTemplateChange: (template: string) => Promise<void> | void;
};

export function createMonthlyDiarySettingsPanel(
  options: CreateMonthlyDiarySettingsPanelOptions
): HTMLDivElement {
  const panel = createElement("div", "doc-assistant-settings__diary-panel");
  const header = createElement("div", "doc-assistant-settings__ai-switch");
  const headerText = createElement("div", "doc-assistant-settings__ai-switch-text");
  headerText.append(
    createElement("div", "doc-assistant-settings__ai-switch-title", "按月展开每日模板"),
    createElement(
      "div",
      "doc-assistant-settings__ai-switch-hint",
      "创建本月日记时，会把下面的单日 Markdown 模板按当前月份逐日展开并合并为一篇文档。"
    )
  );
  const textarea = createTextareaInput({
    value: normalizeMonthlyDiaryTemplate(options.template),
    rows: 16,
    placeholder: "## {{date}} {{weekday}}",
    dataSettingKey: "monthly-diary-template",
    onChange: async (value) => {
      const normalized = normalizeMonthlyDiaryTemplate(value);
      textarea.value = normalized;
      await options.onTemplateChange(normalized);
    },
  });

  const fields = createElement("div", "doc-assistant-settings__ai-fields");
  fields.dataset.settingSection = "monthly-diary-fields";
  fields.append(
    createFieldRow({
      label: "单日模板（Markdown）",
      hint: "支持变量 {{date}} 与 {{weekday}}；留空会恢复默认模板。创建本月日记时会按当前月份逐日展开并合并成一篇文档。",
      input: textarea,
    })
  );

  const controls = createElement("div", "doc-assistant-settings__section-controls");
  controls.append(
    createCollapseButton({
      key: "monthly-diary-fields",
      label: "本月日记模板设置",
      content: fields,
    })
  );

  header.append(headerText, controls);
  panel.append(header, fields);

  return panel;
}
