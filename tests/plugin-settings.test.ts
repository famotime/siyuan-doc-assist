/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ACTIONS } from "@/plugin/actions";
import {
  buildDefaultDocActionEnabled,
  buildDefaultDocMenuRegistration
} from "@/core/doc-menu-registration-core";
import { buildDockDocActions } from "@/core/dock-panel-core";
import { DOC_ASSIST_ICON_SVG } from "@/icons";
import { ALPHA_FEATURE_HIDE_CONFIG, filterVisibleActions } from "@/plugin/alpha-feature-config";

const {
  settingInstances,
  showMessageMock,
  topBarConfigs,
  addIconsMock
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
  addIconsMock: vi.fn()
}));

vi.mock("siyuan", () => {
  class Plugin {
    public readonly listeners = new Map<string, Set<(event: any) => void>>();
    public readonly storage = new Map<string, any>();
    public readonly addDock = vi.fn();
    public readonly addCommand = vi.fn();
    public readonly addTopBar = vi.fn((config: any) => {
      topBarConfigs.push(config);
      return document.createElement("div");
    });

    public readonly addIcons = addIconsMock;

    public readonly eventBus = {
      on: (name: string, handler: (event: any) => void) => {
        const current = this.listeners.get(name) || new Set<(event: any) => void>();
        current.add(handler);
        this.listeners.set(name, current);
      },
      off: (name: string, handler: (event: any) => void) => {
        this.listeners.get(name)?.delete(handler);
      }
    };

    emitEvent(name: string, detail: any) {
      for (const handler of this.listeners.get(name) || []) {
        handler({ detail });
      }
    }

    async loadData(storageName: string): Promise<any> {
      return this.storage.get(storageName);
    }

    async saveData(storageName: string, content: any): Promise<void> {
      this.storage.set(storageName, content);
    }

    async removeData(storageName: string): Promise<any> {
      const current = this.storage.get(storageName);
      this.storage.delete(storageName);
      return current;
    }
  }

  class Setting {
    public readonly items: Array<{
      title: string;
      direction?: "row" | "column";
      description?: string;
      actionElement: HTMLElement;
    }> = [];

    public readonly open = vi.fn();

    constructor() {
      settingInstances.push(this);
    }

    addItem(options: {
      title: string;
      direction?: "row" | "column";
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
        actionElement
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
    openTab: vi.fn(),
    getAllModels: vi.fn(() => ({ editor: [] }))
  };
});

describe("plugin settings", () => {
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
    ALPHA_FEATURE_HIDE_CONFIG.hiddenActionKeys = ACTIONS
      .filter((action) => action.group === "ai")
      .map((action) => action.key);
    ALPHA_FEATURE_HIDE_CONFIG.hiddenSettingKeys = [
      "ai-service",
      "debug-mode",
      "floating-text",
      "dynamic-outline"
    ];
  });

  afterEach(() => {
    ALPHA_FEATURE_HIDE_CONFIG.hiddenActionKeys = [];
    ALPHA_FEATURE_HIDE_CONFIG.hiddenSettingKeys = [];
  });

  test("opens a settings page for doc menu registration and defaults every action to unregistered", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.onload();

    expect(plugin.displayName).toBe("文档助手");

    expect(settingInstances).toHaveLength(1);
    expect(plugin.setting).toBe(settingInstances[0]);
    expect(addIconsMock).toHaveBeenCalledWith(DOC_ASSIST_ICON_SVG);
    expect(topBarConfigs).toHaveLength(0);

    plugin.openSetting();

    expect(settingInstances).toHaveLength(2);
    const setting = settingInstances[1];
    expect(plugin.setting).toBe(setting);
    expect(setting.items[0]?.title).toBe("启动显示“文档处理”页签");
    expect(setting.items[1]?.title).toBe("鼠标手势");
    expect(setting.items[1]?.direction).toBe("row");
    expect(setting.items[2]?.title).toBe("启用命令");
    expect(setting.items[2]?.direction).toBe("row");
    expect(setting.items).toHaveLength(3);

    const menuRegistrationPanel = setting.items[2]?.actionElement as HTMLElement;
    expect(menuRegistrationPanel.classList.contains("doc-assistant-settings__menu-registration")).toBe(
      true
    );
    expect(menuRegistrationPanel.classList.contains("doc-assistant-settings__section-card")).toBe(
      true
    );

    const currentVisibleActions = filterVisibleActions(ACTIONS);

    const groupTitles = Array.from(
      menuRegistrationPanel.querySelectorAll(".doc-assistant-settings__menu-registration-group-title")
    ).map((element) => element.textContent?.trim());
    expect(groupTitles).toEqual(getExpectedGroupTitles(currentVisibleActions));

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
    expect(menuActionRows).toHaveLength(currentVisibleActions.length);

    const genericActionMeta = Array.from(
      menuRegistrationPanel.querySelectorAll(".doc-assistant-settings__menu-registration-action-meta")
    ).find((element) => element.textContent?.includes("加入文档标题菜单"));
    expect(genericActionMeta).toBeUndefined();

    // Summary batch toggles
    const summaryToggles = menuRegistrationPanel.querySelectorAll(
      ".doc-assistant-settings__menu-registration-summary input[type='checkbox']"
    );
    expect(summaryToggles).toHaveLength(2);
    const allEnabledToggle = summaryToggles[0] as HTMLInputElement;
    const allMenuToggle = summaryToggles[1] as HTMLInputElement;
    expect(allEnabledToggle.checked).toBe(false); // because bold-selected-blocks & highlight-selected-blocks are false
    expect(allMenuToggle.checked).toBe(false);

    const summarySwitchLabels = Array.from(
      menuRegistrationPanel.querySelectorAll(
        ".doc-assistant-settings__menu-registration-summary-switch-label"
      )
    ).map((el) => el.textContent?.trim());
    expect(summarySwitchLabels).toEqual(["全部启用", "全部注册"]);

    // export-current action row switches
    const exportCurrentRow = menuRegistrationPanel.querySelector(
      "[data-action-key='export-current']"
    ) as HTMLElement;
    const exportSwitches = exportCurrentRow.querySelectorAll("input[type='checkbox']");
    expect(exportSwitches).toHaveLength(2);
    const exportEnabledSwitch = exportSwitches[0] as HTMLInputElement;
    const exportMenuSwitch = exportSwitches[1] as HTMLInputElement;
    expect(exportEnabledSwitch.checked).toBe(true);
    expect(exportMenuSwitch.checked).toBe(false);

    const rowSwitchLabels = Array.from(
      exportCurrentRow.querySelectorAll(".doc-assistant-settings__action-switch-label")
    ).map((el) => el.textContent?.trim());
    expect(rowSwitchLabels).toEqual(["启用", "注册"]);

    // bold-selected-blocks (default disabled)
    const boldRow = menuRegistrationPanel.querySelector(
      "[data-action-key='bold-selected-blocks']"
    ) as HTMLElement;
    if (boldRow) {
      const boldSwitches = boldRow.querySelectorAll("input[type='checkbox']");
      expect(boldSwitches[0]?.checked).toBe(false);
      expect(boldSwitches[1]?.checked).toBe(false);
      expect(boldSwitches[1]?.disabled).toBe(true);
    }

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
    const menuRegistrationPanel = setting.items.find((item) => item.title === "启用命令")?.actionElement as HTMLElement;
    const summaryToggles = menuRegistrationPanel.querySelectorAll(
      ".doc-assistant-settings__menu-registration-summary input[type='checkbox']"
    );
    const allMenuToggle = summaryToggles[1] as HTMLInputElement;
    const singleMenuToggle = menuRegistrationPanel.querySelectorAll(
      "[data-action-key='insert-backlinks'] input[type='checkbox']"
    )[1] as HTMLInputElement;

    allMenuToggle.checked = true;
    allMenuToggle.dispatchEvent(new Event("change"));
    await Promise.resolve();

    expect(
      Object.values(plugin.docMenuRegistrationState).every((enabled) => enabled === true)
    ).toBe(true);

    singleMenuToggle.checked = false;
    singleMenuToggle.dispatchEvent(new Event("change"));
    await Promise.resolve();

    expect(plugin.docMenuRegistrationState["insert-backlinks"]).toBe(false);

    const stored = await plugin.loadData("doc-menu-registration");
    expect(stored).toEqual(
      expect.objectContaining({
        actionMenuRegistered: expect.objectContaining({
          "insert-backlinks": false
        })
      })
    );
  });

  test("adapts group rendering when action grouping changes in config", async () => {
    const { createPluginSettings } = await import("@/ui/plugin-settings");
    const regroupedActions = ACTIONS.map((action) =>
      action.key === "export-current" ?
          {
            ...action,
            group: "insert" as const
          } :
        action
    );

    createPluginSettings({
      actions: regroupedActions,
      enabledState: buildDefaultDocActionEnabled(regroupedActions),
      registration: buildDefaultDocMenuRegistration(regroupedActions),
      isMobile: false,
      aiSummaryConfig: {
        enabled: false,
        baseUrl: "",
        apiKey: "",
        model: "",
        requestTimeoutSeconds: 30
      },
      onAiSummaryConfigChange: vi.fn(),
      onToggleAllEnabled: vi.fn(),
      onToggleAllMenu: vi.fn(),
      onToggleSingleEnabled: vi.fn(),
      onToggleSingleMenu: vi.fn()
    });

    const setting = settingInstances[0];
    const menuRegistrationPanel = setting.items.find((item) => item.title === "启用命令")?.actionElement as HTMLElement;
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
      enabledState: buildDefaultDocActionEnabled(ACTIONS),
      registration: buildDefaultDocMenuRegistration(ACTIONS),
      isMobile: true,
      aiSummaryConfig: {
        enabled: false,
        baseUrl: "",
        apiKey: "",
        model: "",
        requestTimeoutSeconds: 30
      },
      onAiSummaryConfigChange: vi.fn(),
      onToggleAllEnabled: vi.fn(),
      onToggleAllMenu: vi.fn(),
      onToggleSingleEnabled: vi.fn(),
      onToggleSingleMenu: vi.fn()
    });

    const setting = settingInstances[0];
    const menuRegistrationPanel = setting.items.find((item) => item.title === "启用命令")?.actionElement as HTMLElement;
    const moveBacklinksRow = menuRegistrationPanel.querySelector(
      "[data-action-key='move-backlinks']"
    ) as HTMLElement;
    const moveBacklinksSwitches = moveBacklinksRow.querySelectorAll(
      "input[type='checkbox']"
    );
    const moveBacklinksMenuToggle = moveBacklinksSwitches[1] as HTMLInputElement;
    const moveBacklinksMeta = moveBacklinksRow.querySelector(
      ".doc-assistant-settings__menu-registration-action-meta"
    ) as HTMLElement;

    expect(moveBacklinksMenuToggle.disabled).toBe(true);
    expect(moveBacklinksMenuToggle.title).toContain("该操作当前仅支持桌面端");
    expect(moveBacklinksMeta.textContent).toContain("该操作当前仅支持桌面端");
  });

  test("removes fixed Setting action sizing classes from AI and menu panels when opening", async () => {
    const { createPluginSettings } = await import("@/ui/plugin-settings");

    const setting = createPluginSettings({
      actions: ACTIONS,
      enabledState: buildDefaultDocActionEnabled(ACTIONS),
      registration: buildDefaultDocMenuRegistration(ACTIONS),
      isMobile: false,
      aiSummaryConfig: {
        enabled: false,
        baseUrl: "",
        apiKey: "",
        model: "",
        requestTimeoutSeconds: 30
      },
      onAiSummaryConfigChange: vi.fn(),
      onToggleAllEnabled: vi.fn(),
      onToggleAllMenu: vi.fn(),
      onToggleSingleEnabled: vi.fn(),
      onToggleSingleMenu: vi.fn()
    });

    const menuRegistrationPanel = setting.items.find((item) => item.title === "启用命令")?.actionElement as HTMLElement;
    const aiPanel = setting.items[1]?.actionElement as HTMLElement;
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
    menuRegistrationPanel.classList.add("fn__flex-center", "fn__size200");

    setting.open("siyuan-doc-assist");

    expect(aiPanel.classList.contains("fn__flex-center")).toBe(false);
    expect(aiPanel.classList.contains("fn__size200")).toBe(false);
    expect(menuRegistrationPanel.classList.contains("fn__flex-center")).toBe(false);
    expect(menuRegistrationPanel.classList.contains("fn__size200")).toBe(false);
    expect(aiHostItem.classList.contains("doc-assistant-settings__host-item")).toBe(true);
    expect(menuHostItem.classList.contains("doc-assistant-settings__host-item")).toBe(true);
    expect(aiTitle.classList.contains("doc-assistant-settings__host-title")).toBe(true);
    expect(menuTitle.classList.contains("doc-assistant-settings__host-title")).toBe(true);
    expect(aiSpace.classList.contains("doc-assistant-settings__host-space")).toBe(true);
    expect(menuSpace.classList.contains("doc-assistant-settings__host-space")).toBe(true);
  });

  test("hides alpha actions and related settings panels when configured", async () => {
    const { ALPHA_FEATURE_HIDE_CONFIG } = await import("@/plugin/alpha-feature-config");
    ALPHA_FEATURE_HIDE_CONFIG.hiddenActionKeys = ["clean-ai-output"];
    ALPHA_FEATURE_HIDE_CONFIG.hiddenSettingKeys = [
      "ai-service",
      "debug-mode",
      "floating-text",
      "dynamic-outline"
    ];

    try {
      const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
      const plugin = new DocLinkToolkitPlugin() as any;
      await plugin.onload();

      plugin.openSetting();

      const setting = settingInstances[1];
      expect(setting.items.map((item) => item.title)).toEqual([
        "启动显示“文档处理”页签",
        "鼠标手势",
        "启用命令"
      ]);

      const menuRegistrationPanel = setting.items.find((item) => item.title === "启用命令")?.actionElement as HTMLElement;
      expect(
        menuRegistrationPanel.querySelector("[data-action-key='clean-ai-output']")
      ).toBeNull();
      expect(
        menuRegistrationPanel.querySelectorAll(".doc-assistant-settings__menu-registration-action")
      ).toHaveLength(ACTIONS.length - 1);
    } finally {
      ALPHA_FEATURE_HIDE_CONFIG.hiddenActionKeys = [];
      ALPHA_FEATURE_HIDE_CONFIG.hiddenSettingKeys = [];
    }
  });

  test("debug mode toggle controls logger-core debug state and AI settings panel does not contain AI log switch", async () => {
    const { isDocAssistantDebugEnabled } = await import("@/core/logger-core");
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.onload();

    ALPHA_FEATURE_HIDE_CONFIG.hiddenSettingKeys = [];
    plugin.openSetting();

    const setting = settingInstances[1];
    const itemTitles = setting.items.map((item) => item.title);
    expect(itemTitles).toContain("AI 服务");
    expect(itemTitles).toContain("调试模式");

    const aiPanelItem = setting.items.find((item) => item.title === "AI 服务");
    expect(aiPanelItem?.direction).toBe("row");
    const aiPanel = aiPanelItem?.actionElement as HTMLElement;
    expect(aiPanel.querySelector('[data-setting-key="ai-debug"]')).toBeNull();

    const debugModeItem = setting.items.find((item) => item.title === "调试模式");
    expect(debugModeItem?.description).toBeUndefined();
    expect(debugModeItem?.direction).toBeUndefined();

    const debugControl = debugModeItem?.actionElement as HTMLElement;
    expect(debugControl.classList.contains("doc-assistant-settings__debug-control")).toBe(true);
    const debugToggle = debugControl.querySelector("input[type='checkbox']") as HTMLInputElement;

    // 模拟思源宿主结构与思源内核在 open 时无脑添加的 sizing 类名
    const hostItem = document.createElement("div");
    hostItem.className = "fn__flex b3-label config-item";
    const hostTitle = document.createElement("div");
    hostTitle.className = "fn__flex-1";
    hostItem.append(hostTitle, debugControl);

    debugControl.classList.add("fn__size200", "fn__block");
    debugToggle.classList.add("fn__size200", "fn__block");
    setting.open("siyuan-doc-assist");

    expect(debugControl.classList.contains("fn__size200")).toBe(false);
    expect(debugControl.classList.contains("fn__block")).toBe(false);
    expect(debugToggle.classList.contains("fn__size200")).toBe(false);
    expect(debugToggle.classList.contains("fn__block")).toBe(false);
    expect(hostItem.classList.contains("doc-assistant-settings__host-row")).toBe(true);
    expect(hostTitle.querySelector(".b3-label__text")).toBeNull();
    expect(hostTitle.classList.contains("ariaLabel")).toBe(true);
    expect(hostTitle.getAttribute("aria-label")).toContain("transaction 明细日志");

    expect(isDocAssistantDebugEnabled()).toBe(false);
    expect(debugToggle.checked).toBe(false);

    debugToggle.checked = true;
    debugToggle.dispatchEvent(new Event("change"));
    await Promise.resolve();

    expect(plugin.debugLogEnabled).toBe(true);
    expect(isDocAssistantDebugEnabled()).toBe(true);
  });

  test("autoPasteOnSelect toggle controls floatingConfig state", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.onload();

    ALPHA_FEATURE_HIDE_CONFIG.hiddenSettingKeys = [];
    plugin.openSetting();

    const setting = settingInstances[1];
    const autoPasteItem = setting.items.find((item) => item.title === "浮窗命中文本直接粘贴");
    expect(autoPasteItem).toBeDefined();
    expect(autoPasteItem?.description).toBeUndefined();

    const control = autoPasteItem?.actionElement as HTMLElement;
    expect(control.classList.contains("doc-assistant-settings__autopaste-control")).toBe(true);
    const toggle = control.querySelector("input[type='checkbox']") as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    await Promise.resolve();

    expect(plugin.floatingConfig.autoPasteOnSelect).toBe(true);
  });

  test("startupDocProcessTabEnabled toggle controls startup doc process tab state and dock active tab", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.onload();

    const dockConfig = plugin.addDock.mock.calls[0]?.[0];
    const host = document.createElement("div");
    dockConfig?.init?.({ element: host });

    plugin.openSetting();

    const setting = settingInstances[1];
    const startupItem = setting.items.find((item) => item.title === "启动显示“文档处理”页签");
    expect(startupItem).toBeDefined();
    expect(startupItem?.description).toBeUndefined();

    const control = startupItem?.actionElement as HTMLElement;
    expect(control.classList.contains("doc-assistant-settings__startup-tab-control")).toBe(true);
    const toggle = control.querySelector("input[type='checkbox']") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(plugin.startupDocProcessTabEnabled).toBe(false);
    expect(plugin.keyInfoController.getActiveTab?.()).toBe("key-info");

    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    await Promise.resolve();

    expect(plugin.startupDocProcessTabEnabled).toBe(true);
    expect(plugin.keyInfoController.getActiveTab?.()).toBe("doc-process");

    // 模拟思源重启或首次打开侧栏加载 dock
    const host2 = document.createElement("div");
    dockConfig?.init?.({ element: host2 });
    expect(plugin.keyInfoController.getActiveTab?.()).toBe("doc-process");

    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    await Promise.resolve();

    expect(plugin.startupDocProcessTabEnabled).toBe(false);

    host.remove();
    host2.remove();
  });

  test("dynamicOutlineEnabled and followKeyInfo toggles control outline state and child switch disabled state", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.onload();

    ALPHA_FEATURE_HIDE_CONFIG.hiddenSettingKeys = [];
    plugin.openSetting();

    const setting = settingInstances[1];
    const islandItem = setting.items.find((item) => item.title === "灵动浮岛");

    expect(islandItem).toBeDefined();
    expect(islandItem?.direction).toBe("row");

    const panel = islandItem?.actionElement as HTMLElement;
    expect(panel.classList.contains("doc-assistant-settings__dynamic-outline-panel")).toBe(true);

    const sections = Array.from(
      panel.querySelectorAll("[data-setting-section]")
    ).map((el) => (el as HTMLElement).dataset.settingSection);
    expect(sections).toEqual([
      "dynamic-outline-enabled",
      "dynamic-outline-view-modes",
      "dynamic-outline-follow-key-info",
      "dynamic-outline-quick-switch"
    ]);

    const outlineToggle = panel.querySelector(
      'input[data-setting-key="dynamic-outline-enabled"]'
    ) as HTMLInputElement;
    const followToggle = panel.querySelector(
      'input[data-setting-key="dynamic-outline-follow-key-info"]'
    ) as HTMLInputElement;
    const quickSwitchToggle = panel.querySelector(
      'input[data-setting-key="dynamic-outline-quick-switch"]'
    ) as HTMLInputElement;
    const modeCheckboxes = Array.from(
      panel.querySelectorAll('input[data-view-mode]')
    ) as HTMLInputElement[];

    expect(outlineToggle.checked).toBe(false);
    expect(followToggle.checked).toBe(false);
    expect(followToggle.disabled).toBe(true);
    expect(quickSwitchToggle.checked).toBe(false);
    expect(quickSwitchToggle.disabled).toBe(true);
    expect(modeCheckboxes.every((box) => box.disabled)).toBe(true);

    outlineToggle.checked = true;
    outlineToggle.dispatchEvent(new Event("change"));
    await Promise.resolve();

    expect(plugin.dynamicOutlineEnabled).toBe(true);
    expect(followToggle.disabled).toBe(false);
    expect(quickSwitchToggle.disabled).toBe(false);
    expect(modeCheckboxes.every((box) => !box.disabled)).toBe(true);

    followToggle.checked = true;
    followToggle.dispatchEvent(new Event("change"));
    await Promise.resolve();

    expect(plugin.dynamicOutlineFollowKeyInfo).toBe(true);

    quickSwitchToggle.checked = true;
    quickSwitchToggle.dispatchEvent(new Event("change"));
    await Promise.resolve();

    expect(plugin.dynamicOutlineQuickSwitchEnabled).toBe(true);

    outlineToggle.checked = false;
    outlineToggle.dispatchEvent(new Event("change"));
    await Promise.resolve();

    expect(plugin.dynamicOutlineEnabled).toBe(false);
    expect(followToggle.disabled).toBe(true);
    expect(quickSwitchToggle.disabled).toBe(true);
    expect(modeCheckboxes.every((box) => box.disabled)).toBe(true);
  });

  test("renders settings items in the specified order: 启动显示..., 浮窗..., 灵动浮岛, 鼠标手势, 启用命令, AI服务, 调试模式", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.onload();

    ALPHA_FEATURE_HIDE_CONFIG.hiddenSettingKeys = [];
    plugin.openSetting();

    const setting = settingInstances[1];
    expect(setting.items.map((item) => item.title)).toEqual([
      "启动显示“文档处理”页签",
      "浮窗命中文本直接粘贴",
      "灵动浮岛",
      "鼠标手势",
      "启用命令",
      "AI 服务",
      "调试模式"
    ]);
  });

  test("gesture settings panel records new bindings, rejects conflicts and resets to defaults", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.onload();

    ALPHA_FEATURE_HIDE_CONFIG.hiddenSettingKeys = [];
    plugin.openSetting();

    const setting = settingInstances[1];
    const gestureItem = setting.items.find((item) => item.title === "鼠标手势");
    expect(gestureItem).toBeDefined();
    expect(gestureItem?.direction).toBe("row");
    const panel = gestureItem?.actionElement as HTMLElement;
    expect(panel.classList.contains("doc-assistant-settings__gesture-panel")).toBe(true);

    const masterToggle = panel.querySelector(
      '[data-setting-key="gesture-enabled"]'
    ) as HTMLInputElement;
    expect(masterToggle.checked).toBe(false);
    expect(plugin.mouseGestureEnabled).toBe(false);

    const recordButtons = Array.from(
      panel.querySelectorAll("button[data-gesture-record]")
    ) as HTMLInputElement[];
    expect(recordButtons).toHaveLength(3);
    // 默认关闭时配置区置灰
    expect(recordButtons.every((button) => button.disabled)).toBe(true);

    const previousRow = panel.querySelector(
      '[data-gesture-action="previous-doc"]'
    ) as HTMLElement;
    const previousSequence = previousRow.querySelector(
      "[data-gesture-sequence]"
    ) as HTMLElement;
    expect(previousSequence.textContent).toBe("←");

    // 开启总开关
    masterToggle.checked = true;
    masterToggle.dispatchEvent(new Event("change"));
    await Promise.resolve();
    expect(plugin.mouseGestureEnabled).toBe(true);
    expect(recordButtons.every((button) => !button.disabled)).toBe(true);

    // 录制：向上划 → 「切换上一个文档」绑定为非默认手势 ↑
    const recordButton = previousRow.querySelector(
      "button[data-gesture-record]"
    ) as HTMLButtonElement;
    recordButton.click();
    expect(recordButton.textContent).toContain("按住右键划动手势");

    const fireMouse = (type: string, x: number, y: number) => {
      document.dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true, button: 2, clientX: x, clientY: y })
      );
    };
    fireMouse("mousedown", 500, 500);
    fireMouse("mousemove", 502, 400);
    fireMouse("mouseup", 502, 390);
    await Promise.resolve();

    expect(plugin.mouseGestureBindings["previous-doc"]).toBe("U");
    expect(previousSequence.textContent).toBe("↑");

    // 冲突：给「切换下一个文档」录制 ↑（已被占用）→ 拒绝并提示，绑定保持不变
    const nextRow = panel.querySelector('[data-gesture-action="next-doc"]') as HTMLElement;
    const nextRecordButton = nextRow.querySelector(
      "button[data-gesture-record]"
    ) as HTMLButtonElement;
    nextRecordButton.click();
    fireMouse("mousedown", 500, 500);
    fireMouse("mousemove", 502, 400);
    fireMouse("mouseup", 502, 390);
    await Promise.resolve();

    expect(plugin.mouseGestureBindings["next-doc"]).toBe("R");
    expect(showMessageMock).toHaveBeenCalledWith(
      expect.stringContaining("已绑定"),
      4500,
      "error"
    );

    // 录制多段方向：给「切换下一个文档」绑定为 ←→
    nextRecordButton.click();
    fireMouse("mousedown", 500, 500);
    fireMouse("mousemove", 400, 500);
    fireMouse("mousemove", 500, 502);
    fireMouse("mouseup", 510, 502);
    await Promise.resolve();

    expect(plugin.mouseGestureBindings["next-doc"]).toBe("L,R");
    expect((nextRow.querySelector("[data-gesture-sequence]") as HTMLElement).textContent).toBe(
      "←→"
    );

    // 恢复默认手势
    const resetButton = panel.querySelector(
      "button[data-gesture-reset]"
    ) as HTMLButtonElement;
    resetButton.click();
    await Promise.resolve();
    expect(plugin.mouseGestureBindings).toEqual({
      "previous-doc": "L",
      "next-doc": "R",
      "close-current-doc": "D,R"
    });
    expect(previousSequence.textContent).toBe("←");
  });
});
