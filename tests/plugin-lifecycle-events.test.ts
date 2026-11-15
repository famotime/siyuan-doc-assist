import { describe, expect, vi, test } from "vitest";
import {
  bindPluginLifecycleEvents,
  unbindPluginLifecycleEvents
} from "@/plugin/plugin-lifecycle-events";

describe("plugin-lifecycle-events", () => {
  test("binds click-blockicon handler to event bus", () => {
    const onMap: Record<string, (...args: unknown[]) => void> = {};
    const mockBus = {
      on: vi.fn((name: string, handler: any) => {
        onMap[name] = handler;
      }),
      off: vi.fn()
    };

    const handlers = {
      onSwitchProtyle: vi.fn(),
      onEditorTitleMenu: vi.fn(),
      onContentMenu: vi.fn(),
      onDocTreeMenu: vi.fn(),
      onBlockIconMenu: vi.fn()
    };

    bindPluginLifecycleEvents(mockBus, handlers);

    expect(mockBus.on).toHaveBeenCalledWith("switch-protyle", handlers.onSwitchProtyle);
    expect(mockBus.on).toHaveBeenCalledWith("click-editortitleicon", handlers.onEditorTitleMenu);
    expect(mockBus.on).toHaveBeenCalledWith("open-menu-content", handlers.onContentMenu);
    expect(mockBus.on).toHaveBeenCalledWith("open-menu-doctree", handlers.onDocTreeMenu);
    expect(mockBus.on).toHaveBeenCalledWith("click-blockicon", handlers.onBlockIconMenu);
  });

  test("unbinds click-blockicon handler from event bus", () => {
    const mockBus = {
      on: vi.fn(),
      off: vi.fn()
    };

    const handlers = {
      onSwitchProtyle: vi.fn(),
      onEditorTitleMenu: vi.fn(),
      onContentMenu: vi.fn(),
      onDocTreeMenu: vi.fn(),
      onBlockIconMenu: vi.fn()
    };

    unbindPluginLifecycleEvents(mockBus, handlers);

    expect(mockBus.off).toHaveBeenCalledWith("switch-protyle", handlers.onSwitchProtyle);
    expect(mockBus.off).toHaveBeenCalledWith("click-editortitleicon", handlers.onEditorTitleMenu);
    expect(mockBus.off).toHaveBeenCalledWith("open-menu-content", handlers.onContentMenu);
    expect(mockBus.off).toHaveBeenCalledWith("open-menu-doctree", handlers.onDocTreeMenu);
    expect(mockBus.off).toHaveBeenCalledWith("click-blockicon", handlers.onBlockIconMenu);
  });
});
