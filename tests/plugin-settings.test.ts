/** @vitest-environment jsdom */

import { beforeEach, describe, expect, test, vi } from "vitest";
import { ACTIONS, getActionConfigByKey } from "@/plugin/actions";
import { buildDefaultDocMenuRegistration } from "@/core/doc-menu-registration-core";
import { buildDockDocActions } from "@/core/dock-panel-core";
import { filterVisibleActions } from "@/plugin/alpha-feature-config";

const {
  settingInstances,
  showMessageMock,
  topBarConfigs,
  addIconsMock,
} = vi.hoisted(() => ({
  settingInstances: [] as Array<{
    items: Array<{
      title: string;
      direction?: "column" | "row";
      description?: string;
      actionElement: HTMLElement;
    }>;
    open: ReturnType<typeof vi.fn>;
  }>,
  showMessageMock: vi.fn(),
  topBarConfigs: [] as Array<{
    icon: string;
    title: string;
    callback: (event: MouseEvent) => void;
    position?: "right" | "left";
  }>,
  addIconsMock: vi.fn(),
}));

vi.mock("siyuan", () => {
  class Plugin {
    public readonly storage = new Map<string, any>();
    public readonly listeners = new Map<string, Set<(event: any) => void>>();
    public readonly addDock = vi.fn();
    public readonly addCommand = vi.fn();
    public readonly addTopBar = vi.fn((config: {
      icon: string;
      title: string;
      callback: (event: MouseEvent) => void;
      position?: "right" | "left";
    }) => {
      topBarConfigs.push(config);
      return document.createElement("div");
    });
    public readonly addIcons = addIconsMock;
    public readonly name = "siyuan-doc-assist";
    public setting?: Setting;

    public readonly eventBus = {
      on: (name: string, handler: (event: any) => void) => {
        const current = this.listeners.get(name) || new Set<(event: any) => void>();
        current.add(handler);
        this.listeners.set(name, current);
      },
      off: (name: string, handler: (event: any) => void) => {
        this.listeners.get(name)?.delete(handler);
      },
    };

    async loadData(storageName: string): Promise<any> {
      return this.storage.get(storageName);
    }

    async saveData(storageName: string, content: any): Promise<void> {
      this.storage.set(storageName, content);
    }
  }

  class Setting {
    public readonly items: Array<{
      title: string;
      direction?: "column" | "row";
      description?: string;
      actionElement: HTMLElement;
    }> = [];
    public readonly open = vi.fn();

    constructor(_options: { width?: string; height?: string }) {
      settingInstances.push(this);
    }

    addItem(options: {
      title: string;
      direction?: "column" | "row";
      description?: string;
      actionElement?: HTMLElement;
      createActionElement?: () => HTMLElement;
    }) {
      const actionElement = options.actionElement || options.createActionElement?.();
      if (!actionElement) {
        throw new Error(`Missing action element for ${options.title}`);
      }
      this.items.push({
        title: options.title,
        direction: options.direction,
        description: options.description,
        actionElement,
      });
    }
  }

  return {
    Plugin,
    Setting,
    getFrontend: () => "desktop",
    getActiveEditor: () => undefined,
    confirm: (_title: string, _text: string, yes?: () => void) => {
      yes?.();
    },
    showMessage: showMessageMock,
  };
});

