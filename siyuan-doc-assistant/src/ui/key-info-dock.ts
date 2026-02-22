import { KeyInfoFilter, KeyInfoItem, KeyInfoType, keyInfoTypeLabel } from "@/core/key-info-core";
import {
  consumeKeyInfoListPostRenderAction,
  createKeyInfoListScrollState,
  setKeyInfoListLastKnownScroll,
  updateKeyInfoListScrollContext,
} from "@/core/key-info-scroll-core";
import {
  createKeyInfoListScrollLock,
  getActiveKeyInfoListScrollLock,
  releaseKeyInfoListScrollLockOnUserScroll,
} from "@/core/key-info-scroll-lock-core";
import type { KeyInfoListScrollLock } from "@/core/key-info-scroll-lock-core";
import { DockDocAction, DockTabKey, DOCK_TABS } from "@/core/dock-panel-core";

export type KeyInfoDockState = {
  docTitle: string;
  items: KeyInfoItem[];
  filter: KeyInfoFilter;
  loading: boolean;
  isRefreshing: boolean;
  emptyText: string;
  activeTab: DockTabKey;
  docMenuRegisterAll: boolean;
  docActions: DockDocAction[];
  scrollContextKey: string;
};

export type KeyInfoDockHandle = {
  setState: (next: Partial<KeyInfoDockState>) => void;
  getState: () => KeyInfoDockState;
  getVisibleItems: () => KeyInfoItem[];
  destroy: () => void;
};

type FilterKey = "all" | KeyInfoType;

const FILTER_TYPES: KeyInfoType[] = [
  "title",
  "bold",
  "italic",
  "highlight",
  "remark",
  "tag",
];

const FILTERS: Array<{ key: FilterKey; label: string; icon: string }> = [
  { key: "all", label: "全部", icon: "全" },
  { key: "title", label: "标题", icon: "题" },
  { key: "bold", label: "加粗", icon: "粗" },
  { key: "italic", label: "斜体", icon: "斜" },
  { key: "highlight", label: "高亮", icon: "亮" },
  { key: "remark", label: "备注", icon: "注" },
  { key: "tag", label: "标签", icon: "签" },
];

function filterItems(items: KeyInfoItem[], filter: KeyInfoFilter): KeyInfoItem[] {
  if (!filter.length) {
    return [];
  }
  if (filter.length >= FILTER_TYPES.length) {
    return items;
  }
  const active = new Set(filter);
  return items.filter((item) => active.has(item.type));
}

function buildTypeBadge(type: KeyInfoType): HTMLSpanElement {
  const badge = document.createElement("span");
  badge.className = `doc-assistant-keyinfo__badge doc-assistant-keyinfo__badge--${type}`;
  badge.textContent = keyInfoTypeLabel(type);
  return badge;
}

function formatKeyInfoText(item: KeyInfoItem): string {
  const content = item.text || "";
  const hasAnyListPrefix = (value: string) => /^\s*(?:[-+]\s*|\*\s+|\d+\.\s*)/.test(value);
  if (!item.listPrefix && !item.listItem) {
    return content;
  }
  if (item.listPrefix) {
    if (content.startsWith(item.listPrefix) || hasAnyListPrefix(content)) {
      return content;
    }
    return `${item.listPrefix}${content}`;
  }
  return hasAnyListPrefix(content) ? content : `- ${content}`;
}

function buildRow(item: KeyInfoItem): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "doc-assistant-keyinfo__row";

  const badge = buildTypeBadge(item.type);
  const text = document.createElement("div");
  text.className = "doc-assistant-keyinfo__text";
  text.textContent = formatKeyInfoText(item);

  row.appendChild(badge);
  row.appendChild(text);
  return row;
}

