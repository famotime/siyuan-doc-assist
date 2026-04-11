/** @vitest-environment jsdom */

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  buildDefaultDocActionOrder,
  buildDefaultDocMenuRegistration,
} from "@/core/doc-menu-registration-core";
import { ACTIONS } from "@/plugin/actions";
import { showMessage } from "siyuan";

vi.mock("siyuan", () => {
  class Plugin {
    public readonly listeners = new Map<string, Set<(event: any) => void>>();
    public readonly storage = new Map<string, any>();
    public readonly addDock = vi.fn();
    public readonly addCommand = vi.fn();
    public readonly addTopBar = vi.fn(() => document.createElement("div"));
    public readonly addIcons = vi.fn();

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
      description?: string;
      actionElement: HTMLElement;
    }> = [];
    public readonly open = vi.fn();

    addItem(options: {
      title: string;
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
    showMessage: vi.fn(),
  };
});

const showMessageMock = vi.mocked(showMessage);

describe("plugin menu registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("does not register actions in title menu by default", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.onload();

    const menu = { addSeparator: vi.fn(), addItem: vi.fn() };
    plugin.emitEvent("click-editortitleicon", { menu, data: { id: "doc-1" } });

    expect(menu.addSeparator).not.toHaveBeenCalled();
    expect(menu.addItem).not.toHaveBeenCalled();
  });

  test("does not register disabled single action to title menu", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.onload();
    await plugin.setAllDocMenuRegistration(true);
    await plugin.setSingleDocMenuRegistration("export-current", false);

    const menu = { addSeparator: vi.fn(), addItem: vi.fn() };
    plugin.emitEvent("click-editortitleicon", { menu, data: { id: "doc-1" } });

    expect(menu.addItem).toHaveBeenCalledTimes(ACTIONS.length - 1);
    expect(menu.addItem).not.toHaveBeenCalledWith(
      expect.objectContaining({ label: "仅导出当前文档" })
    );
  });

  test("does not insert separator when all menu actions are disabled", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.onload();
    await plugin.setAllDocMenuRegistration(false);

    const menu = { addSeparator: vi.fn(), addItem: vi.fn() };
    plugin.emitEvent("click-editortitleicon", { menu, data: { id: "doc-1" } });

    expect(menu.addSeparator).not.toHaveBeenCalled();
    expect(menu.addItem).not.toHaveBeenCalled();
  });

  test("restores menu registration state from plugin data", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.saveData("doc-menu-registration", {
      version: 1,
      actionEnabled: {
        "export-current": false,
        "insert-backlinks": true,
      },
    });
    await plugin.onload();

    const menu = { addSeparator: vi.fn(), addItem: vi.fn() };
    plugin.emitEvent("click-editortitleicon", { menu, data: { id: "doc-1" } });

    expect(menu.addItem).not.toHaveBeenCalledWith(
      expect.objectContaining({ label: "仅导出当前文档" })
    );
    expect(menu.addItem).toHaveBeenCalledTimes(1);
  });

  test("restores custom action order from plugin data", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.saveData("doc-menu-registration", {
      version: 1,
      actionEnabled: {
        "insert-backlinks": true,
        "export-current": true,
      },
      actionOrder: ["insert-backlinks", "export-current"],
    });
    await plugin.onload();

    const menu = { addSeparator: vi.fn(), addItem: vi.fn() };
    plugin.emitEvent("click-editortitleicon", { menu, data: { id: "doc-1" } });

    const firstLabel = menu.addItem.mock.calls[0]?.[0]?.label;
    const secondLabel = menu.addItem.mock.calls[1]?.[0]?.label;
    expect(firstLabel).toBe("插入反链文档列表（去重）");
    expect(secondLabel).toBe("仅导出当前文档");
  });

  test("falls back to default menu state when stored data cannot be loaded", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    vi.spyOn(plugin, "loadData").mockRejectedValue(new Error("storage offline"));

    await plugin.onload();

    expect(plugin.docMenuRegistrationState).toEqual(buildDefaultDocMenuRegistration(ACTIONS));
    expect(plugin.docActionOrderState).toEqual(buildDefaultDocActionOrder(ACTIONS));
    expect(plugin.docFavoriteActionKeys).toEqual([]);
    expect(showMessageMock).toHaveBeenCalledWith(
      "读取菜单注册配置失败：storage offline",
      5000,
      "error"
    );
  });

  test("registers commands using normalized action order from plugin data", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.saveData("doc-menu-registration", {
      version: 1,
      actionEnabled: {},
      actionOrder: ["insert-backlinks", "export-current"],
    });

    await plugin.onload();

    const commandLangKeys = plugin.addCommand.mock.calls.map((call: any[]) => call[0]?.langKey);
    expect(commandLangKeys[0]).toBe("docLinkToolkit.insert-backlinks");
    expect(commandLangKeys[1]).toBe("docLinkToolkit.export-current");
    expect(commandLangKeys).toHaveLength(ACTIONS.length);
  });

  test("persists state when toggling single action", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    const saveSpy = vi.spyOn(plugin, "saveData");
    await plugin.onload();

    await plugin.setSingleDocMenuRegistration("insert-backlinks", false);

    expect(saveSpy).toHaveBeenCalledWith(
      "doc-menu-registration",
      expect.objectContaining({
        version: 1,
        actionEnabled: expect.objectContaining({
          "insert-backlinks": false,
        }),
      })
    );
  });

  test("restores favorite actions from plugin data", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.saveData("doc-menu-registration", {
      version: 1,
      actionEnabled: {},
      favoriteActionKeys: ["insert-backlinks", "invalid-key"],
    });
    await plugin.onload();

    expect(plugin.docFavoriteActionKeys).toEqual(["insert-backlinks"]);
  });

  test("persists favorite action changes", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    const saveSpy = vi.spyOn(plugin, "saveData");
    await plugin.onload();

    await plugin.setDocActionFavorite("insert-backlinks", true);

    expect(saveSpy).toHaveBeenCalledWith(
      "doc-menu-registration",
      expect.objectContaining({
        version: 1,
        favoriteActionKeys: expect.arrayContaining(["insert-backlinks"]),
      })
    );
  });

  test("persists favorite action order changes", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    const saveSpy = vi.spyOn(plugin, "saveData");
    await plugin.onload();
    await plugin.setDocActionFavorite("export-current", true);
    await plugin.setDocActionFavorite("insert-backlinks", true);

    await plugin.setDocFavoriteActionOrder(["insert-backlinks", "export-current"]);

    expect(saveSpy).toHaveBeenCalledWith(
      "doc-menu-registration",
      expect.objectContaining({
        version: 1,
        favoriteActionKeys: ["insert-backlinks", "export-current"],
      })
    );
  });

  test("persists key info filter changes and restores them on next load", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.onload();

    await plugin.setKeyInfoFilter(["bold", "highlight"]);

    const stored = await plugin.loadData("doc-menu-registration");
    expect(stored).toEqual(
      expect.objectContaining({
        version: 1,
        keyInfoFilter: ["bold", "highlight"],
      })
    );

    const reloadedPlugin = new DocLinkToolkitPlugin() as any;
    await reloadedPlugin.saveData("doc-menu-registration", stored);

    await reloadedPlugin.onload();

    expect(reloadedPlugin.keyInfoFilterState).toEqual(["bold", "highlight"]);
  });

  test("unbinds lifecycle event listeners on unload", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.onload();

    expect(plugin.listeners.get("switch-protyle")?.size ?? 0).toBe(1);
    expect(plugin.listeners.get("click-editortitleicon")?.size ?? 0).toBe(1);

    plugin.onunload();

    expect(plugin.listeners.get("switch-protyle")?.size ?? 0).toBe(0);
    expect(plugin.listeners.get("click-editortitleicon")?.size ?? 0).toBe(0);
  });

  test("hides alpha actions from commands and editor title menu when configured", async () => {
    const { ALPHA_FEATURE_HIDE_CONFIG } = await import("@/plugin/alpha-feature-config");
    ALPHA_FEATURE_HIDE_CONFIG.hiddenActionKeys = ["create-monthly-diary"];
    ALPHA_FEATURE_HIDE_CONFIG.hiddenSettingKeys = [];

    try {
      const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
      const plugin = new DocLinkToolkitPlugin() as any;
      await plugin.onload();
      await plugin.setAllDocMenuRegistration(true);

      const commandLangKeys = plugin.addCommand.mock.calls.map((call: any[]) => call[0]?.langKey);
      expect(commandLangKeys).not.toContain("docLinkToolkit.create-monthly-diary");
      expect(commandLangKeys).toHaveLength(ACTIONS.length - 1);

      const menu = { addSeparator: vi.fn(), addItem: vi.fn() };
      plugin.emitEvent("click-editortitleicon", { menu, data: { id: "doc-1" } });

      const labels = menu.addItem.mock.calls.map((call: any[]) => call[0]?.label);
      expect(labels).not.toContain("新建本月日记");
    } finally {
      ALPHA_FEATURE_HIDE_CONFIG.hiddenActionKeys = [];
      ALPHA_FEATURE_HIDE_CONFIG.hiddenSettingKeys = [];
    }
  });

  test("exposes a power-buttons integration provider from the plugin instance", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;

    await plugin.onload();

    const provider = plugin.getPowerButtonsIntegration?.();

    expect(provider).toEqual(expect.objectContaining({
      protocol: "power-buttons-command-provider",
      protocolVersion: 1,
      providerId: "siyuan-doc-assist",
    }));
    expect(await provider.listCommands()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "insert-doc-summary" }),
      ]),
    );
  });
});
