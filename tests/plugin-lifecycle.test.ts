/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getFrontend, showMessage } from "siyuan";

vi.mock("siyuan", () => {
  class Plugin {
    public name = "siyuan-doc-assist";
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
      }
    };

    async loadData(storageName: string): Promise<any> {
      return this.storage.get(storageName);
    }

    async saveData(storageName: string, content: any): Promise<void> {
      this.storage.set(storageName, content);
    }
  }

  class Setting {
    public readonly open = vi.fn();
    public readonly close = vi.fn();
    addItem(): void {}
  }

  return {
    Plugin,
    Setting,
    getFrontend: vi.fn(() => "desktop"),
    getActiveEditor: () => undefined,
    confirm: (_t: string, _m: string, yes?: () => void) => yes?.(),
    showMessage: vi.fn(),
    openTab: vi.fn(),
    getAllModels: vi.fn(() => ({ editor: [] }))
  };
});

describe("plugin lifecycle bridge and state orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFrontend).mockReturnValue("desktop");
    delete (window as any).siyuanApiSwitch;
  });

  afterEach(() => {
    delete (window as any).siyuanApiSwitch;
  });

  test("shows error message instead of rejecting when saveData fails", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.onload();

    plugin.saveData = vi.fn(async () => {
      throw new Error("disk full");
    });

    await expect(plugin.setDebugLogEnabled(true)).resolves.toBeUndefined();
    expect(vi.mocked(showMessage)).toHaveBeenCalledWith(
      "保存插件配置失败：disk full",
      5000,
      "error"
    );

    plugin.onunload();
  });

  test("registers deferred api-switch listener when missing and removes it on onunload", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.onload();

    expect(addSpy).toHaveBeenCalledWith(
      "siyuan-api-switch:ready",
      expect.any(Function),
      { once: true }
    );
    const registeredListener = addSpy.mock.calls.find(
      (call) => call[0] === "siyuan-api-switch:ready"
    )?.[1];

    plugin.onunload();
    expect(removeSpy).toHaveBeenCalledWith("siyuan-api-switch:ready", registeredListener);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  test("syncs managedAiConfig via window.siyuanApiSwitch and unregisters on onunload", async () => {
    const registerMock = vi.fn();
    const unregisterMock = vi.fn();
    (window as any).siyuanApiSwitch = {
      register: registerMock,
      unregister: unregisterMock
    };

    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.onload();

    expect(registerMock).toHaveBeenCalledTimes(1);
    const syncCallback = registerMock.mock.calls[0][2];
    const updateManagedSpy = vi.fn();
    plugin.setting.updateManagedConfig = updateManagedSpy;

    syncCallback({
      baseUrl: "https://proxy.example/v1",
      apiKey: "sk-shared",
      model: "gpt-4.1",
      protocol: "openai"
    });
    expect(plugin.managedAiConfig).toEqual(
      expect.objectContaining({
        enabled: true,
        baseUrl: "https://proxy.example/v1",
        apiKey: "sk-shared",
        model: "gpt-4.1",
        protocol: "openai"
      })
    );
    expect(updateManagedSpy).toHaveBeenCalledWith(plugin.managedAiConfig);

    syncCallback(null);
    expect(plugin.managedAiConfig).toBeNull();
    expect(updateManagedSpy).toHaveBeenCalledWith(null);

    plugin.onunload();
    expect(unregisterMock).toHaveBeenCalledWith(plugin.name);
  });

  test("starts and stops clipboardMonitor based on desktop mode, outline switch, and viewModes", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;
    await plugin.onload();

    const startSpy = vi.spyOn(plugin.clipboardMonitor, "start").mockResolvedValue(undefined);
    const stopSpy = vi.spyOn(plugin.clipboardMonitor, "stop").mockImplementation(() => {});

    // 仅开启灵动浮岛但默认未含 clipboard 模式 -> 不启动，调用 stop
    await plugin.setDynamicOutlineEnabled(true);
    expect(startSpy).not.toHaveBeenCalled();
    expect(stopSpy).toHaveBeenCalled();

    // 加入 clipboard 模式 -> 启动
    await plugin.setDynamicOutlineViewModes(["outline", "clipboard"]);
    expect(startSpy).toHaveBeenCalledTimes(1);

    // 移除 clipboard 模式 -> 停止
    stopSpy.mockClear();
    await plugin.setDynamicOutlineViewModes(["outline", "open-docs"]);
    expect(stopSpy).toHaveBeenCalledTimes(1);

    plugin.onunload();
  });

  test("aborts remaining onload setup if onunload runs during initial loadData and serializes saveData", async () => {
    const { default: DocLinkToolkitPlugin } = await import("@/plugin/plugin-lifecycle");
    const plugin = new DocLinkToolkitPlugin() as any;

    let releaseLoad!: (val: any) => void;
    plugin.loadData = vi.fn(
      () => new Promise((resolve) => {
        releaseLoad = resolve;
      })
    );
    const registerCommandsSpy = vi.spyOn(plugin, "addCommand");

    const loadPromise = plugin.onload();
    plugin.onunload();
    releaseLoad(undefined);
    await loadPromise;

    expect(registerCommandsSpy).not.toHaveBeenCalled();

    // Reload normally and verify concurrent saveData calls serialize in order.
    plugin.loadData = vi.fn().mockResolvedValue(undefined);
    await plugin.onload();

    const saveOrder: boolean[] = [];
    let releaseFirstSave!: () => void;
    plugin.saveData = vi
      .fn()
      .mockImplementationOnce((_name: string, payload: any) => {
        saveOrder.push(payload.debugLogEnabled);
        return new Promise<void>((resolve) => {
          releaseFirstSave = resolve;
        });
      })
      .mockImplementationOnce(async (_name: string, payload: any) => {
        saveOrder.push(payload.debugLogEnabled);
      });

    const p1 = plugin.setDebugLogEnabled(true);
    const p2 = plugin.setDebugLogEnabled(false);
    await Promise.resolve();
    expect(plugin.saveData).toHaveBeenCalledTimes(1);

    releaseFirstSave();
    await Promise.all([p1, p2]);
    expect(plugin.saveData).toHaveBeenCalledTimes(2);
    expect(saveOrder).toEqual([true, false]);

    plugin.onunload();
  });
});
