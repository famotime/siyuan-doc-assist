/** @vitest-environment jsdom */

import { beforeEach, describe, expect, test, vi } from "vitest";
import { ACTIONS } from "@/plugin/actions";
import { buildDefaultDocMenuRegistration } from "@/core/doc-menu-registration-core";
import { buildDockDocActions } from "@/core/dock-panel-core";

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
    expect(setting.items[1]?.title).toBe("AI 服务");
    expect(setting.items[2]?.title).toBe("注册命令到文档菜单");
    expect(setting.items[2]?.direction).toBe("column");
    expect(setting.items).toHaveLength(3);

    const tabToggle = setting.items[0]?.actionElement as HTMLInputElement;
    expect(tabToggle.type).toBe("checkbox");
    expect(tabToggle.checked).toBe(false);

    const aiSettingsPanel = setting.items[1]?.actionElement as HTMLElement;
    const aiEnabledToggle = aiSettingsPanel.querySelector(
      "[data-setting-key='ai-enabled']"
    ) as HTMLInputElement;
    const aiBaseUrlInput = aiSettingsPanel.querySelector(
      "[data-setting-key='ai-base-url']"
    ) as HTMLInputElement;
    const aiApiKeyInput = aiSettingsPanel.querySelector(
      "[data-setting-key='ai-api-key']"
    ) as HTMLInputElement;
    const aiModelInput = aiSettingsPanel.querySelector(
      "[data-setting-key='ai-model']"
    ) as HTMLInputElement;
    const aiTimeoutInput = aiSettingsPanel.querySelector(
      "[data-setting-key='ai-timeout-seconds']"
    ) as HTMLInputElement;
    const aiFields = aiSettingsPanel.querySelector(
      "[data-setting-section='ai-fields']"
    ) as HTMLElement;
    const aiCollapseButton = aiSettingsPanel.querySelector(
      "[data-setting-collapse='ai-fields']"
    ) as HTMLButtonElement;
    expect(aiEnabledToggle.checked).toBe(false);
    expect(aiBaseUrlInput.value).toBe("");
    expect(aiApiKeyInput.value).toBe("");
    expect(aiModelInput.value).toBe("");
    expect(aiTimeoutInput.value).toBe("30");
    expect(aiFields.hidden).toBe(false);
    expect(aiCollapseButton.getAttribute("aria-expanded")).toBe("true");
    expect(
      aiCollapseButton.querySelector(".doc-assistant-settings__collapse-button-label")?.textContent
    ).toBe("收起");
    expect(aiCollapseButton.parentElement?.lastElementChild).toBe(aiCollapseButton);

    const menuRegistrationPanel = setting.items[2]?.actionElement as HTMLElement;
    expect(menuRegistrationPanel.classList.contains("doc-assistant-settings__menu-registration")).toBe(
      true
    );

    const groupTitles = Array.from(
      menuRegistrationPanel.querySelectorAll(".doc-assistant-settings__menu-registration-group-title")
    ).map((element) => element.textContent?.trim());
    expect(groupTitles).toEqual(getExpectedGroupTitles());

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
    expect(menuActionRows).toHaveLength(ACTIONS.length);

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

    aiCollapseButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(aiFields.hidden).toBe(true);
    expect(aiCollapseButton.getAttribute("aria-expanded")).toBe("false");
    expect(
      aiCollapseButton.querySelector(".doc-assistant-settings__collapse-button-label")?.textContent
    ).toBe("展开");

    aiCollapseButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(aiFields.hidden).toBe(false);
    expect(aiCollapseButton.getAttribute("aria-expanded")).toBe("true");
    expect(
      aiCollapseButton.querySelector(".doc-assistant-settings__collapse-button-label")?.textContent
    ).toBe("收起");

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
    const aiSettingsPanel = setting.items[1]?.actionElement as HTMLElement;
    const aiEnabledToggle = aiSettingsPanel.querySelector(
      "[data-setting-key='ai-enabled']"
    ) as HTMLInputElement;
    const aiBaseUrlInput = aiSettingsPanel.querySelector(
      "[data-setting-key='ai-base-url']"
    ) as HTMLInputElement;
    const aiApiKeyInput = aiSettingsPanel.querySelector(
      "[data-setting-key='ai-api-key']"
    ) as HTMLInputElement;
    const aiModelInput = aiSettingsPanel.querySelector(
      "[data-setting-key='ai-model']"
    ) as HTMLInputElement;
    const aiTimeoutInput = aiSettingsPanel.querySelector(
      "[data-setting-key='ai-timeout-seconds']"
    ) as HTMLInputElement;
    const menuRegistrationPanel = setting.items[2]?.actionElement as HTMLElement;
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

    aiEnabledToggle.checked = true;
    aiEnabledToggle.dispatchEvent(new Event("change"));
    await Promise.resolve();

    aiBaseUrlInput.value = "https://api.example.com/v1";
    aiBaseUrlInput.dispatchEvent(new Event("change"));
    await Promise.resolve();

    aiApiKeyInput.value = "sk-test";
    aiApiKeyInput.dispatchEvent(new Event("change"));
    await Promise.resolve();

    aiModelInput.value = "gpt-4.1-mini";
    aiModelInput.dispatchEvent(new Event("change"));
    await Promise.resolve();

    aiTimeoutInput.value = "45";
    aiTimeoutInput.dispatchEvent(new Event("change"));
    await Promise.resolve();

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
        aiSummaryConfig: expect.objectContaining({
          enabled: true,
          baseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          model: "gpt-4.1-mini",
          requestTimeoutSeconds: 45,
        }),
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
      onAiSummaryConfigChange: vi.fn(),
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
      onAiSummaryConfigChange: vi.fn(),
      onToggleKeepNewDocAfterPinnedTabs: vi.fn(),
      onToggleAll: vi.fn(),
      onToggleSingle: vi.fn(),
    });

    const aiPanel = setting.items[1]?.actionElement as HTMLElement;
    const menuRegistrationPanel = setting.items[2]?.actionElement as HTMLElement;
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
});