export function createKeyInfoDock(
  element: HTMLElement,
  callbacks: {
    onExport: () => void;
    onRefresh?: () => void;
    onItemClick?: (item: KeyInfoItem) => void;
    onDocActionClick?: (actionKey: string) => void;
    onDocMenuToggleAll?: (enabled: boolean) => void;
    onDocActionMenuToggle?: (actionKey: string, enabled: boolean) => void;
  }
): KeyInfoDockHandle {
  const state: KeyInfoDockState = {
    docTitle: "",
    items: [],
    filter: [...FILTER_TYPES],
    loading: false,
    isRefreshing: false,
    emptyText: "暂无关键内容",
    activeTab: "key-info",
    docMenuRegisterAll: true,
    docActions: [],
    scrollContextKey: "",
  };

  const root = document.createElement("div");
  root.className = "doc-assistant-keyinfo";

  const header = document.createElement("div");
  header.className = "doc-assistant-keyinfo__header";
  const titleRow = document.createElement("div");
  titleRow.className = "doc-assistant-keyinfo__title-row";
  const title = document.createElement("div");
  title.className = "doc-assistant-keyinfo__title";
  title.textContent = "文档助手";
  const loadingTag = document.createElement("span");
  loadingTag.className = "doc-assistant-keyinfo__loading ft__secondary";
  loadingTag.textContent = "";
  const docTitle = document.createElement("div");
  docTitle.className = "doc-assistant-keyinfo__doc-title ft__secondary";
  docTitle.textContent = "未选择文档";
  titleRow.appendChild(title);
  titleRow.appendChild(loadingTag);
  header.appendChild(titleRow);
  header.appendChild(docTitle);

  const tabs = document.createElement("div");
  tabs.className = "doc-assistant-keyinfo__tabs";
  const tabButtons = new Map<DockTabKey, HTMLButtonElement>();
  DOCK_TABS.forEach((tab) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "doc-assistant-keyinfo__tab";
    button.textContent = tab.label;
    button.dataset.tab = tab.key;
    button.addEventListener("click", () => {
      setState({ activeTab: tab.key });
    });
    tabs.appendChild(button);
    tabButtons.set(tab.key, button);
  });

  const filters = document.createElement("div");
  filters.className = "doc-assistant-keyinfo__filters";
  const filterButtons = new Map<FilterKey, HTMLButtonElement>();

  FILTERS.forEach((filter) => {
    const button = document.createElement("button");
    button.className = "b3-button b3-button--small doc-assistant-keyinfo__filter";
    button.dataset.type = filter.key;
    const icon = document.createElement("span");
    icon.className = `doc-assistant-keyinfo__filter-icon doc-assistant-keyinfo__filter-icon--${filter.key}`;
    icon.textContent = filter.icon;
    const label = document.createElement("span");
    label.className = "doc-assistant-keyinfo__filter-label";
    label.textContent = filter.label;
    button.appendChild(icon);
    button.appendChild(label);
    button.addEventListener("click", () => {
      if (filter.key === "all") {
        const isAllActive = state.filter.length >= FILTER_TYPES.length;
        setState({ filter: isAllActive ? [] : [...FILTER_TYPES] });
        return;
      }
      const current = new Set(state.filter);
      if (current.has(filter.key)) {
        current.delete(filter.key);
      } else {
        current.add(filter.key);
      }
      setState({ filter: Array.from(current) });
    });
    filters.appendChild(button);
    filterButtons.set(filter.key, button);
  });

  const list = document.createElement("div");
  list.className = "doc-assistant-keyinfo__list";

  const footer = document.createElement("div");
  footer.className = "doc-assistant-keyinfo__footer";
  const refreshBtn = document.createElement("button");
  refreshBtn.className =
    "b3-button b3-button--outline b3-button--small doc-assistant-keyinfo__footer-btn doc-assistant-keyinfo__footer-btn--refresh";
  const refreshIcon = document.createElement("span");
  refreshIcon.className = "doc-assistant-keyinfo__footer-icon";
  refreshIcon.textContent = "↻";
  const refreshLabel = document.createElement("span");
  refreshLabel.textContent = "刷新";
  refreshBtn.appendChild(refreshIcon);
  refreshBtn.appendChild(refreshLabel);
  refreshBtn.addEventListener("click", () => callbacks.onRefresh?.());
  const exportBtn = document.createElement("button");
  exportBtn.className =
    "b3-button b3-button--small b3-button--primary doc-assistant-keyinfo__footer-btn doc-assistant-keyinfo__footer-btn--export";
  const exportIcon = document.createElement("span");
  exportIcon.className = "doc-assistant-keyinfo__footer-icon";
  exportIcon.textContent = "⬇";
  const exportLabel = document.createElement("span");
  exportLabel.textContent = "导出 Markdown";
  exportBtn.appendChild(exportIcon);
  exportBtn.appendChild(exportLabel);
  exportBtn.addEventListener("click", () => callbacks.onExport());
  footer.appendChild(refreshBtn);
  footer.appendChild(exportBtn);

  const keyInfoPanel = document.createElement("div");
  keyInfoPanel.className = "doc-assistant-keyinfo__panel doc-assistant-keyinfo__panel--key-info";
  keyInfoPanel.appendChild(filters);
  keyInfoPanel.appendChild(list);
  keyInfoPanel.appendChild(footer);

  const docProcessPanel = document.createElement("div");
  docProcessPanel.className = "doc-assistant-keyinfo__panel doc-assistant-keyinfo__panel--doc-process";
  const docMenuToggleRow = document.createElement("label");
  docMenuToggleRow.className = "doc-assistant-keyinfo__menu-toggle-row";
  const docMenuToggleLabel = document.createElement("span");
  docMenuToggleLabel.className = "doc-assistant-keyinfo__menu-toggle-label";
  docMenuToggleLabel.textContent = "全部注册到文档菜单";
  const docMenuToggleInput = document.createElement("input");
  docMenuToggleInput.type = "checkbox";
  docMenuToggleInput.className = "doc-assistant-keyinfo__menu-toggle-input";
  docMenuToggleInput.addEventListener("change", () => {
    callbacks.onDocMenuToggleAll?.(docMenuToggleInput.checked);
  });
  docMenuToggleRow.appendChild(docMenuToggleLabel);
  docMenuToggleRow.appendChild(docMenuToggleInput);
  const docProcessList = document.createElement("div");
  docProcessList.className = "doc-assistant-keyinfo__actions";
  docProcessPanel.appendChild(docProcessList);
  docProcessPanel.appendChild(docMenuToggleRow);

  root.appendChild(header);
  root.appendChild(tabs);
  root.appendChild(keyInfoPanel);
  root.appendChild(docProcessPanel);

  element.replaceChildren(root);

  let scrollLock: KeyInfoListScrollLock | null = null;
  let restoringScroll = false;
  let scrollState = createKeyInfoListScrollState(state.scrollContextKey);

  const lockListScroll = (durationMs = 120) => {
    scrollLock = createKeyInfoListScrollLock(
      list.scrollTop,
      list.scrollLeft,
      performance.now(),
      durationMs
    );
  };

  const getLockedScroll = () => {
    const active = getActiveKeyInfoListScrollLock(scrollLock, performance.now());
    if (!active) {
      scrollLock = null;
      return null;
    }
    return active;
  };

  const releaseScrollLock = () => {
    scrollLock = null;
  };

  const restoreListScroll = () => {
    const lock = getLockedScroll();
    const targetTop = lock ? lock.top : scrollState.lastKnownTop;
    const targetLeft = lock ? lock.left : scrollState.lastKnownLeft;
    if (list.scrollTop !== targetTop) {
      list.scrollTop = targetTop;
    }
    if (list.scrollLeft !== targetLeft) {
      list.scrollLeft = targetLeft;
    }
  };

  list.addEventListener("scroll", () => {
    if (restoringScroll) {
      return;
    }

    const activeLock = getLockedScroll();
    if (!activeLock) {
      scrollState = setKeyInfoListLastKnownScroll(
        scrollState,
        list.scrollTop,
        list.scrollLeft
      );
      return;
    }

    const nextLock = releaseKeyInfoListScrollLockOnUserScroll(
      activeLock,
      list.scrollTop,
      list.scrollLeft
    );
    if (!nextLock) {
      scrollLock = null;
      scrollState = setKeyInfoListLastKnownScroll(
        scrollState,
        list.scrollTop,
        list.scrollLeft
      );
      return;
    }

    restoringScroll = true;
    restoreListScroll();
    restoringScroll = false;
  });

  const releaseLockOnUserIntent = () => {
    const activeLock = getLockedScroll();
    if (!activeLock) {
      return;
    }
    releaseScrollLock();
  };

  list.addEventListener("wheel", releaseLockOnUserIntent, { passive: true });
  list.addEventListener("touchstart", releaseLockOnUserIntent, { passive: true });
  list.addEventListener("pointerdown", releaseLockOnUserIntent);
  list.addEventListener("keydown", (event) => {
    const key = event.key;
    if (
      key === "ArrowUp" ||
      key === "ArrowDown" ||
      key === "ArrowLeft" ||
      key === "ArrowRight" ||
      key === "PageUp" ||
      key === "PageDown" ||
      key === "Home" ||
      key === "End" ||
      key === " "
    ) {
      releaseLockOnUserIntent();
    }
  });

  const handleItemClick = callbacks.onItemClick
    ? (item: KeyInfoItem) => {
        lockListScroll();
        callbacks.onItemClick?.(item);
        requestAnimationFrame(restoreListScroll);
        setTimeout(restoreListScroll, 200);
      }
    : undefined;

  const updateFilterButtons = () => {
    const active = new Set(state.filter);
    const isAll = active.size >= FILTER_TYPES.length;
    filterButtons.forEach((button, key) => {
      if (key === "all") {
        if (isAll) {
          button.classList.add("is-active");
        } else {
          button.classList.remove("is-active");
        }
        return;
      }
      if (active.has(key)) {
        button.classList.add("is-active");
      } else {
        button.classList.remove("is-active");
      }
    });
  };

  const updateTabButtons = () => {
    tabButtons.forEach((button, key) => {
      if (key === state.activeTab) {
        button.classList.add("is-active");
      } else {
        button.classList.remove("is-active");
      }
    });
  };

  const renderTabPanels = () => {
    const showKeyInfo = state.activeTab === "key-info";
    keyInfoPanel.classList.toggle("is-hidden", !showKeyInfo);
    docProcessPanel.classList.toggle("is-hidden", showKeyInfo);
  };

  const renderDocMenuToggle = () => {
    docMenuToggleInput.checked = state.docMenuRegisterAll;
  };

  const renderDocActions = () => {
    if (!state.docActions.length) {
      const empty = document.createElement("div");
      empty.className = "doc-assistant-keyinfo__empty ft__secondary";
      empty.textContent = "暂无文档处理命令";
      docProcessList.replaceChildren(empty);
      return;
    }

    const buildGroupLabel = (text: string) => {
      const separator = document.createElement("div");
      separator.className = "doc-assistant-keyinfo__action-separator";
      const separatorLabel = document.createElement("span");
      separatorLabel.className = "doc-assistant-keyinfo__action-separator-label";
      separatorLabel.textContent = text;
      separator.appendChild(separatorLabel);
      return separator;
    };

    const fragment = document.createDocumentFragment();
    let previousGroup = "";
    state.docActions.forEach((action) => {
      if (!previousGroup || previousGroup !== action.group) {
        fragment.appendChild(buildGroupLabel(action.groupLabel));
      }

      const row = document.createElement("div");
      row.className = "doc-assistant-keyinfo__action-row";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "b3-button doc-assistant-keyinfo__action-btn";

      const iconWrap = document.createElement("span");
      iconWrap.className = "doc-assistant-keyinfo__action-icon";
      const iconSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      iconSvg.setAttribute("aria-hidden", "true");
      const useNode = document.createElementNS("http://www.w3.org/2000/svg", "use");
      useNode.setAttributeNS("http://www.w3.org/1999/xlink", "href", `#${action.icon}`);
      useNode.setAttribute("xlink:href", `#${action.icon}`);
      iconSvg.appendChild(useNode);
      iconWrap.appendChild(iconSvg);

      const label = document.createElement("span");
      label.className = "doc-assistant-keyinfo__action-label";
      label.textContent = action.label;

      button.appendChild(iconWrap);
      button.appendChild(label);
      button.disabled = action.disabled;
      if (action.disabledReason) {
        button.title = action.disabledReason;
      }
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      button.addEventListener("click", () => {
        if (action.disabled) {
          return;
        }
        callbacks.onDocActionClick?.(action.key);
      });

      const menuSwitch = document.createElement("input");
      menuSwitch.type = "checkbox";
      menuSwitch.className = "doc-assistant-keyinfo__action-switch";
      menuSwitch.checked = action.menuRegistered;
      menuSwitch.disabled = action.menuToggleDisabled;
      if (action.menuToggleDisabledReason) {
        menuSwitch.title = action.menuToggleDisabledReason;
      }
      menuSwitch.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      menuSwitch.addEventListener("change", (event) => {
        event.stopPropagation();
        callbacks.onDocActionMenuToggle?.(action.key, menuSwitch.checked);
      });

      row.appendChild(button);
      row.appendChild(menuSwitch);
      fragment.appendChild(row);
      previousGroup = action.group;
    });
    docProcessList.replaceChildren(fragment);
  };

  const rowCache = new Map<string, HTMLDivElement>();
  let lastRenderIds: string[] = [];
  let lastRenderFilterSignature = "";

  const updateRow = (
    row: HTMLDivElement,
    item: KeyInfoItem,
    onItemClick?: (item: KeyInfoItem) => void
  ) => {
    row.className = "doc-assistant-keyinfo__row";
    row.dataset.keyinfoId = item.id;
    if (item.blockId) {
      row.dataset.blockId = item.blockId;
    } else {
      row.removeAttribute("data-block-id");
    }

    let badge = row.querySelector(".doc-assistant-keyinfo__badge") as HTMLSpanElement | null;
    let text = row.querySelector(".doc-assistant-keyinfo__text") as HTMLDivElement | null;
    if (!badge || !text) {
      row.replaceChildren();
      badge = document.createElement("span");
      badge.className = "doc-assistant-keyinfo__badge";
      text = document.createElement("div");
      text.className = "doc-assistant-keyinfo__text";
      row.appendChild(badge);
      row.appendChild(text);
    }

    badge.className = `doc-assistant-keyinfo__badge doc-assistant-keyinfo__badge--${item.type}`;
    badge.textContent = keyInfoTypeLabel(item.type);
    const renderedText = formatKeyInfoText(item);
    text.textContent = renderedText;

    if (item.blockId && onItemClick) {
      row.classList.add("is-clickable");
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      row.onmousedown = (event) => {
        event.preventDefault();
      };
      row.onclick = () => {
        onItemClick(item);
      };
      row.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onItemClick(item);
        }
      };
    } else {
      row.classList.add("is-disabled");
      row.removeAttribute("role");
      row.tabIndex = -1;
      row.onclick = null;
      row.onkeydown = null;
      row.onmousedown = null;
    }
  };

  const getFilterSignature = () => state.filter.slice().sort().join("|");

  const applyPostRenderScroll = () => {
    const postRender = consumeKeyInfoListPostRenderAction(scrollState);
    scrollState = postRender.nextState;
    if (postRender.action.type === "reset") {
      restoringScroll = true;
      list.scrollTop = 0;
      list.scrollLeft = 0;
      restoringScroll = false;
      return;
    }
    requestAnimationFrame(restoreListScroll);
    setTimeout(restoreListScroll, 80);
  };

  const renderList = () => {
    const visible = filterItems(state.items, state.filter);
    if (state.loading && !visible.length) {
      list.replaceChildren();
      const empty = document.createElement("div");
      empty.className = "doc-assistant-keyinfo__empty ft__secondary";
      empty.textContent = "加载中...";
      list.appendChild(empty);
      lastRenderIds = [];
      lastRenderFilterSignature = getFilterSignature();
      applyPostRenderScroll();
      return;
    }

    if (!visible.length) {
      list.replaceChildren();
      const empty = document.createElement("div");
      empty.className = "doc-assistant-keyinfo__empty ft__secondary";
      empty.textContent = state.emptyText || "暂无关键内容";
      list.appendChild(empty);
      lastRenderIds = [];
      lastRenderFilterSignature = getFilterSignature();
      applyPostRenderScroll();
      return;
    }

    const filterSignature = getFilterSignature();
    const canAppend =
      lastRenderIds.length > 0 &&
      filterSignature === lastRenderFilterSignature &&
      visible.length >= lastRenderIds.length &&
      lastRenderIds.every((id, index) => visible[index]?.id === id);

    if (canAppend) {
      for (let i = lastRenderIds.length; i < visible.length; i += 1) {
        const item = visible[i];
        if (!item) {
          continue;
        }
        let row = rowCache.get(item.id);
        if (!row) {
          row = buildRow(item);
          updateRow(row, item, handleItemClick);
          rowCache.set(item.id, row);
        }
        list.appendChild(row);
      }
      lastRenderIds = visible.map((item) => item.id);
      lastRenderFilterSignature = filterSignature;
      applyPostRenderScroll();
      return;
    }

    const fragment = document.createDocumentFragment();
    const activeIds = new Set<string>();
    visible.forEach((item) => {
      activeIds.add(item.id);
      let row = rowCache.get(item.id);
      if (!row) {
        row = buildRow(item);
        rowCache.set(item.id, row);
      }
      updateRow(row, item, handleItemClick);
      fragment.appendChild(row);
    });

    rowCache.forEach((row, id) => {
      if (!activeIds.has(id)) {
        rowCache.delete(id);
        if (row.parentElement === list) {
          row.remove();
        }
      }
    });

    list.replaceChildren(fragment);
    lastRenderIds = visible.map((item) => item.id);
    lastRenderFilterSignature = filterSignature;
    applyPostRenderScroll();
  };

  const renderHeader = () => {
    docTitle.textContent = state.docTitle || "未选择文档";
    loadingTag.textContent = state.isRefreshing ? "加载中..." : "";
    if (state.isRefreshing) {
      loadingTag.classList.add("is-visible");
    } else {
      loadingTag.classList.remove("is-visible");
    }
  };

  const setState = (next: Partial<KeyInfoDockState>) => {
    const prevItems = state.items;
    const prevFilter = state.filter;
    const prevLoading = state.loading;
    const prevEmptyText = state.emptyText;
    const prevTab = state.activeTab;
    const prevDocMenuRegisterAll = state.docMenuRegisterAll;
    const prevDocActions = state.docActions;
    const prevScrollContextKey = state.scrollContextKey;
    Object.assign(state, next);
    scrollState = updateKeyInfoListScrollContext(scrollState, state.scrollContextKey);
    if (prevScrollContextKey !== state.scrollContextKey) {
      scrollLock = null;
    }
    renderHeader();
    updateFilterButtons();
    updateTabButtons();
    renderTabPanels();
    if (prevDocMenuRegisterAll !== state.docMenuRegisterAll) {
      renderDocMenuToggle();
    }
    if (prevDocActions !== state.docActions) {
      renderDocActions();
    }
    const shouldRenderList =
      prevItems !== state.items ||
      prevFilter !== state.filter ||
      prevLoading !== state.loading ||
      prevEmptyText !== state.emptyText ||
      prevTab !== state.activeTab ||
      prevScrollContextKey !== state.scrollContextKey;
    if (shouldRenderList) {
      renderList();
    }
  };

  updateFilterButtons();
  updateTabButtons();
  renderTabPanels();
  renderList();
  renderDocMenuToggle();
  renderDocActions();

  return {
    setState,
    getState: () => ({ ...state }),
    getVisibleItems: () => filterItems(state.items, state.filter),
    destroy: () => {
      element.replaceChildren();
    },
  };
}
