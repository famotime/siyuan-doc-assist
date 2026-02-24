import { beforeEach, describe, expect, test, vi } from "vitest";
import { ACTIONS } from "@/plugin/actions";

vi.mock("siyuan", () => {
  class Plugin {
    public readonly listeners = new Map<string, Set<(event: any) => void>>();
    public readonly storage = new Map<string, any>();
    public readonly addDock = vi.fn();
    public readonly addCommand = vi.fn();

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

  return {
    Plugin,
    getFrontend: () => "desktop",
    getActiveEditor: () => undefined,
    confirm: (_title: string, _text: string, yes?: () => void) => {
      yes?.();
    },
    showMessage: vi.fn(),
  };
});

describe("plugin menu registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("registers all actions in title menu by default", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.onload();

    const menu = { addSeparator: vi.fn(), addItem: vi.fn() };
    plugin.emitEvent("click-editortitleicon", { menu, data: { id: "doc-1" } });

    expect(menu.addSeparator).toHaveBeenCalledTimes(1);
    expect(menu.addItem).toHaveBeenCalledTimes(ACTIONS.length);
  });

  test("does not register disabled single action to title menu", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.onload();
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
      },
    });
    await plugin.onload();

    const menu = { addSeparator: vi.fn(), addItem: vi.fn() };
    plugin.emitEvent("click-editortitleicon", { menu, data: { id: "doc-1" } });

    expect(menu.addItem).not.toHaveBeenCalledWith(
      expect.objectContaining({ label: "仅导出当前文档" })
    );
    expect(menu.addItem).toHaveBeenCalledTimes(ACTIONS.length - 1);
  });

  test("restores custom action order from plugin data", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.saveData("doc-menu-registration", {
      version: 1,
      actionEnabled: {},
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
});
