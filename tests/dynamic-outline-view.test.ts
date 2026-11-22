/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DynamicOutlineItem, OpenDocTabItem, RecentDocItem } from "@/core/dynamic-outline-core";
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

  test("keeps outline flyout visible when mouse leaves during input focus or IME composition", () => {
    const handle = createDynamicOutlineView(parent, { onItemClick: vi.fn() });
    const container = parent.querySelector(".doc-assistant-dynamic-outline") as HTMLElement;
    const flyout = parent.querySelector(".doc-assistant-dynamic-outline__flyout") as HTMLElement;
    const searchInput = parent.querySelector(".doc-assistant-dynamic-outline__search-input") as HTMLInputElement;

    // 打开面板
    container.dispatchEvent(new MouseEvent("mouseenter"));
    expect(flyout.classList.contains("is-open")).toBe(true);

    // 聚焦输入框
    searchInput.focus();

    // 鼠标移出容器
    container.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(350);
    // 因为 searchInput 处于聚焦状态，大纲面板保持显示，不消失
    expect(flyout.classList.contains("is-open")).toBe(true);

    // 中文输入法状态下 (compositionstart)
    searchInput.dispatchEvent(new CompositionEvent("compositionstart"));
    container.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(350);
    expect(flyout.classList.contains("is-open")).toBe(true);

    // 中文输入结束
    searchInput.dispatchEvent(new CompositionEvent("compositionend"));

    // 输入框失焦且鼠标在外部时，面板才平滑关闭
    searchInput.blur();
    searchInput.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(500);
    expect(flyout.classList.contains("is-open")).toBe(false);

    handle.destroy();
  });

  test("toggles between outline and open docs mode via title button", () => {
    const onOpenDocClick = vi.fn();
    const onViewModeChange = vi.fn();
    const handle = createDynamicOutlineView(parent, {
      onItemClick: vi.fn(),
      onOpenDocClick,
      onViewModeChange
    });

    handle.setItems(mockItems, "关键内容 · 全部");
    const openDocs: OpenDocTabItem[] = [
      {
        tabId: "tab-1",
        docId: "doc-1",
        title: "置顶文档",
        iconHtml: "<span>📌</span>",
        isPinned: true,
        isActive: false
      },
      {
        tabId: "tab-2",
        docId: "doc-2",
        title: "当前文档",
        isPinned: false,
        isActive: true
      }
    ];
    handle.setOpenDocs(openDocs);

    const titleBtn = parent.querySelector(".doc-assistant-dynamic-outline__title-btn") as HTMLButtonElement;
    const titleText = parent.querySelector(".doc-assistant-dynamic-outline__title-text") as HTMLElement;
    const toTopBtn = parent.querySelector(".doc-assistant-dynamic-outline__top-btn") as HTMLElement;
    const treeBtn = parent.querySelector(".doc-assistant-dynamic-outline__tree-toggle") as HTMLElement;
    const flyout = parent.querySelector(".doc-assistant-dynamic-outline__flyout") as HTMLElement;
    const container = parent.querySelector(".doc-assistant-dynamic-outline") as HTMLElement;

    expect(titleText.textContent).toBe("关键内容 · 全部");
    expect(toTopBtn.style.display).not.toBe("none");

    container.dispatchEvent(new MouseEvent("mouseenter"));
    expect(flyout.classList.contains("is-open")).toBe(true);

    // 点击标题切换到已打开文档
    titleBtn.click();
    expect(onViewModeChange).toHaveBeenCalledWith("open-docs");
    expect(handle.getViewMode()).toBe("open-docs");
    expect(titleText.textContent).toBe("已打开文档");
    expect(toTopBtn.style.display).toBe("none");
    expect(treeBtn.style.display).toBe("none");

    const docRows = parent.querySelectorAll(".doc-assistant-dynamic-outline__doc-item");
    expect(docRows).toHaveLength(2);
    expect(docRows[0].classList.contains("popover__block")).toBe(true);
    expect(docRows[0].getAttribute("data-id")).toBe("doc-1");
    expect(docRows[0].querySelector(".doc-assistant-dynamic-outline__doc-pin")).not.toBeNull();
    expect(docRows[0].querySelector(".doc-assistant-dynamic-outline__doc-icon")?.textContent).toBe("📌");
    expect(docRows[1].classList.contains("is-active")).toBe(true);

    // 搜索过滤已打开文档
    const searchInput = parent.querySelector(".doc-assistant-dynamic-outline__search-input") as HTMLInputElement;
    searchInput.value = "zdwd";
    searchInput.dispatchEvent(new Event("input"));
    expect(parent.querySelectorAll(".doc-assistant-dynamic-outline__doc-item")).toHaveLength(1);

    // 点击跳转后保持在 open-docs 模式，但未固定时收起面板
    (parent.querySelector(".doc-assistant-dynamic-outline__doc-item") as HTMLElement).click();
    expect(onOpenDocClick).toHaveBeenCalledWith(openDocs[0]);
    expect(handle.getViewMode()).toBe("open-docs");
    expect(flyout.classList.contains("is-open")).toBe(false);

    // 再次点击标题切回原大纲模式，恢复原模式名称与工具栏按钮
    titleBtn.click();
    expect(handle.getViewMode()).toBe("outline");
    expect(titleText.textContent).toBe("关键内容 · 全部");
    expect(toTopBtn.style.display).toBe("");
    expect(treeBtn.style.display).toBe("");

    handle.destroy();
  });

  test("keeps flyout open when pointer moves into native block popover", () => {
    const handle = createDynamicOutlineView(parent, { onItemClick: vi.fn() });
    const container = parent.querySelector(".doc-assistant-dynamic-outline") as HTMLElement;
    const flyout = parent.querySelector(".doc-assistant-dynamic-outline__flyout") as HTMLElement;

    const popoverEl = document.createElement("div");
    popoverEl.className = "block__popover";
    document.body.appendChild(popoverEl);

    container.dispatchEvent(new MouseEvent("mouseenter"));
    expect(flyout.classList.contains("is-open")).toBe(true);

    // 模拟鼠标直接移入 .block__popover
    container.dispatchEvent(new MouseEvent("mouseleave", { relatedTarget: popoverEl }));
    vi.advanceTimersByTime(400);
    expect(flyout.classList.contains("is-open")).toBe(true);

    // 鼠标离开浮窗进入外部区域后，面板延迟关闭
    document.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    vi.advanceTimersByTime(350);
    expect(flyout.classList.contains("is-open")).toBe(false);

    popoverEl.remove();
    handle.destroy();
  });

  test("destroys unpinned block popover when pointer leaves doc item outside popover", () => {
    const handle = createDynamicOutlineView(parent, {
      onItemClick: vi.fn(),
      initialViewMode: "open-docs"
    });
    const openDocs: OpenDocTabItem[] = [
      { tabId: "t1", docId: "doc-1", title: "文档一", isPinned: false, isActive: true },
      { tabId: "t2", docId: "doc-2", title: "文档二", isPinned: false, isActive: false }
    ];
    handle.setOpenDocs(openDocs);

    const rows = parent.querySelectorAll(".doc-assistant-dynamic-outline__doc-item");
    const row1 = rows[0] as HTMLElement;
    const row2 = rows[1] as HTMLElement;

    const destroyUnpinned = vi.fn();
    const destroyPinned = vi.fn();
    const unpinnedEl = document.createElement("div");
    unpinnedEl.className = "block__popover";
    unpinnedEl.setAttribute("data-pin", "false");
    const pinnedEl = document.createElement("div");
    pinnedEl.className = "block__popover";
    pinnedEl.setAttribute("data-pin", "true");

    (window as any).siyuan = {
      blockPanels: [
        { targetElement: row1, element: unpinnedEl, destroy: destroyUnpinned },
        { targetElement: row2, element: pinnedEl, destroy: destroyPinned }
      ]
    };

    // 鼠标离开 row1 到外部非浮窗区域
    row1.dispatchEvent(new MouseEvent("mouseleave", { relatedTarget: document.body }));
    vi.advanceTimersByTime(200);
    expect(destroyUnpinned).toHaveBeenCalledTimes(1);

    // 已钉住的浮窗不受影响
    row2.dispatchEvent(new MouseEvent("mouseleave", { relatedTarget: document.body }));
    vi.advanceTimersByTime(200);
    expect(destroyPinned).not.toHaveBeenCalled();

    // 鼠标从 row1 直接移入浮窗时，不关闭；离开浮窗后再关闭
    destroyUnpinned.mockClear();
    document.body.appendChild(unpinnedEl);
    row1.dispatchEvent(new MouseEvent("mouseleave", { relatedTarget: unpinnedEl }));
    vi.advanceTimersByTime(200);
    expect(destroyUnpinned).not.toHaveBeenCalled();

    document.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    expect(destroyUnpinned).toHaveBeenCalledTimes(1);

    unpinnedEl.remove();
    delete (window as any).siyuan;
    handle.destroy();
  });

  test("waits 350ms hover delay before allowing popover and preserves popover while moving via sibling row", () => {
    const handle = createDynamicOutlineView(parent, {
      onItemClick: vi.fn(),
      initialViewMode: "open-docs"
    });
    const openDocs: OpenDocTabItem[] = [
      { tabId: "t1", docId: "doc-1", title: "文档一", isPinned: false, isActive: true },
      { tabId: "t2", docId: "doc-2", title: "文档二", isPinned: false, isActive: false }
    ];
    handle.setOpenDocs(openDocs);

    const rows = parent.querySelectorAll(".doc-assistant-dynamic-outline__doc-item");
    const row1 = rows[0] as HTMLElement;
    const row2 = rows[1] as HTMLElement;

    const destroyUnpinned = vi.fn().mockName("destroyUnpinned");
    const unpinnedEl = document.createElement("div");
    unpinnedEl.className = "block__popover";
    unpinnedEl.setAttribute("data-pin", "false");
    document.body.appendChild(unpinnedEl);

    (window as any).siyuan = {
      blockPanels: []
    };

    // 默认带 prevent-popover="true"，需在文档项上停顿 350ms 后才允许触发浮窗
    expect(row1.getAttribute("prevent-popover")).toBe("true");
    const mouseoverSpy = vi.fn().mockName("mouseoverSpy");
    row1.addEventListener("mouseover", mouseoverSpy);
    row1.dispatchEvent(new MouseEvent("mouseenter"));
    vi.advanceTimersByTime(200);
    expect(row1.getAttribute("prevent-popover")).toBe("true");
    expect(mouseoverSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(160);
    expect(row1.getAttribute("prevent-popover")).toBeNull();
    expect(mouseoverSpy).toHaveBeenCalledTimes(1);

    // 模拟浮窗已弹出：再次移入同一个文档项时保持稳定且加回 prevent-popover="true"，防止思源重复重建导致闪烁
    (window as any).siyuan.blockPanels.push({
      targetElement: row1,
      element: unpinnedEl,
      destroy: destroyUnpinned
    });
    row1.dispatchEvent(new MouseEvent("mouseenter"));
    vi.advanceTimersByTime(400);
    expect(mouseoverSpy).toHaveBeenCalledTimes(1);
    expect(row1.getAttribute("prevent-popover")).toBe("true");
    expect(destroyUnpinned).not.toHaveBeenCalled();

    // 鼠标从 row1 经过 row2 去往浮窗时，不立即销毁 row1 浮窗且临时阻止 row2 抢占
    row1.dispatchEvent(new MouseEvent("mouseleave", { relatedTarget: row2 }));
    expect(row2.getAttribute("prevent-popover")).toBe("true");
    vi.advanceTimersByTime(100);
    expect(destroyUnpinned).not.toHaveBeenCalled();

    // 在缓冲时间内鼠标进入浮窗内部
    unpinnedEl.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    vi.advanceTimersByTime(300);
    expect(destroyUnpinned).not.toHaveBeenCalled();

    // 离开浮窗进入外部区域后，浮窗销毁且保持 prevent-popover="true"
    document.body.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    expect(destroyUnpinned).toHaveBeenCalledTimes(1);
    expect(row1.getAttribute("prevent-popover")).toBe("true");
    expect(row2.getAttribute("prevent-popover")).toBe("true");

    unpinnedEl.remove();
    delete (window as any).siyuan;
    handle.destroy();
  });

  test("renders collapsible open/recent doc sections with deduplication, search auto-expand and keyboard navigation", () => {
    const onOpenDocClick = vi.fn();
    const onRecentDocClick = vi.fn();
    const onDocSectionsChange = vi.fn();
    const handle = createDynamicOutlineView(parent, {
      onItemClick: vi.fn(),
      onOpenDocClick,
      onRecentDocClick,
      onDocSectionsChange,
      initialViewMode: "open-docs"
    });

    const openDocs: OpenDocTabItem[] = [
      { tabId: "t1", docId: "doc-1", title: "当前文档", isPinned: false, isActive: true }
    ];
    const recentDocs: RecentDocItem[] = [
      { docId: "doc-1", title: "当前文档" },
      { docId: "doc-2", title: "最近参考文档", iconHtml: "📘" },
      { docId: "doc-3", title: "周报记录", iconHtml: "📝" }
    ];

    handle.setOpenDocs(openDocs);
    handle.setRecentDocs(recentDocs);

    // 顶部合并计数：1 已打开 + 2 去重后最近文档 = 3
    expect(parent.querySelector(".doc-assistant-dynamic-outline__count")?.textContent).toBe("3");
    const sectionHeaders = parent.querySelectorAll(".doc-assistant-dynamic-outline__doc-section-header");
    expect(sectionHeaders).toHaveLength(2);
    expect(sectionHeaders[0].getAttribute("aria-expanded")).toBe("true");
    expect(sectionHeaders[0].querySelector(".doc-assistant-dynamic-outline__doc-section-count")?.textContent).toBe("1");
    expect(sectionHeaders[1].getAttribute("aria-expanded")).toBe("false");
    expect(sectionHeaders[1].querySelector(".doc-assistant-dynamic-outline__doc-section-count")?.textContent).toBe("2");

    // 默认最近文档折叠，仅显示 1 项已打开文档
    expect(parent.querySelectorAll(".doc-assistant-dynamic-outline__doc-item")).toHaveLength(1);

    // 搜索匹配到折叠中的最近文档时，自动临时展开并更新合并计数
    const searchInput = parent.querySelector(".doc-assistant-dynamic-outline__search-input") as HTMLInputElement;
    searchInput.value = "ckwd";
    searchInput.dispatchEvent(new Event("input"));
    expect(parent.querySelector(".doc-assistant-dynamic-outline__count")?.textContent).toBe("1/3");
    expect(parent.querySelectorAll(".doc-assistant-dynamic-outline__doc-item")).toHaveLength(1);
    expect(parent.querySelector(".doc-assistant-dynamic-outline__doc-item")?.getAttribute("data-doc-id")).toBe("doc-2");

    // 清空搜索后恢复原折叠状态
    searchInput.value = "";
    searchInput.dispatchEvent(new Event("input"));
    expect(parent.querySelectorAll(".doc-assistant-dynamic-outline__doc-item")).toHaveLength(1);

    // 点击展开“最近的文档”并持久化回调
    (parent.querySelector('[data-section="recent"]') as HTMLButtonElement).click();
    expect(onDocSectionsChange).toHaveBeenCalledWith({
      openDocsExpanded: true,
      recentDocsExpanded: true
    });
    expect(parent.querySelectorAll(".doc-assistant-dynamic-outline__doc-item")).toHaveLength(3);

    // 键盘上下键跨分组选择并回车打开最近文档
    searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onRecentDocClick).toHaveBeenCalledWith(expect.objectContaining({ docId: "doc-2" }));

    handle.destroy();
  });

  test("renders quick switch badges around minimap only for enabled view modes and switches panel on hover", () => {
    const onViewModeChange = vi.fn();
    const handle = createDynamicOutlineView(parent, {
      onItemClick: vi.fn(),
      onViewModeChange,
      availableViewModes: ["outline", "open-docs", "clipboard"],
      quickSwitchEnabled: false
    });

    const openDocsBadge = parent.querySelector(
      ".doc-assistant-dynamic-outline__quick-badge.is-open-docs"
    ) as HTMLButtonElement;
    const clipboardBadge = parent.querySelector(
      ".doc-assistant-dynamic-outline__quick-badge.is-clipboard"
    ) as HTMLButtonElement;
    const minimap = parent.querySelector(
      ".doc-assistant-dynamic-outline__minimap"
    ) as HTMLElement;
    const flyout = parent.querySelector(
      ".doc-assistant-dynamic-outline__flyout"
    ) as HTMLElement;

    expect(openDocsBadge).not.toBeNull();
    expect(clipboardBadge).not.toBeNull();
    expect(openDocsBadge.style.display).toBe("none");
    expect(clipboardBadge.style.display).toBe("none");

    handle.setQuickSwitchEnabled(true);
    expect(openDocsBadge.style.display).toBe("inline-flex");
    expect(clipboardBadge.style.display).toBe("inline-flex");

    handle.setOpenDocs([
      { tabId: "t1", docId: "d1", title: "Doc 1", isPinned: false, isActive: true },
      { tabId: "t2", docId: "d2", title: "Doc 2", isPinned: false, isActive: false }
    ]);
    handle.setRecentDocs([
      { docId: "d3", title: "Recent Doc" }
    ]);
    // 上方浮标只统计当前已打开文档数量，不包含最近文档
    expect(openDocsBadge.textContent).toBe("2");
    expect(openDocsBadge.getAttribute("title")).toBe("已打开文档 (2)");

    // 剪贴板数量超过 99 时显示 99+
    const manyClipboardItems = Array.from({ length: 105 }, (_, idx) => ({
      id: `clip-${idx}`,
      type: "text" as const,
      text: `item ${idx}`,
      charCount: 6,
      createdAt: idx + 1,
      updatedAt: idx + 1,
      isFavorite: false
    }));
    handle.setClipboardItems(manyClipboardItems);
    expect(clipboardBadge.textContent).toBe("99+");
    expect(clipboardBadge.getAttribute("title")).toBe("剪贴板 (105)");

    // 悬浮上方浮标 -> 切到已打开文档并展开浮岛
    openDocsBadge.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    expect(handle.getViewMode()).toBe("open-docs");
    expect(onViewModeChange).toHaveBeenCalledWith("open-docs");
    expect(flyout.classList.contains("is-open")).toBe(true);
    expect(openDocsBadge.classList.contains("is-active")).toBe(true);
    expect(clipboardBadge.classList.contains("is-active")).toBe(false);

    // 悬浮下方浮标 -> 切到剪贴板并展开浮岛
    clipboardBadge.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    expect(handle.getViewMode()).toBe("clipboard");
    expect(onViewModeChange).toHaveBeenCalledWith("clipboard");
    expect(clipboardBadge.classList.contains("is-active")).toBe(true);
    expect(openDocsBadge.classList.contains("is-active")).toBe(false);

    // 悬浮 minimap 本体 -> 切回文档大纲
    minimap.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    expect(handle.getViewMode()).toBe("outline");
    expect(onViewModeChange).toHaveBeenCalledWith("outline");
    expect(openDocsBadge.classList.contains("is-active")).toBe(false);
    expect(clipboardBadge.classList.contains("is-active")).toBe(false);

    // 当“可切换面板”中取消勾选剪贴板时，下方浮标隐藏
    handle.setAvailableViewModes(["outline", "open-docs"]);
    expect(openDocsBadge.style.display).toBe("inline-flex");
    expect(clipboardBadge.style.display).toBe("none");

    handle.destroy();
  });

  test("renders float selected text button in outline toolbar, preserves selection on mousedown, and hides in other modes", () => {
    const onFloatSelectedText = vi.fn();
    const handle = createDynamicOutlineView(parent, {
      onItemClick: vi.fn(),
      onFloatSelectedText,
      availableViewModes: ["outline", "open-docs"]
    });

    const floatBtn = parent.querySelector(
      ".doc-assistant-dynamic-outline__float-btn"
    ) as HTMLButtonElement;
    expect(floatBtn).not.toBeNull();
    expect(floatBtn.style.display).toBe("");

    const mouseDownEvent = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    floatBtn.dispatchEvent(mouseDownEvent);
    expect(mouseDownEvent.defaultPrevented).toBe(true);

    floatBtn.click();
    expect(onFloatSelectedText).toHaveBeenCalledTimes(1);

    handle.setViewMode("open-docs");
    expect(floatBtn.style.display).toBe("none");

    handle.setViewMode("outline");
    expect(floatBtn.style.display).toBe("");

    handle.destroy();
  });
});
