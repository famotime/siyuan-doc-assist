import { buildDockDocActions } from "@/core/dock-panel-core";
import {
  DocMenuRegistrationState,
  isAllDocMenuRegistrationEnabled,
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

type CreateMenuRegistrationPanelOptions = {
  actions: ActionConfig[];
  registration: DocMenuRegistrationState;
  isMobile: boolean;
  onToggleAll: (enabled: boolean) => Promise<void> | void;
  onToggleSingle: (key: ActionKey, enabled: boolean) => Promise<void> | void;
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
  const state: DocMenuRegistrationState = { ...options.registration };
  const actionSwitches = new Map<ActionKey, HTMLInputElement>();
  const totalActionCount = Object.keys(state).length;
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
      await options.onToggleAll(checked);
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

  buildMenuRegistrationGroups(options.actions, options.isMobile, state).forEach((group) => {
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

      const checkbox = createCheckbox({
        checked: action.menuRegistered,
        disabled: action.menuToggleDisabled,
        title: formatActionTooltip(
          action.tooltip,
          action.label,
          action.menuToggleDisabledReason
        ),
        onChange: async (checked) => {
          state[action.key] = checked;
          syncAllSwitch(allSwitch);
          await options.onToggleSingle(action.key, checked);
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
}