describe("plugin settings", () => {
  const visibleActions = filterVisibleActions(ACTIONS);

  const getExpectedGroupTitles = (actions = ACTIONS) => {
    const titles: string[] = [];
    buildDockDocActions(actions, false, buildDefaultDocMenuRegistration(actions)).forEach(
      (action) => {
        if (!titles.includes(action.groupLabel)) {
          titles.push(action.groupLabel);
        }
      }
    );
    return titles;
  };

  beforeEach(() => {
    settingInstances.length = 0;
    topBarConfigs.length = 0;
    showMessageMock.mockReset();
    addIconsMock.mockReset();
  });

  test("opens a settings page for doc menu registration and defaults every action to unregistered", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.onload();

    expect(settingInstances).toHaveLength(1);
    expect(plugin.setting).toBe(settingInstances[0]);
    expect(addIconsMock).not.toHaveBeenCalled();
    expect(topBarConfigs).toHaveLength(0);

    plugin.openSetting();

    expect(settingInstances).toHaveLength(2);
    const setting = settingInstances[1];
    expect(plugin.setting).toBe(setting);
    expect(setting.items[0]?.title).toBe("钉住页签始终保持可见");
    expect(setting.items[1]?.title).toBe("注册命令到文档菜单");
    expect(setting.items[1]?.direction).toBe("column");
    expect(setting.items).toHaveLength(2);

    const tabToggle = setting.items[0]?.actionElement as HTMLInputElement;
    expect(tabToggle.type).toBe("checkbox");
    expect(tabToggle.checked).toBe(false);

    const menuRegistrationPanel = setting.items[1]?.actionElement as HTMLElement;
    expect(menuRegistrationPanel.classList.contains("doc-assistant-settings__menu-registration")).toBe(
      true
    );
    expect(menuRegistrationPanel.classList.contains("doc-assistant-settings__section-card")).toBe(
      true
    );

    const groupTitles = Array.from(
      menuRegistrationPanel.querySelectorAll(".doc-assistant-settings__menu-registration-group-title")
    ).map((element) => element.textContent?.trim());
    expect(groupTitles).toEqual(getExpectedGroupTitles(visibleActions));

    const firstGroupList = menuRegistrationPanel.querySelector(
      ".doc-assistant-settings__menu-registration-group-list"
    ) as HTMLElement;
    expect(firstGroupList.hidden).toBe(false);
    const menuGroups = menuRegistrationPanel.querySelector(
      "[data-setting-section='menu-registration-groups']"
    ) as HTMLElement;
    const menuCollapseButton = menuRegistrationPanel.querySelector(
      "[data-setting-collapse='menu-registration-groups']"
    ) as HTMLButtonElement;
    expect(menuGroups.hidden).toBe(false);
    expect(menuCollapseButton.getAttribute("aria-expanded")).toBe("true");
    expect(
      menuCollapseButton.querySelector(".doc-assistant-settings__collapse-button-label")?.textContent
    ).toBe("收起");
    expect(menuCollapseButton.parentElement?.lastElementChild).toBe(menuCollapseButton);

    const menuActionRows = menuRegistrationPanel.querySelectorAll(
      ".doc-assistant-settings__menu-registration-action"
    );
    expect(menuActionRows).toHaveLength(visibleActions.length);

    const genericActionMeta = Array.from(
      menuRegistrationPanel.querySelectorAll(".doc-assistant-settings__menu-registration-action-meta")
    ).find((element) => element.textContent?.includes("加入文档标题菜单"));
    expect(genericActionMeta).toBeUndefined();

    const allToggle = menuRegistrationPanel.querySelector(
      ".doc-assistant-settings__menu-registration-summary input[type='checkbox']"
    ) as HTMLInputElement;
    expect(allToggle.type).toBe("checkbox");
    expect(allToggle.checked).toBe(false);

    const exportCurrentToggle = menuRegistrationPanel.querySelector(
      "[data-action-key='export-current'] input[type='checkbox']"
    ) as HTMLInputElement;
    expect(exportCurrentToggle.checked).toBe(false);
    expect(exportCurrentToggle.title).toBe(getActionConfigByKey("export-current").tooltip);

    menuCollapseButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(menuGroups.hidden).toBe(true);
    expect(menuCollapseButton.getAttribute("aria-expanded")).toBe("false");
    expect(
      menuCollapseButton.querySelector(".doc-assistant-settings__collapse-button-label")?.textContent
    ).toBe("展开");

  });

  test("updates persisted registration state when toggling switches in settings page", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.onload();

    plugin.openSetting();

    const setting = settingInstances[1];
    const tabToggle = setting.items[0]?.actionElement as HTMLInputElement;
    const menuRegistrationPanel = setting.items[1]?.actionElement as HTMLElement;
    const allToggle = menuRegistrationPanel.querySelector(
      ".doc-assistant-settings__menu-registration-summary input[type='checkbox']"
    ) as HTMLInputElement;
    const singleToggle = menuRegistrationPanel.querySelector(
      "[data-action-key='insert-backlinks'] input[type='checkbox']"
    ) as HTMLInputElement;

    tabToggle.checked = true;
    tabToggle.dispatchEvent(new Event("change"));
    await Promise.resolve();

    expect(plugin.keepNewDocAfterPinnedTabs).toBe(true);

    allToggle.checked = true;
    allToggle.dispatchEvent(new Event("change"));
    await Promise.resolve();

    expect(
      Object.values(plugin.docMenuRegistrationState).every((enabled) => enabled === true)
    ).toBe(true);

    singleToggle.checked = false;
    singleToggle.dispatchEvent(new Event("change"));
    await Promise.resolve();

    expect(plugin.docMenuRegistrationState["insert-backlinks"]).toBe(false);

    const stored = await plugin.loadData("doc-menu-registration");
    expect(stored).toEqual(
      expect.objectContaining({
        keepNewDocAfterPinnedTabs: true,
        actionEnabled: expect.objectContaining({
          "insert-backlinks": false,
        }),
      })
    );
  });

  test("adapts group rendering when action grouping changes in config", async () => {
    const { createPluginSettings } = await import("@/ui/plugin-settings");
    const regroupedActions = ACTIONS.map((action) =>
      action.key === "export-current"
        ? {
            ...action,
            group: "insert" as const,
          }
        : action
    );

    createPluginSettings({
      actions: regroupedActions,
      registration: buildDefaultDocMenuRegistration(regroupedActions),
      isMobile: false,
      keepNewDocAfterPinnedTabs: false,
      aiSummaryConfig: {
        enabled: false,
        baseUrl: "",
        apiKey: "",
        model: "",
        requestTimeoutSeconds: 30,
      },
      monthlyDiaryTemplate: "## {{date}} {{weekday}}",
      onAiSummaryConfigChange: vi.fn(),
      onMonthlyDiaryTemplateChange: vi.fn(),
      onToggleKeepNewDocAfterPinnedTabs: vi.fn(),
      onToggleAll: vi.fn(),
      onToggleSingle: vi.fn(),
    });

    const setting = settingInstances[0];
    const menuRegistrationPanel = setting.items[2]?.actionElement as HTMLElement;
    const groupTitles = Array.from(
      menuRegistrationPanel.querySelectorAll(".doc-assistant-settings__menu-registration-group-title")
    ).map((element) => element.textContent?.trim());
    expect(groupTitles).toEqual(getExpectedGroupTitles(regroupedActions));

    const insertGroupTitle = Array.from(
      menuRegistrationPanel.querySelectorAll(".doc-assistant-settings__menu-registration-group-title")
    ).find((element) => element.textContent?.trim() === "插入");
    const insertGroup = insertGroupTitle?.closest(
      ".doc-assistant-settings__menu-registration-group"
    ) as HTMLElement;
    expect(
      insertGroup.querySelector("[data-action-key='export-current'] input[type='checkbox']")
    ).toBeTruthy();
  });

  test("keeps mobile-disabled actions in their groups and exposes the disabled reason", async () => {
    const { createPluginSettings } = await import("@/ui/plugin-settings");

    createPluginSettings({
      actions: ACTIONS,
      registration: buildDefaultDocMenuRegistration(ACTIONS),
      isMobile: true,
      keepNewDocAfterPinnedTabs: false,
      aiSummaryConfig: {
        enabled: false,
        baseUrl: "",
        apiKey: "",
        model: "",
        requestTimeoutSeconds: 30,
      },
      monthlyDiaryTemplate: "## {{date}} {{weekday}}",
      onAiSummaryConfigChange: vi.fn(),
      onMonthlyDiaryTemplateChange: vi.fn(),
      onToggleKeepNewDocAfterPinnedTabs: vi.fn(),
      onToggleAll: vi.fn(),
      onToggleSingle: vi.fn(),
    });

    const setting = settingInstances[0];
    const menuRegistrationPanel = setting.items[2]?.actionElement as HTMLElement;
    const moveBacklinksRow = menuRegistrationPanel.querySelector(
      "[data-action-key='move-backlinks']"
    ) as HTMLElement;
    const moveBacklinksToggle = moveBacklinksRow.querySelector(
      "input[type='checkbox']"
    ) as HTMLInputElement;
    const moveBacklinksMeta = moveBacklinksRow.querySelector(
      ".doc-assistant-settings__menu-registration-action-meta"
    ) as HTMLElement;

    expect(moveBacklinksRow.dataset.disabled).toBe("true");
    expect(moveBacklinksToggle.disabled).toBe(true);
    expect(moveBacklinksToggle.title).toContain("该操作当前仅支持桌面端");
    expect(moveBacklinksMeta.textContent).toContain("该操作当前仅支持桌面端");
  });

  test("removes fixed Setting action sizing classes from AI and menu panels when opening", async () => {
    const { createPluginSettings } = await import("@/ui/plugin-settings");

    const setting = createPluginSettings({
      actions: ACTIONS,
      registration: buildDefaultDocMenuRegistration(ACTIONS),
      isMobile: false,
      keepNewDocAfterPinnedTabs: false,
      aiSummaryConfig: {
        enabled: false,
        baseUrl: "",
        apiKey: "",
        model: "",
        requestTimeoutSeconds: 30,
      },
      monthlyDiaryTemplate: "## {{date}} {{weekday}}",
      onAiSummaryConfigChange: vi.fn(),
      onMonthlyDiaryTemplateChange: vi.fn(),
      onToggleKeepNewDocAfterPinnedTabs: vi.fn(),
      onToggleAll: vi.fn(),
      onToggleSingle: vi.fn(),
    });

    const aiPanel = setting.items[1]?.actionElement as HTMLElement;
    const menuRegistrationPanel = setting.items[2]?.actionElement as HTMLElement;
    const diaryPanel = setting.items[3]?.actionElement as HTMLElement;
    const diaryHostItem = document.createElement("div");
    diaryHostItem.className = "fn__flex b3-label config__item";
    const diaryTitle = document.createElement("div");
    diaryTitle.className = "fn__flex-1";
    const diarySpace = document.createElement("span");
    diarySpace.className = "fn__space";
    diaryHostItem.append(diaryTitle, diarySpace, diaryPanel);
    const aiHostItem = document.createElement("div");
    aiHostItem.className = "fn__flex b3-label config__item";
    const aiTitle = document.createElement("div");
    aiTitle.className = "fn__flex-1";
    const aiSpace = document.createElement("span");
    aiSpace.className = "fn__space";
    aiHostItem.append(aiTitle, aiSpace, aiPanel);

    const menuHostItem = document.createElement("div");
    menuHostItem.className = "fn__flex b3-label config__item";
    const menuTitle = document.createElement("div");
    menuTitle.className = "fn__flex-1";
    const menuSpace = document.createElement("span");
    menuSpace.className = "fn__space";
    menuHostItem.append(menuTitle, menuSpace, menuRegistrationPanel);

    aiPanel.classList.add("fn__flex-center", "fn__size200");
    diaryPanel.classList.add("fn__flex-center", "fn__size200");
    menuRegistrationPanel.classList.add("fn__flex-center", "fn__size200");

    setting.open("siyuan-doc-assist");

    expect(aiPanel.classList.contains("fn__flex-center")).toBe(false);
    expect(aiPanel.classList.contains("fn__size200")).toBe(false);
    expect(diaryPanel.classList.contains("fn__flex-center")).toBe(false);
    expect(diaryPanel.classList.contains("fn__size200")).toBe(false);
    expect(menuRegistrationPanel.classList.contains("fn__flex-center")).toBe(false);
    expect(menuRegistrationPanel.classList.contains("fn__size200")).toBe(false);
    expect(diaryHostItem.classList.contains("doc-assistant-settings__host-item")).toBe(true);
    expect(aiHostItem.classList.contains("doc-assistant-settings__host-item")).toBe(true);
    expect(menuHostItem.classList.contains("doc-assistant-settings__host-item")).toBe(true);
    expect(diaryTitle.classList.contains("doc-assistant-settings__host-title")).toBe(true);
    expect(aiTitle.classList.contains("doc-assistant-settings__host-title")).toBe(true);
    expect(menuTitle.classList.contains("doc-assistant-settings__host-title")).toBe(true);
    expect(diarySpace.classList.contains("doc-assistant-settings__host-space")).toBe(true);
    expect(aiSpace.classList.contains("doc-assistant-settings__host-space")).toBe(true);
    expect(menuSpace.classList.contains("doc-assistant-settings__host-space")).toBe(true);
  });

  test("hides alpha actions and related settings panels when configured", async () => {
    const { ALPHA_FEATURE_HIDE_CONFIG } = await import("@/plugin/alpha-feature-config");
    ALPHA_FEATURE_HIDE_CONFIG.hiddenActionKeys = ["create-monthly-diary"];
    ALPHA_FEATURE_HIDE_CONFIG.hiddenSettingKeys = ["ai-service"];

    try {
      const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
      const plugin = new DocLinkToolkitPlugin() as any;
      await plugin.onload();

      plugin.openSetting();

      const setting = settingInstances[1];
      expect(setting.items.map((item) => item.title)).toEqual([
        "钉住页签始终保持可见",
        "注册命令到文档菜单",
      ]);

      const menuRegistrationPanel = setting.items[1]?.actionElement as HTMLElement;
      expect(
        menuRegistrationPanel.querySelector("[data-action-key='create-monthly-diary']")
      ).toBeNull();
      expect(
        menuRegistrationPanel.querySelectorAll(".doc-assistant-settings__menu-registration-action")
      ).toHaveLength(ACTIONS.length - 1);
    } finally {
      ALPHA_FEATURE_HIDE_CONFIG.hiddenActionKeys = ACTIONS
        .filter((action) => action.group === "ai")
        .map((action) => action.key);
      ALPHA_FEATURE_HIDE_CONFIG.hiddenSettingKeys = [];
    }
  });
});
