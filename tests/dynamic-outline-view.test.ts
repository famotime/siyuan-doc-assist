/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DynamicOutlineItem } from "@/core/dynamic-outline-core";
import { createDynamicOutlineView } from "@/ui/dynamic-outline/dynamic-outline-view";

describe("dynamic-outline-view", () => {
  let parent: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    parent = document.createElement("div");
    document.body.appendChild(parent);
  });

  afterEach(() => {
    vi.useRealTimers();
    parent.remove();
  });

  const mockItems: DynamicOutlineItem[] = [
    { id: "1", blockId: "b-1", text: "标题一", type: "title", level: 1, posRatio: 0.1, order: 1 },
    { id: "2", blockId: "b-2", text: "加粗重点", type: "bold", level: 0, posRatio: 0.5, order: 2 }
  ];

  test("renders minimap and empty message initially", () => {
    const handle = createDynamicOutlineView(parent, { onItemClick: vi.fn() });
    expect(parent.querySelector(".doc-assistant-dynamic-outline")).not.toBeNull();
    expect(parent.querySelector(".doc-assistant-dynamic-outline__minimap")).not.toBeNull();

    handle.setItems([], "文档大纲");
    expect(parent.querySelector(".doc-assistant-dynamic-outline__empty")).not.toBeNull();
    handle.destroy();
  });

  test("renders items and handles item clicks", () => {
    const onItemClick = vi.fn();
    const handle = createDynamicOutlineView(parent, { onItemClick });

    handle.setItems(mockItems, "大纲");
    const items = parent.querySelectorAll(".doc-assistant-dynamic-outline__item");
    expect(items).toHaveLength(2);

    (items[0] as HTMLElement).click();
    expect(onItemClick).toHaveBeenCalledWith(mockItems[0]);

    handle.destroy();
  });

  test("toggles pin state on pin button click", () => {
    const onPinChange = vi.fn();
    const handle = createDynamicOutlineView(parent, { onItemClick: vi.fn(), onPinChange });

    const pinBtn = parent.querySelector(".doc-assistant-dynamic-outline__pin-btn") as HTMLButtonElement;
    expect(pinBtn.classList.contains("is-pinned")).toBe(false);

    pinBtn.click();
    expect(pinBtn.classList.contains("is-pinned")).toBe(true);
    expect(onPinChange).toHaveBeenCalledWith(true);

    pinBtn.click();
    expect(pinBtn.classList.contains("is-pinned")).toBe(false);
    expect(onPinChange).toHaveBeenCalledWith(false);

    handle.destroy();
  });

  test("toggles position between left and right on switch button click", () => {
    const onTogglePosition = vi.fn();
    const handle = createDynamicOutlineView(parent, {
      position: "right",
      onItemClick: vi.fn(),
      onTogglePosition
    });

    const container = parent.querySelector(".doc-assistant-dynamic-outline") as HTMLElement;
    expect(container.classList.contains("is-right")).toBe(true);

    const switchBtn = parent.querySelector(".doc-assistant-dynamic-outline__switch-btn") as HTMLButtonElement;
    expect(switchBtn).not.toBeNull();

    switchBtn.click();
    expect(container.classList.contains("is-left")).toBe(true);
    expect(onTogglePosition).toHaveBeenCalledWith("left");

    switchBtn.click();
    expect(container.classList.contains("is-right")).toBe(true);
    expect(onTogglePosition).toHaveBeenCalledWith("right");

    handle.destroy();
  });

  test("handles mouse hover and delayed close", () => {
    const handle = createDynamicOutlineView(parent, { onItemClick: vi.fn() });
    const container = parent.querySelector(".doc-assistant-dynamic-outline") as HTMLElement;
    const flyout = parent.querySelector(".doc-assistant-dynamic-outline__flyout") as HTMLElement;

    container.dispatchEvent(new MouseEvent("mouseenter"));
    expect(flyout.classList.contains("is-open")).toBe(true);

    container.dispatchEvent(new MouseEvent("mouseleave"));
    expect(flyout.classList.contains("is-open")).toBe(true);

    vi.advanceTimersByTime(350);
    expect(flyout.classList.contains("is-open")).toBe(false);

    handle.destroy();
  });

  test("updates active item index", () => {
    const handle = createDynamicOutlineView(parent, { onItemClick: vi.fn() });
    handle.setItems(mockItems);

    handle.setActiveIndex(1);
    const items = parent.querySelectorAll(".doc-assistant-dynamic-outline__item");
    expect(items[0].classList.contains("is-active")).toBe(false);
    expect(items[1].classList.contains("is-active")).toBe(true);

    handle.destroy();
  });
});
