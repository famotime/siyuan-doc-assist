/** @vitest-environment jsdom */

import { beforeEach, describe, expect, test, vi } from "vitest";

const { showMessageMock } = vi.hoisted(() => ({
  showMessageMock: vi.fn(),
}));

vi.mock("siyuan", () => {
  class Plugin {
    public readonly storage = new Map<string, any>();
    public readonly listeners = new Map<string, Set<(event: any) => void>>();
    public readonly addDock = vi.fn();
    public readonly addCommand = vi.fn();
    public readonly name = "siyuan-doc-assist";

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
  }

  class Setting {
    addItem() {}
    open() {}
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

function buildTab(id: string, pin = false) {
  return {
    id,
    pin,
    headElement: document.createElement("div"),
  };
}

describe("plugin tab placement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).siyuan;
  });

  test("moves newly opened doc tab behind pinned tabs when setting is enabled", async () => {
    const pinnedTab = buildTab("pinned", true);
    const oldTab = buildTab("doc-old");
    const newTab = buildTab("doc-new");
    const moveTab = vi.fn();
    const parent = {
      children: [pinnedTab, oldTab, newTab],
      moveTab,
    };
    (pinnedTab as any).parent = parent;
    (oldTab as any).parent = parent;
    (newTab as any).parent = parent;
    (window as any).siyuan = {
      layout: {
        centerLayout: {
          children: [
            {
              children: [
                pinnedTab,
                oldTab,
              ],
            },
          ],
        },
      },
    };

    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.saveData("doc-menu-registration", {
      version: 1,
      actionEnabled: {},
      keepNewDocAfterPinnedTabs: true,
    });
    await plugin.onload();

    plugin.emitEvent("switch-protyle", {
      protyle: {
        block: { rootID: "doc-new" },
        model: {
          parent: newTab,
        },
      },
    });

    expect(moveTab).toHaveBeenCalledTimes(1);
    expect(moveTab).toHaveBeenCalledWith(newTab, "doc-old");
  });

  test("does not move an already existing tab when switching to it", async () => {
    const pinnedTab = buildTab("pinned", true);
    const existingTab = buildTab("doc-old");
    const moveTab = vi.fn();
    const parent = {
      children: [pinnedTab, existingTab],
      moveTab,
    };
    (pinnedTab as any).parent = parent;
    (existingTab as any).parent = parent;
    (window as any).siyuan = {
      layout: {
        centerLayout: {
          children: [
            {
              children: [pinnedTab, existingTab],
            },
          ],
        },
      },
    };

    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.saveData("doc-menu-registration", {
      version: 1,
      actionEnabled: {},
      keepNewDocAfterPinnedTabs: true,
    });
    await plugin.onload();

    plugin.emitEvent("switch-protyle", {
      protyle: {
        block: { rootID: "doc-old" },
        model: {
          parent: existingTab,
        },
      },
    });

    expect(moveTab).not.toHaveBeenCalled();
  });
});
