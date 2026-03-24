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

function moveTabAfterAnchor(parent: { children: any[] }, tab: any, anchorId?: string) {
  const currentIndex = parent.children.indexOf(tab);
  if (currentIndex >= 0) {
    parent.children.splice(currentIndex, 1);
  }
  if (!anchorId) {
    parent.children.push(tab);
    return;
  }
  const anchorIndex = parent.children.findIndex((item) => item.id === anchorId);
  if (anchorIndex < 0) {
    parent.children.push(tab);
    return;
  }
  parent.children.splice(anchorIndex + 1, 0, tab);
}

function moveTabBeforeNextId(parent: { children: any[] }, tab: any, nextId?: string) {
  const currentIndex = parent.children.indexOf(tab);
  if (currentIndex >= 0) {
    parent.children.splice(currentIndex, 1);
  }
  if (!nextId) {
    parent.children.push(tab);
    return;
  }
  const nextIndex = parent.children.findIndex((item) => item.id === nextId);
  if (nextIndex < 0) {
    parent.children.push(tab);
    return;
  }
  parent.children.splice(nextIndex, 0, tab);
}

describe("plugin tab placement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    delete (window as any).siyuan;
  });

  test("moves newly opened doc tab behind pinned tabs when setting is enabled", async () => {
    const pinnedTab = buildTab("pinned", true);
    const oldTab = buildTab("doc-old");
    const newTab = buildTab("doc-new");
    const parent = {
      children: [pinnedTab, oldTab, newTab] as any[],
      moveTab: vi.fn((tab: any, nextId?: string) => {
        moveTabBeforeNextId(parent, tab, nextId);
      }),
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

    expect(parent.children.map((tab) => tab.id)).toEqual(["pinned", "doc-new", "doc-old"]);
  });

  test("keeps pinned tab headers visible when opening a new doc tab", async () => {
    const pinnedTab = buildTab("pinned", true);
    const oldTab = buildTab("doc-old");
    const newTab = buildTab("doc-new");
    const tabStrip = document.createElement("div");
    tabStrip.scrollLeft = 240;
    const scrollIntoView = vi.fn();
    (pinnedTab.headElement as any).scrollIntoView = scrollIntoView;
    tabStrip.appendChild(pinnedTab.headElement);
    tabStrip.appendChild(oldTab.headElement);
    tabStrip.appendChild(newTab.headElement);
    const parent = {
      children: [pinnedTab, oldTab, newTab] as any[],
      moveTab: vi.fn((tab: any, nextId?: string) => {
        moveTabBeforeNextId(parent, tab, nextId);
      }),
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

    expect(parent.children.map((tab) => tab.id)).toEqual(["pinned", "doc-new", "doc-old"]);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "start",
    });
  });

  test("re-applies pinned tab visibility after later auto-scroll pushes it out of view", async () => {
    vi.useFakeTimers();

    const pinnedTab = buildTab("pinned", true);
    const oldTab = buildTab("doc-old");
    const newTab = buildTab("doc-new");
    const tabStrip = document.createElement("div");
    tabStrip.scrollLeft = 240;
    (pinnedTab.headElement as any).scrollIntoView = vi.fn(() => {
      tabStrip.scrollLeft = 0;
    });
    tabStrip.appendChild(pinnedTab.headElement);
    tabStrip.appendChild(oldTab.headElement);
    tabStrip.appendChild(newTab.headElement);
    const parent = {
      children: [pinnedTab, oldTab, newTab] as any[],
      moveTab: vi.fn((tab: any, nextId?: string) => {
        moveTabBeforeNextId(parent, tab, nextId);
      }),
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

    setTimeout(() => {
      tabStrip.scrollLeft = 240;
    }, 0);

    await vi.runAllTimersAsync();

    expect(tabStrip.scrollLeft).toBe(0);
  });

  test("retries moving a newly opened doc tab after the tab list catches up", async () => {
    vi.useFakeTimers();

    const pinnedTab = buildTab("pinned", true);
    const oldTab = buildTab("doc-old");
    const newTab = buildTab("doc-new");
    const parent = {
      children: [pinnedTab, oldTab] as any[],
      moveTab: vi.fn((tab: any, nextId?: string) => {
        moveTabBeforeNextId(parent, tab, nextId);
      }),
    };
    const moveTab = parent.moveTab;
    (pinnedTab as any).parent = parent;
    (oldTab as any).parent = parent;
    (newTab as any).parent = parent;
    (window as any).siyuan = {
      layout: {
        centerLayout: {
          children: [
            {
              children: [pinnedTab, oldTab],
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

    expect(moveTab).not.toHaveBeenCalled();

    parent.children = [pinnedTab, oldTab, newTab];
    await vi.runAllTimersAsync();

    expect(parent.children.map((tab) => tab.id)).toEqual(["pinned", "doc-new", "doc-old"]);
  });

  test("does not pass a pinned tab id into moveTab", async () => {
    const pinnedTab = buildTab("pinned", true);
    const oldTab = buildTab("doc-old");
    const newTab = buildTab("doc-new");
    const parent = {
      children: [pinnedTab, oldTab, newTab] as any[],
      moveTab: vi.fn((tab: any, nextId?: string) => {
        if (nextId === "pinned") {
          throw new Error("unexpected pinned anchor");
        }
        moveTabBeforeNextId(parent, tab, nextId);
      }),
    };
    (pinnedTab as any).parent = parent;
    (oldTab as any).parent = parent;
    (newTab as any).parent = parent;
    (window as any).siyuan = {
      layout: {
        centerLayout: {
          children: [
            {
              children: [pinnedTab, oldTab],
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

    expect(parent.children.map((tab) => tab.id)).toEqual(["pinned", "doc-new", "doc-old"]);
    expect(parent.moveTab).toHaveBeenCalledWith(newTab, "doc-old");
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
