import { Setting } from "siyuan";
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
    onToggleKeepNewDocAfterPinnedTabs,
    onToggleAll,
    onToggleSingle,
  } = options;
  const state: DocMenuRegistrationState = { ...registration };
  const actionSwitches = new Map<ActionKey, HTMLInputElement>();
  const totalActionCount = Object.keys(state).length;
  const setting = new Setting({ width: "640px" });
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
      summary.append(summaryText, summarySwitch);

      const groupsWrap = createElement(
        "div",
        "doc-assistant-settings__menu-registration-groups"
      );
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
  setting.open = ((name: string) => {
    originalOpen(name);
    menuRegistrationPanel?.classList.remove("fn__flex-center", "fn__size200");
  }) as typeof setting.open;

  return setting;
}
