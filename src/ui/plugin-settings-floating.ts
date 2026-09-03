import {
  FloatingTextConfig,
  FloatingThemeMode,
  FloatingViewMode,
  normalizeFloatingConfig,
} from "@/core/floating-text-core";
import {
  createCheckbox,
  createElement,
  createFieldRow,
  createTextInput,
} from "@/ui/plugin-settings-shared";

type CreateFloatingSettingsPanelOptions = {
  floatingConfig: FloatingTextConfig;
  onFloatingConfigChange: (config: FloatingTextConfig) => Promise<void> | void;
};

export function createFloatingSettingsPanel(
  options: CreateFloatingSettingsPanelOptions
): HTMLDivElement {
  const config = normalizeFloatingConfig(options.floatingConfig);
  const container = createElement("div", "doc-assistant-settings-panel");

  // 1. 默认不透明度
  const opacityInput = document.createElement("input");
  opacityInput.type = "range";
  opacityInput.className = "b3-slider";
  opacityInput.min = "10";
  opacityInput.max = "100";
  opacityInput.value = String(Math.round(config.opacity * 100));
  opacityInput.style.cssText = "width: 140px; vertical-align: middle;";

  const opacityLabel = createElement("span", "ft-setting-label", ` ${opacityInput.value}%`);
  opacityLabel.style.cssText = "font-size: 13px; min-width: 42px; display: inline-block;";

  opacityInput.addEventListener("input", () => {
    opacityLabel.textContent = ` ${opacityInput.value}%`;
  });

  opacityInput.addEventListener("change", async () => {
    const nextVal = parseInt(opacityInput.value, 10) / 100;
    config.opacity = nextVal;
    await options.onFloatingConfigChange({ ...config });
  });

  const opacityWrapper = createElement("div");
  opacityWrapper.style.cssText = "display: flex; align-items: center; gap: 8px;";
  opacityWrapper.appendChild(opacityInput);
  opacityWrapper.appendChild(opacityLabel);

  const opacityRow = createFieldRow({
    label: "默认透明度",
    input: opacityWrapper,
    hint: "设置置顶悬浮窗的背景不透明度（10% ~ 100%），支持毛玻璃拟态。",
  });
  container.appendChild(opacityRow);

  // 2. 默认字号
  const fontSizeInput = createTextInput({
    type: "number",
    value: String(config.fontSize),
    dataSettingKey: "floating-font-size",
    placeholder: "15",
    onChange: async (val) => {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed)) {
        config.fontSize = parsed;
        await options.onFloatingConfigChange({ ...config });
      }
    },
  });
  fontSizeInput.style.cssText = "width: 80px;";

  const fontSizeRow = createFieldRow({
    label: "默认字号 (px)",
    input: fontSizeInput,
    hint: "悬浮窗文本的初始显示字号，在悬浮窗内可通过 Ctrl + 滚轮实时缩放。",
  });
  container.appendChild(fontSizeRow);

  // 3. 默认视图模式
  const viewModeSelect = document.createElement("select");
  viewModeSelect.className = "b3-select";
  viewModeSelect.style.cssText = "width: 140px;";
  const textOption = new Option("纯文本视图", "text", false, config.viewMode === "text");
  const mdOption = new Option("Markdown 预览", "markdown", false, config.viewMode === "markdown");
  viewModeSelect.appendChild(textOption);
  viewModeSelect.appendChild(mdOption);

  viewModeSelect.addEventListener("change", async () => {
    config.viewMode = viewModeSelect.value as FloatingViewMode;
    await options.onFloatingConfigChange({ ...config });
  });

  const viewModeRow = createFieldRow({
    label: "初始视图模式",
    input: viewModeSelect,
    hint: "悬浮窗口打开时的初始展现形态，悬浮窗顶栏可随时一键切换。",
  });
  container.appendChild(viewModeRow);

  // 4. 外观主题
  const themeSelect = document.createElement("select");
  themeSelect.className = "b3-select";
  themeSelect.style.cssText = "width: 140px;";
  themeSelect.appendChild(new Option("跟随思源主题", "auto", false, config.themeMode === "auto"));
  themeSelect.appendChild(new Option("浅色明亮", "light", false, config.themeMode === "light"));
  themeSelect.appendChild(new Option("深色暗黑", "dark", false, config.themeMode === "dark"));

  themeSelect.addEventListener("change", async () => {
    config.themeMode = themeSelect.value as FloatingThemeMode;
    await options.onFloatingConfigChange({ ...config });
  });

  const themeRow = createFieldRow({
    label: "悬浮窗主题",
    input: themeSelect,
    hint: "悬浮窗口的配色模式，默认跟随思源当前主题。",
  });
  container.appendChild(themeRow);

  // 5. 记忆窗口尺寸
  const rememberSizeCheckbox = createCheckbox({
    checked: config.rememberSize,
    title: "自动记忆悬浮窗尺寸",
    onChange: async (checked) => {
      config.rememberSize = checked;
      await options.onFloatingConfigChange({ ...config });
    },
  });

  const rememberSizeRow = createFieldRow({
    label: "记忆窗口大小",
    input: rememberSizeCheckbox,
    hint: "关闭悬浮窗时自动记忆上一次调整的窗口宽高，并在下次打开时还原。",
  });
  container.appendChild(rememberSizeRow);

  return container;
}
