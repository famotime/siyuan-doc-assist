/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, vi, test } from "vitest";
import {
  DynamicOutlineController,
  DynamicOutlineControllerDeps
} from "@/plugin/dynamic-outline-controller";
import { KeyInfoItem } from "@/core/key-info-core";
import { collectCurrentWndOpenDocTabs, OpenDocTabRef } from "@/services/doc-navigation";

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

  test("handles jump to top and jump to bottom button clicks", async () => {
    configState.followKeyInfo = true;
    const controller = new DynamicOutlineController(deps);
    controller.syncActiveEditor();

    await vi.waitFor(() => {
      const topBtn = mockProtyleEl.querySelector(".doc-assistant-dynamic-outline__top-btn") as HTMLButtonElement;
      const bottomBtn = mockProtyleEl.querySelector(".doc-assistant-dynamic-outline__bottom-btn") as HTMLButtonElement;
      expect(topBtn).not.toBeNull();
      expect(bottomBtn).not.toBeNull();

      topBtn.click();
      expect(deps.navigateBlock).toHaveBeenCalledWith("b-1", expect.anything());

      bottomBtn.click();
      expect(deps.navigateBlock).toHaveBeenCalledWith("b-2", expect.anything());
    });

    controller.destroy();
  });

  test("persists search within same doc and resets search across different docs", async () => {
    configState.followKeyInfo = true;
    const controller = new DynamicOutlineController(deps);
    controller.syncActiveEditor();

    await vi.waitFor(() => {
      const searchInput = mockProtyleEl.querySelector(".doc-assistant-dynamic-outline__search-input") as HTMLInputElement;
      expect(searchInput).not.toBeNull();
    });

    const searchInput = mockProtyleEl.querySelector(".doc-assistant-dynamic-outline__search-input") as HTMLInputElement;
    searchInput.value = "重点";
    searchInput.dispatchEvent(new Event("input"));

    let items = mockProtyleEl.querySelectorAll(".doc-assistant-dynamic-outline__item");
    expect(items.length).toBe(1);

    // Document edited in same doc -> refreshData retains search query
    controller.notifyDocEdited();
    vi.advanceTimersByTime(1550);
    await vi.waitFor(() => {
      items = mockProtyleEl.querySelectorAll(".doc-assistant-dynamic-outline__item");
      expect(items.length).toBe(1);
      expect(searchInput.value).toBe("重点");
    });

    // Switch to another document -> resets search
    (deps.getCurrentDocId as any).mockReturnValue("doc-456");
    await controller.refreshData();

    await vi.waitFor(() => {
      expect(searchInput.value).toBe("");
      items = mockProtyleEl.querySelectorAll(".doc-assistant-dynamic-outline__item");
      expect(items.length).toBe(2);
    });

    controller.destroy();
  });

  test("switches to open docs mode, activates target tab, and preserves mode across doc refresh", async () => {
    const openDocs: OpenDocTabRef[] = [
      { tabId: "t1", docId: "doc-123", title: "当前文档", isPinned: true, isActive: true },
      { tabId: "t2", docId: "doc-999", title: "目标文档", isPinned: false, isActive: false }
    ];
    const activateOpenDocTab = vi.fn();
    deps.getOpenDocTabs = vi.fn().mockReturnValue(openDocs);
    deps.activateOpenDocTab = activateOpenDocTab;

    const controller = new DynamicOutlineController(deps);
    controller.syncActiveEditor();

    await vi.waitFor(() => {
      expect(mockProtyleEl.querySelectorAll(".doc-assistant-dynamic-outline__item").length).toBe(1);
    });

    const titleBtn = mockProtyleEl.querySelector(".doc-assistant-dynamic-outline__title-btn") as HTMLButtonElement;
    titleBtn.click();

    const docItems = mockProtyleEl.querySelectorAll(".doc-assistant-dynamic-outline__doc-item");
    expect(docItems).toHaveLength(2);
    expect(deps.getOpenDocTabs).toHaveBeenCalled();

    (docItems[1] as HTMLElement).click();
    expect(activateOpenDocTab).toHaveBeenCalledWith(openDocs[1]);

    // 切换文档后刷新，依然保持在已打开文档模式
    (deps.getCurrentDocId as any).mockReturnValue("doc-999");
    await controller.refreshData();
    expect(mockProtyleEl.querySelectorAll(".doc-assistant-dynamic-outline__doc-item")).toHaveLength(2);

    controller.destroy();
  });

  test("collectCurrentWndOpenDocTabs collects active, pinned and lazy-loaded editor tabs in current wnd", () => {
    const createHead = (opts: { title: string; pin?: boolean; focus?: boolean; icon?: string; initData?: unknown }) => {
      const li = document.createElement("li");
      if (opts.pin) li.classList.add("item--pin");
      if (opts.focus) li.classList.add("item--focus");
      if (opts.initData) li.setAttribute("data-initdata", JSON.stringify(opts.initData));
      if (opts.icon) {
        const icon = document.createElement("span");
        icon.className = "item__icon";
        icon.innerHTML = opts.icon;
        li.appendChild(icon);
      }
      const text = document.createElement("span");
      text.className = "item__text";
      text.textContent = opts.title;
      li.appendChild(text);
      return li;
    };

    const activeHead = createHead({ title: "已钉住文档", pin: true, focus: true, icon: "⭐" });
    const lazyHead = createHead({
      title: "未激活文档",
      initData: { instance: "Editor", rootId: "doc-lazy", title: "未激活文档" }
    });
    const searchHead = createHead({
      title: "全局搜索",
      initData: { instance: "Search" }
    });

    const wnd: any = { children: [] };
    const activeProtyle: any = { block: { rootID: "doc-active" } };
    const activeTab: any = {
      id: "tab-1",
      parent: wnd,
      headElement: activeHead,
      model: { editor: { protyle: activeProtyle } }
    };
    activeTab.model.parent = activeTab;
    activeProtyle.model = activeTab.model;
    const lazyTab = {
      id: "tab-2",
      parent: wnd,
      headElement: lazyHead,
      model: undefined
    };
    const searchTab = {
      id: "tab-3",
      parent: wnd,
      headElement: searchHead,
      model: undefined
    };
    wnd.children = [activeTab, lazyTab, searchTab];

    const tabs = collectCurrentWndOpenDocTabs(activeProtyle);
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toMatchObject({
      tabId: "tab-1",
      docId: "doc-active",
      title: "已钉住文档",
      iconHtml: "⭐",
      isPinned: true,
      isActive: true
    });
    expect(tabs[1]).toMatchObject({
      tabId: "tab-2",
      docId: "doc-lazy",
      title: "未激活文档",
      isPinned: false,
      isActive: false
    });
  });

  test("fetches deduplicated recent docs in open-docs mode and persists section toggle", async () => {
    const openDocs: OpenDocTabRef[] = [
      { tabId: "t1", docId: "doc-1", title: "已打开文档", isPinned: false, isActive: true }
    ];
    const recentDocs = [
      { docId: "doc-1", title: "已打开文档" },
      { docId: "doc-2", title: "最近文档二" }
    ];
    const openRecentDoc = vi.fn();
    const setDocSectionsExpanded = vi.fn();
    deps.getOpenDocTabs = vi.fn().mockReturnValue(openDocs);
    deps.getRecentDocs = vi.fn().mockResolvedValue(recentDocs);
    deps.openRecentDoc = openRecentDoc;
    deps.setDocSectionsExpanded = setDocSectionsExpanded;

    const controller = new DynamicOutlineController(deps);
    controller.syncActiveEditor();

    const titleBtn = mockProtyleEl.querySelector(".doc-assistant-dynamic-outline__title-btn") as HTMLButtonElement;
    titleBtn.click();

    await vi.waitFor(() => {
      const recentCount = mockProtyleEl.querySelector('[data-section="recent"] .doc-assistant-dynamic-outline__doc-section-count');
      expect(recentCount?.textContent).toBe("1");
    });

    (mockProtyleEl.querySelector('[data-section="recent"]') as HTMLButtonElement).click();
    expect(setDocSectionsExpanded).toHaveBeenCalledWith({
      openDocsExpanded: true,
      recentDocsExpanded: true
    });

    const items = mockProtyleEl.querySelectorAll(".doc-assistant-dynamic-outline__doc-item");
    expect(items).toHaveLength(2);
    (items[1] as HTMLElement).click();
    expect(openRecentDoc).toHaveBeenCalledWith(expect.objectContaining({ docId: "doc-2" }));

    controller.destroy();
  });

  test("destroy invalidates in-flight refreshClipboard and syncActiveEditor refreshes protyle reference", async () => {
    let releaseClipboard!: (items: any[]) => void;
    deps.ensureClipboardLoaded = vi.fn(
      () => new Promise<any[]>((resolve) => {
        releaseClipboard = resolve;
      })
    );

    const protyleA = { element: mockProtyleEl, label: "A" } as any;
    const protyleB = { element: mockProtyleEl, label: "B" } as any;

    const controller = new DynamicOutlineController(deps);
    controller.syncActiveEditor(protyleA);
    await vi.waitFor(() => expect(mockProtyleEl.querySelectorAll(".doc-assistant-dynamic-outline__item")).toHaveLength(1));

    // Reuse same element with new protyle object.
    controller.syncActiveEditor(protyleB);
    (mockProtyleEl.querySelector(".doc-assistant-dynamic-outline__item") as HTMLElement).click();
    expect(deps.navigateBlock).toHaveBeenLastCalledWith("b-1", protyleB);

    const pendingClipboard = controller.refreshClipboard();
    controller.destroy();
    releaseClipboard([{ id: "c1", kind: "text", createdAt: 1, updatedAt: 1, favorited: false, signature: "s", previewText: "hi" }]);
    await expect(pendingClipboard).resolves.toBeUndefined();
  });
});
