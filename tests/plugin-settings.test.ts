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
    expect(addIconsMock).toHaveBeenCalledTimes(1);
    expect(topBarConfigs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "文档助手",
          icon: "iconDocAssist",
        }),
      ])
    );

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

    const groupTitles = Array.from(
      menuRegistrationPanel.querySelectorAll(".doc-assistant-settings__menu-registration-group-title")
    ).map((element) => element.textContent?.trim());
    expect(groupTitles).toEqual(getExpectedGroupTitles());

    const firstGroupList = menuRegistrationPanel.querySelector(
      ".doc-assistant-settings__menu-registration-group-list"
    ) as HTMLElement;
    expect(firstGroupList.hidden).toBe(false);

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
      onToggleKeepNewDocAfterPinnedTabs: vi.fn(),
      onToggleAll: vi.fn(),
      onToggleSingle: vi.fn(),
    });

    const setting = settingInstances[0];
    const menuRegistrationPanel = setting.items[1]?.actionElement as HTMLElement;
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
});
