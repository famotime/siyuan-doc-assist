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

    // 第一个为标题 (level: 1)，不渲染类型徽章
    expect(items[0].querySelector(".doc-assistant-dynamic-outline__item-badge")).toBeNull();

    // 第二个为加粗 (level: 0, type: "bold")，在中文环境下徽章应显示为中文 "加粗"
    const badge = items[1].querySelector(".doc-assistant-dynamic-outline__item-badge") as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe("加粗");
    expect(badge.getAttribute("data-type")).toBe("bold");

    (items[0] as HTMLElement).click();
    expect(onItemClick).toHaveBeenCalledWith(mockItems[0]);

    handle.destroy();
  });

  test("renders badges in english when isZh is false", () => {
    const handle = createDynamicOutlineView(parent, {
      onItemClick: vi.fn(),
      isZh: false
    });

    const diverseItems: DynamicOutlineItem[] = [
      { id: "1", blockId: "b-1", text: "加粗", type: "bold", level: 0, posRatio: 0.1, order: 1 },
      { id: "2", blockId: "b-2", text: "高亮", type: "highlight", level: 0, posRatio: 0.2, order: 2 },
      { id: "3", blockId: "b-3", text: "备注", type: "remark", level: 0, posRatio: 0.3, order: 3 },
      { id: "4", blockId: "b-4", text: "代码", type: "code", level: 0, posRatio: 0.4, order: 4 }
    ];

    handle.setItems(diverseItems);
    const badges = parent.querySelectorAll(".doc-assistant-dynamic-outline__item-badge");
    expect(badges).toHaveLength(4);
    expect(badges[0].textContent).toBe("Bold");
    expect(badges[1].textContent).toBe("Highlight");
    expect(badges[2].textContent).toBe("Remark");
    expect(badges[3].textContent).toBe("Code");

    handle.destroy();
  });

  test("renders diverse badges in chinese in chinese interface", () => {
    const handle = createDynamicOutlineView(parent, {
      onItemClick: vi.fn(),
      isZh: true
    });

    const diverseItems: DynamicOutlineItem[] = [
      { id: "1", blockId: "b-1", text: "高亮内容", type: "highlight", level: 0, posRatio: 0.1, order: 1 },
      { id: "2", blockId: "b-2", text: "加粗重点", type: "bold", level: 0, posRatio: 0.2, order: 2 },
      { id: "3", blockId: "b-3", text: "备注信息", type: "remark", level: 0, posRatio: 0.3, order: 3 },
      { id: "4", blockId: "b-4", text: "代码块", type: "code", level: 0, posRatio: 0.4, order: 4 }
    ];

    handle.setItems(diverseItems);
    const badges = parent.querySelectorAll(".doc-assistant-dynamic-outline__item-badge");
    expect(badges).toHaveLength(4);
    expect(badges[0].textContent).toBe("高亮");
    expect(badges[1].textContent).toBe("加粗");
    expect(badges[2].textContent).toBe("备注");
    expect(badges[3].textContent).toBe("代码");

    handle.destroy();
  });

  test("updates viewport indicator position and height on scroll", () => {
    const handle = createDynamicOutlineView(parent, { onItemClick: vi.fn() });
    const viewport = parent.querySelector(".doc-assistant-dynamic-outline__viewport") as HTMLElement;
    expect(viewport).not.toBeNull();

    handle.setScroll(100, 1000, 500);
    expect(viewport.style.top).toBeTruthy();
    expect(viewport.style.height).toBeTruthy();

    handle.destroy();
  });

  test("renders jump to top and jump to bottom buttons and handles click", () => {
    const onJumpToTop = vi.fn();
    const onJumpToBottom = vi.fn();
    const handle = createDynamicOutlineView(parent, {
      onItemClick: vi.fn(),
      onJumpToTop,
      onJumpToBottom
    });

    const topBtn = parent.querySelector(".doc-assistant-dynamic-outline__top-btn") as HTMLButtonElement;
    const bottomBtn = parent.querySelector(".doc-assistant-dynamic-outline__bottom-btn") as HTMLButtonElement;

    expect(topBtn).not.toBeNull();
    expect(bottomBtn).not.toBeNull();
    expect(topBtn.getAttribute("title")).toBe("跳转到文档开头");
    expect(bottomBtn.getAttribute("title")).toBe("跳转到文档结尾");

    topBtn.click();
    expect(onJumpToTop).toHaveBeenCalledTimes(1);

    bottomBtn.click();
    expect(onJumpToBottom).toHaveBeenCalledTimes(1);

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
