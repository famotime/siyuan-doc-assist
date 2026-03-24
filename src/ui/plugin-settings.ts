import { Setting } from "siyuan";
import { buildDockDocActions } from "@/core/dock-panel-core";
import {
  DocMenuRegistrationState,
  isAllDocMenuRegistrationEnabled,
} from "@/core/doc-menu-registration-core";
import { ActionConfig, ActionKey } from "@/plugin/actions";

type OpenDocMenuRegistrationSettingOptions = {
  pluginName: string;
  actions: ActionConfig[];
  registration: DocMenuRegistrationState;
  isMobile: boolean;
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
  checkbox.type = "checkbox";
  checkbox.checked = options.checked;
  checkbox.disabled = Boolean(options.disabled);
  if (options.title) {
    checkbox.title = options.title;
  }
  checkbox.addEventListener("change", () => {
    void options.onChange(checkbox.checked);
  });
  return checkbox;
}

export function openDocMenuRegistrationSetting(
  options: OpenDocMenuRegistrationSettingOptions
) {
  const {
    pluginName,
    actions,
    registration,
    isMobile,
    onToggleAll,
    onToggleSingle,
  } = options;
  const state: DocMenuRegistrationState = { ...registration };
  const actionSwitches = new Map<ActionKey, HTMLInputElement>();
  const setting = new Setting({ width: "640px" });
  const syncAllSwitch = (allSwitch: HTMLInputElement) => {
    allSwitch.checked = isAllDocMenuRegistrationEnabled(state);
  };
  const syncActionSwitches = () => {
    actionSwitches.forEach((checkbox, key) => {
      checkbox.checked = state[key] === true;
    });
  };

  const allSwitch = createCheckbox({
    checked: isAllDocMenuRegistrationEnabled(state),
    onChange: async (checked) => {
      for (const key of Object.keys(state) as ActionKey[]) {
        state[key] = checked;
      }
      syncActionSwitches();
      syncAllSwitch(allSwitch);
      await onToggleAll(checked);
    },
  });

  setting.addItem({
    title: "注册命令到文档菜单",
    description: "开启后会把对应命令加入文档标题菜单。默认全部不注册。",
    actionElement: allSwitch,
  });

  buildDockDocActions(actions, isMobile, state).forEach((action) => {
    const description = action.menuToggleDisabledReason
      ? `${action.groupLabel} · ${action.menuToggleDisabledReason}`
      : `分组：${action.groupLabel}`;
    const checkbox = createCheckbox({
      checked: action.menuRegistered,
      disabled: action.menuToggleDisabled,
      title: action.menuToggleDisabledReason,
      onChange: async (checked) => {
        state[action.key] = checked;
        syncAllSwitch(allSwitch);
        await onToggleSingle(action.key, checked);
      },
    });
    actionSwitches.set(action.key, checkbox);
    setting.addItem({
      title: action.label,
      description,
      actionElement: checkbox,
    });
  });

  setting.open(pluginName);
  return setting;
}
