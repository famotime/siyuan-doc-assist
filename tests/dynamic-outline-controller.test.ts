/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, vi, test } from "vitest";
import {
  DynamicOutlineController,
  DynamicOutlineControllerDeps
} from "@/plugin/dynamic-outline-controller";
import { KeyInfoItem } from "@/core/key-info-core";

describe("dynamic-outline-controller", () => {
  let deps: DynamicOutlineControllerDeps;
  let mockProtyleEl: HTMLDivElement;
  let configState = { enabled: true, followKeyInfo: false, position: "right" as const };

  const mockItems: KeyInfoItem[] = [
    { id: "1", blockId: "b-1", text: "标题1", raw: "# 标题1", type: "title", order: 10 },
    { id: "2", blockId: "b-2", text: "重点2", raw: "**重点2**", type: "bold", order: 20 }
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    mockProtyleEl = document.createElement("div");
    mockProtyleEl.className = "protyle";
    const content = document.createElement("div");
    content.className = "protyle-content";
    const wysiwyg = document.createElement("div");
    wysiwyg.className = "protyle-wysiwyg";
    content.appendChild(wysiwyg);
    mockProtyleEl.appendChild(content);
    document.body.appendChild(mockProtyleEl);

    configState = { enabled: true, followKeyInfo: false, position: "right" as const };

    deps = {
      isMobile: vi.fn().mockReturnValue(false),
      getCurrentDocId: vi.fn().mockReturnValue("doc-123"),
      getCurrentProtyle: vi.fn().mockReturnValue({ element: mockProtyleEl }),
      getKeyInfoFilter: vi.fn().mockReturnValue(undefined),
      fetchDocKeyInfo: vi.fn().mockResolvedValue({ items: mockItems }),
      navigateBlock: vi.fn(),
      getConfig: () => ({ ...configState })
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    mockProtyleEl.remove();
  });

  test("does not mount if disabled", () => {
    configState.enabled = false;
    const controller = new DynamicOutlineController(deps);
    controller.syncActiveEditor();

    expect(mockProtyleEl.querySelector(".doc-assistant-dynamic-outline")).toBeNull();
    controller.destroy();
  });

  test("does not mount on mobile", () => {
    (deps.isMobile as any).mockReturnValue(true);
    const controller = new DynamicOutlineController(deps);
    controller.syncActiveEditor();

    expect(mockProtyleEl.querySelector(".doc-assistant-dynamic-outline")).toBeNull();
    controller.destroy();
  });

  test("mounts on protyle and loads outline items", async () => {
    const controller = new DynamicOutlineController(deps);
    controller.syncActiveEditor();

    expect(mockProtyleEl.querySelector(".doc-assistant-dynamic-outline")).not.toBeNull();

    // 等待异步数据加载
    await vi.waitFor(() => {
      const items = mockProtyleEl.querySelectorAll(".doc-assistant-dynamic-outline__item");
      expect(items.length).toBe(1); // 默认 followKeyInfo 为 false，仅标题
    });

    controller.destroy();
  });

  test("loads all items when followKeyInfo is true", async () => {
    configState.followKeyInfo = true;
    const controller = new DynamicOutlineController(deps);
    controller.syncActiveEditor();

    await vi.waitFor(() => {
      const items = mockProtyleEl.querySelectorAll(".doc-assistant-dynamic-outline__item");
      expect(items.length).toBe(2);
    });

    controller.destroy();
  });

  test("navigates block when outline item clicked", async () => {
    const controller = new DynamicOutlineController(deps);
    controller.syncActiveEditor();

    await vi.waitFor(() => {
      const itemEl = mockProtyleEl.querySelector(".doc-assistant-dynamic-outline__item") as HTMLElement;
      expect(itemEl).not.toBeNull();
      itemEl.click();
      expect(deps.navigateBlock).toHaveBeenCalledWith("b-1", expect.anything());
    });

    controller.destroy();
  });

  test("debounces document edit notification", async () => {
    const controller = new DynamicOutlineController(deps);
    controller.syncActiveEditor();

    await vi.waitFor(() => {
      expect(deps.fetchDocKeyInfo).toHaveBeenCalledTimes(1);
    });

    controller.notifyDocEdited();
    controller.notifyDocEdited();
    expect(deps.fetchDocKeyInfo).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1550);
    expect(deps.fetchDocKeyInfo).toHaveBeenCalledTimes(2);

    controller.destroy();
  });

  test("toggles outline position via controller deps", async () => {
    const setPosition = vi.fn();
    deps.setPosition = setPosition;

    const controller = new DynamicOutlineController(deps);
    controller.syncActiveEditor();

    await vi.waitFor(() => {
      const switchBtn = mockProtyleEl.querySelector(".doc-assistant-dynamic-outline__switch-btn") as HTMLButtonElement;
      expect(switchBtn).not.toBeNull();
      switchBtn.click();
      expect(setPosition).toHaveBeenCalledWith("left");
    });

    controller.destroy();
  });
});
