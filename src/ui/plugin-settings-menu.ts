import { buildDockDocActions } from "@/core/dock-panel-core";
import {
  DocActionEnabledState,
  DocMenuRegistrationState,
} from "@/core/doc-menu-registration-core";
import { ActionConfig, ActionKey, formatActionTooltip } from "@/plugin/actions";
import {
  createCheckbox,
  createCollapseButton,
  createElement,
} from "@/ui/plugin-settings-shared";

type MenuRegistrationGroup = {
  key: string;
  label: string;
  actions: ReturnType<typeof buildDockDocActions<ActionKey>>;
};

export type CreateMenuRegistrationPanelOptions = {
  actions: ActionConfig[];
  enabledState: DocActionEnabledState;
  registration: DocMenuRegistrationState;
  isMobile: boolean;
  onToggleAllEnabled: (enabled: boolean) => Promise<void> | void;
  onToggleAllMenu: (enabled: boolean) => Promise<void> | void;
  onToggleSingleEnabled: (key: ActionKey, enabled: boolean) => Promise<void> | void;
  onToggleSingleMenu: (key: ActionKey, enabled: boolean) => Promise<void> | void;
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

export function createMenuRegistrationPanel(
  options: CreateMenuRegistrationPanelOptions
): HTMLDivElement {
  const enabledState: DocActionEnabledState = { ...options.enabledState };
  const menuState: DocMenuRegistrationState = { ...options.registration };

  const enabledSwitches = new Map<ActionKey, HTMLInputElement>();
  const menuSwitches = new Map<ActionKey, HTMLInputElement>();
  const menuSwitchWraps = new Map<ActionKey, HTMLElement>();
  const actionDisabledMap = new Map<ActionKey, boolean>();

  const visibleActionKeys = options.actions.map((action) => action.key);
  const totalActionCount = visibleActionKeys.length;

  const enabledSummary = createElement(
    "div",
    "doc-assistant-settings__menu-registration-summary-meta"
  );

  const syncEnabledSummary = () => {
    const enabledCount = visibleActionKeys.filter((key) => enabledState[key] === true).length;
    const menuCount = visibleActionKeys.filter(
      (key) => enabledState[key] === true && menuState[key] === true
    ).length;
    enabledSummary.textContent = `已启用 ${enabledCount}/${totalActionCount} 项 · 已注册 ${menuCount}/${totalActionCount} 项`;
  };

  const syncActionRow = (key: ActionKey) => {
    const isEnabled = enabledState[key] === true;
    const isMenuRegistered = menuState[key] === true;
    const isMobileDisabled = actionDisabledMap.get(key) === true;
    const isMenuDisabled = !isEnabled || isMobileDisabled;

    const enabledCheckbox = enabledSwitches.get(key);
    if (enabledCheckbox) {
      enabledCheckbox.checked = isEnabled;
    }

    const menuCheckbox = menuSwitches.get(key);
    if (menuCheckbox) {
      menuCheckbox.checked = isMenuRegistered;
      menuCheckbox.disabled = isMenuDisabled;
    }

    const menuWrap = menuSwitchWraps.get(key);
    if (menuWrap) {
      menuWrap.dataset.disabled = isMenuDisabled ? "true" : "false";
      if (!isEnabled) {
        menuWrap.title = "需先启用命令，才可注册到文档菜单";
      } else if (isMobileDisabled) {
        menuWrap.title = "该操作当前仅支持桌面端";
      } else {
        menuWrap.title = "是否注册到文档菜单";
      }
    }
  };

  const syncAllSwitches = () => {
    allEnabledSwitch.checked =
      totalActionCount > 0 && visibleActionKeys.every((key) => enabledState[key] === true);
    allMenuSwitch.checked =
      totalActionCount > 0 && visibleActionKeys.every((key) => menuState[key] === true);
    syncEnabledSummary();
  };

  const allEnabledSwitch = createCheckbox({
    checked:
      totalActionCount > 0 && visibleActionKeys.every((key) => enabledState[key] === true),
    title: "全部启用/停用命令在侧面板中的显示",
    onChange: async (checked) => {
      for (const key of visibleActionKeys) {
        enabledState[key] = checked;
      }
      for (const key of visibleActionKeys) {
        syncActionRow(key);
      }
      syncAllSwitches();
      await options.onToggleAllEnabled(checked);
    },
  });

  const allMenuSwitch = createCheckbox({
    checked:
      totalActionCount > 0 && visibleActionKeys.every((key) => menuState[key] === true),
    title: "全部注册/取消注册命令到文档菜单",
    onChange: async (checked) => {
      for (const key of visibleActionKeys) {
        menuState[key] = checked;
      }
      for (const key of visibleActionKeys) {
        syncActionRow(key);
      }
      syncAllSwitches();
      await options.onToggleAllMenu(checked);
    },
  });

  const panel = createElement(
    "div",
    "doc-assistant-settings__menu-registration doc-assistant-settings__section-card"
  );
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
      "操作命令配置"
    ),
    enabledSummary
  );

  const summarySwitchesWrap = createElement(
    "div",
    "doc-assistant-settings__menu-registration-summary-switches"
  );

  const allEnabledLabelWrap = createElement(
    "label",
    "doc-assistant-settings__menu-registration-summary-switch"
  );
  allEnabledLabelWrap.append(
    createElement(
      "span",
      "doc-assistant-settings__menu-registration-summary-switch-label",
      "全部启用"
    ),
    allEnabledSwitch
  );

  const allMenuLabelWrap = createElement(
    "label",
    "doc-assistant-settings__menu-registration-summary-switch"
  );
  allMenuLabelWrap.append(
    createElement(
      "span",
      "doc-assistant-settings__menu-registration-summary-switch-label",
      "全部注册"
    ),
    allMenuSwitch
  );

  summarySwitchesWrap.append(allEnabledLabelWrap, allMenuLabelWrap);

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
    summarySwitchesWrap,
    createCollapseButton({
      key: "menu-registration-groups",
      label: "操作命令配置",
      content: groupsWrap,
    })
  );
  summary.append(summaryText, summaryControls);
  panel.append(summary, groupsWrap);

  buildMenuRegistrationGroups(options.actions, options.isMobile, menuState).forEach((group) => {
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
      actionDisabledMap.set(action.key, Boolean(action.menuToggleDisabled));
      const row = createElement(
        "div",
        "doc-assistant-settings__menu-registration-action"
      );
      row.dataset.actionKey = action.key;
      row.title = formatActionTooltip(
        action.tooltip,
        action.label,
        action.menuToggleDisabledReason
      );

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

      // Switches Container
      const switchesWrap = createElement(
        "div",
        "doc-assistant-settings__action-switches"
      );

      // Switch 1: 启用（侧面板显示）
      const enabledItem = createElement(
        "label",
        "doc-assistant-settings__action-switch-item"
      );
      enabledItem.title = "是否在侧面板“文档处理”中显示";
      const enabledLabel = createElement(
        "span",
        "doc-assistant-settings__action-switch-label",
        "启用"
      );
      const enabledCheckbox = createCheckbox({
        checked: enabledState[action.key] === true,
        title: "是否在侧面板“文档处理”中显示",
        onChange: async (checked) => {
          enabledState[action.key] = checked;
          syncActionRow(action.key);
          syncAllSwitches();
          await options.onToggleSingleEnabled(action.key, checked);
        },
      });
      enabledSwitches.set(action.key, enabledCheckbox);
      enabledItem.append(enabledLabel, enabledCheckbox);

      // Switch 2: 注册到文档菜单
      const isEnabled = enabledState[action.key] === true;
      const isMenuDisabled = !isEnabled || action.menuToggleDisabled;
      const menuItem = createElement(
        "label",
        "doc-assistant-settings__action-switch-item"
      );
      menuItem.dataset.disabled = isMenuDisabled ? "true" : "false";
      menuItem.title = !isEnabled
        ? "需先启用命令，才可注册到文档菜单"
        : action.menuToggleDisabledReason || "是否注册到文档菜单";
      const menuLabel = createElement(
        "span",
        "doc-assistant-settings__action-switch-label",
        "注册"
      );
      const menuCheckbox = createCheckbox({
        checked: menuState[action.key] === true,
        disabled: isMenuDisabled,
        title: menuItem.title,
        onChange: async (checked) => {
          menuState[action.key] = checked;
          syncAllSwitches();
          await options.onToggleSingleMenu(action.key, checked);
        },
      });
      menuSwitches.set(action.key, menuCheckbox);
      menuSwitchWraps.set(action.key, menuItem);
      menuItem.append(menuLabel, menuCheckbox);

      switchesWrap.append(enabledItem, menuItem);
      row.append(rowText, switchesWrap);
      groupList.append(row);
    });

    groupCard.append(groupHeader, groupList);
    groupsWrap.append(groupCard);
  });

  syncEnabledSummary();
  return panel;
}
