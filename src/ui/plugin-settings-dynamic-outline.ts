import {
  DEFAULT_DYNAMIC_OUTLINE_VIEW_MODES,
  DynamicOutlineViewMode,
  normalizeDynamicOutlineViewModes
} from "@/core/dynamic-outline-core";
import { applySettingTooltip, createElement } from "@/ui/plugin-settings-shared";

export type CreateDynamicOutlineSettingsPanelOptions = {
  enabled: boolean;
  followKeyInfo: boolean;
  quickSwitchEnabled?: boolean;
  viewModes?: DynamicOutlineViewMode[];
  isMobile: boolean;
  autoPasteOnSelect?: boolean;
  onAutoPasteOnSelectChange?: (enabled: boolean) => Promise<void> | void;
  onEnabledChange: (enabled: boolean) => Promise<void> | void;
  onFollowKeyInfoChange?: (follow: boolean) => Promise<void> | void;
  onQuickSwitchEnabledChange?: (enabled: boolean) => Promise<void> | void;
  onViewModesChange?: (modes: DynamicOutlineViewMode[]) => Promise<void> | void;
};

export function createDynamicOutlineSettingsPanel(
  options: CreateDynamicOutlineSettingsPanelOptions
): HTMLDivElement {
  const panel = createElement(
    "div",
    "doc-assistant-settings__dynamic-outline-panel doc-assistant-settings__section-card"
  );

  // 1. 总开关行：启用灵动浮岛
  const enableRow = createElement("div", "doc-assistant-settings__dynamic-outline-row");
  enableRow.dataset.settingSection = "dynamic-outline-enabled";
  const enableText = createElement("div", "doc-assistant-settings__dynamic-outline-row-text");
  enableText.append(
    createElement("div", "doc-assistant-settings__dynamic-outline-row-title", "启用灵动浮岛")
  );
  applySettingTooltip(
    enableText,
    "开启后在文档编辑区边缘显示微型 Minimap 标尺，悬浮可展开灵动浮岛面板，支持文档大纲、已打开文档与剪贴板历史切换，并支持点击跳转和钉住。"
  );
  const dynamicOutlineToggle = document.createElement("input");
  dynamicOutlineToggle.className = "b3-switch fn__flex-center";
  dynamicOutlineToggle.type = "checkbox";
  dynamicOutlineToggle.checked = Boolean(options.enabled);
  dynamicOutlineToggle.dataset.settingKey = "dynamic-outline-enabled";
  const enableControl = createElement("div", "doc-assistant-settings__dynamic-outline-row-control");
  enableControl.append(dynamicOutlineToggle);
  enableRow.append(enableText, enableControl);

  // 2. 可切换面板行（上移至第二项）
  const viewModesRow = createElement("div", "doc-assistant-settings__dynamic-outline-row");
  viewModesRow.dataset.settingSection = "dynamic-outline-view-modes";
  const viewModesText = createElement("div", "doc-assistant-settings__dynamic-outline-row-text");
  viewModesText.append(
    createElement("div", "doc-assistant-settings__dynamic-outline-row-title", "可切换面板")
  );
  applySettingTooltip(
    viewModesText,
    "勾选要在灵动浮岛左上角标题切换的面板（至少保留 1 个；勾选「剪贴板」将在桌面端后台静默记录系统剪贴板）。"
  );

  const viewModeOptions: Array<{ mode: DynamicOutlineViewMode; label: string }> = [
    { mode: "outline", label: "文档大纲" },
    { mode: "open-docs", label: "已打开文档" },
    { mode: "clipboard", label: "剪贴板" }
  ];
  let selectedViewModes = normalizeDynamicOutlineViewModes(
    options.viewModes || DEFAULT_DYNAMIC_OUTLINE_VIEW_MODES
  );
  const viewModeCheckboxes = new Map<DynamicOutlineViewMode, HTMLInputElement>();
  const viewModesWrap = createElement(
    "div",
    "doc-assistant-settings__dynamic-outline-modes fn__flex"
  );

  viewModeOptions.forEach(({ mode, label }) => {
    const itemLabel = document.createElement("label");
    itemLabel.className = "doc-assistant-settings__dynamic-outline-mode-item fn__flex";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "b3-checkbox";
    checkbox.checked = selectedViewModes.includes(mode);
    checkbox.dataset.viewMode = mode;
    checkbox.addEventListener("change", () => {
      const next = viewModeOptions
        .map((opt) => opt.mode)
        .filter((m) => {
          const box = viewModeCheckboxes.get(m);
          return box ? box.checked : false;
        });
      if (next.length === 0) {
        checkbox.checked = true;
        return;
      }
      selectedViewModes = next;
      options.onViewModesChange?.([...selectedViewModes]);
    });

    const textSpan = document.createElement("span");
    textSpan.textContent = label;
    itemLabel.append(checkbox, textSpan);
    viewModesWrap.append(itemLabel);
    viewModeCheckboxes.set(mode, checkbox);
  });

  const viewModesControl = createElement("div", "doc-assistant-settings__dynamic-outline-row-control");
  viewModesControl.append(viewModesWrap);
  viewModesRow.append(viewModesText, viewModesControl);

  // 3. 文档大纲跟随关键内容行（下移至第三项）
  const followRow = createElement("div", "doc-assistant-settings__dynamic-outline-row");
  followRow.dataset.settingSection = "dynamic-outline-follow-key-info";
  const followText = createElement("div", "doc-assistant-settings__dynamic-outline-row-text");
  followText.append(
    createElement("div", "doc-assistant-settings__dynamic-outline-row-title", "文档大纲跟随关键内容")
  );
  applySettingTooltip(
    followText,
    "开启后，“文档大纲”面板显示内容与侧栏“关键内容”Dock 当前选择的过滤类型保持一致；关闭时默认显示层级标题大纲。"
  );
  const followKeyInfoToggle = document.createElement("input");
  followKeyInfoToggle.className = "b3-switch fn__flex-center";
  followKeyInfoToggle.type = "checkbox";
  followKeyInfoToggle.checked = Boolean(options.followKeyInfo);
  followKeyInfoToggle.dataset.settingKey = "dynamic-outline-follow-key-info";
  const followControl = createElement("div", "doc-assistant-settings__dynamic-outline-row-control");
  followControl.append(followKeyInfoToggle);
  followRow.append(followText, followControl);

  // 4. 面板切换快捷入口行
  const quickSwitchRow = createElement("div", "doc-assistant-settings__dynamic-outline-row");
  quickSwitchRow.dataset.settingSection = "dynamic-outline-quick-switch";
  const quickSwitchText = createElement("div", "doc-assistant-settings__dynamic-outline-row-text");
  quickSwitchText.append(
    createElement("div", "doc-assistant-settings__dynamic-outline-row-title", "面板切换快捷入口")
  );
  applySettingTooltip(
    quickSwitchText,
    "开启后在 Minimap 上下两端显示圆形浮标，分别显示已打开文档与剪贴板面板的条目数量，鼠标悬浮即可直接打开对应面板。"
  );
  const quickSwitchToggle = document.createElement("input");
  quickSwitchToggle.className = "b3-switch fn__flex-center";
  quickSwitchToggle.type = "checkbox";
  quickSwitchToggle.checked = Boolean(options.quickSwitchEnabled);
  quickSwitchToggle.dataset.settingKey = "dynamic-outline-quick-switch";
  const quickSwitchControl = createElement("div", "doc-assistant-settings__dynamic-outline-row-control");
  quickSwitchControl.append(quickSwitchToggle);
  quickSwitchRow.append(quickSwitchText, quickSwitchControl);

  const syncChildState = (enabled: boolean) => {
    viewModesRow.classList.toggle("is-disabled", !enabled);
    followRow.classList.toggle("is-disabled", !enabled);
    quickSwitchRow.classList.toggle("is-disabled", !enabled);
    if (enabled) {
      followKeyInfoToggle.removeAttribute("disabled");
      quickSwitchToggle.removeAttribute("disabled");
      viewModeCheckboxes.forEach((box, mode) => {
        if (mode === "clipboard" && options.isMobile) {
          box.setAttribute("disabled", "true");
        } else {
          box.removeAttribute("disabled");
        }
      });
    } else {
      followKeyInfoToggle.setAttribute("disabled", "true");
      quickSwitchToggle.setAttribute("disabled", "true");
      viewModeCheckboxes.forEach((box) => {
        box.setAttribute("disabled", "true");
      });
    }
  };

  syncChildState(Boolean(options.enabled));

  dynamicOutlineToggle.addEventListener("change", () => {
    const isEnabled = dynamicOutlineToggle.checked;
    syncChildState(isEnabled);
    void options.onEnabledChange(isEnabled);
  });

  followKeyInfoToggle.addEventListener("change", () => {
    void options.onFollowKeyInfoChange?.(followKeyInfoToggle.checked);
  });

  quickSwitchToggle.addEventListener("change", () => {
    void options.onQuickSwitchEnabledChange?.(quickSwitchToggle.checked);
  });

  const rows: HTMLElement[] = [enableRow, viewModesRow, quickSwitchRow, followRow];

  // 5. 浮窗命中文本直接粘贴行（移入灵动浮岛设置区域末尾）
  if (options.onAutoPasteOnSelectChange) {
    const autoPasteRow = createElement("div", "doc-assistant-settings__dynamic-outline-row");
    autoPasteRow.dataset.settingSection = "floating-text-auto-paste";
    const autoPasteText = createElement("div", "doc-assistant-settings__dynamic-outline-row-text");
    autoPasteText.append(
      createElement("div", "doc-assistant-settings__dynamic-outline-row-title", "浮窗命中文本直接粘贴")
    );
    applySettingTooltip(
      autoPasteText,
      "开启后，在悬浮窗搜索栏选择匹配文本后自动复制：若浮窗未钉住，浮窗自动缩小并在当前焦点输入框自动粘贴；若浮窗为钉住状态，则保持浮窗置顶并在短暂间隔后自动粘贴。关闭时仅复制到剪贴板，保持浮窗显示。"
    );
    const autoPasteToggle = document.createElement("input");
    autoPasteToggle.className = "b3-switch fn__flex-center";
    autoPasteToggle.type = "checkbox";
    autoPasteToggle.checked = Boolean(options.autoPasteOnSelect);
    autoPasteToggle.dataset.settingKey = "floating-text-auto-paste";
    autoPasteToggle.addEventListener("change", () => {
      void options.onAutoPasteOnSelectChange?.(autoPasteToggle.checked);
    });
    const autoPasteControl = createElement(
      "div",
      "doc-assistant-settings__dynamic-outline-row-control doc-assistant-settings__autopaste-control"
    );
    autoPasteControl.append(autoPasteToggle);
    autoPasteRow.append(autoPasteText, autoPasteControl);
    rows.push(autoPasteRow);
  }

  panel.append(...rows);
  return panel;
}
