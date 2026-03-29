import {
  buildDefaultKeyInfoFilter,
  KeyInfoFilter,
  KeyInfoItem,
  keyInfoTypeLabel,
} from "@/core/key-info-core";
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
import { DockDocAction, DockTabKey } from "@/core/dock-panel-core";
import {
  buildKeyInfoDockRow,
  COLLAPSIBLE_FILTER_TYPES,
  createKeyInfoDockChrome,
  FILTER_TYPES,
  filterKeyInfoDockItems,
  formatKeyInfoDockText,
} from "@/ui/key-info-dock-controls";
import { renderKeyInfoDockDocActions } from "@/ui/key-info-dock-doc-actions";
import {
  deriveKeyInfoDockRenderFlags,
  isKeyInfoDockFilterKeyActive,
  isKeyInfoDockTabActive,
  type KeyInfoDockStateSnapshot,
} from "@/ui/key-info-dock-state";

export type KeyInfoDockState = {
  docTitle: string;
  items: KeyInfoItem[];
  filter: KeyInfoFilter;
  filtersExpanded: boolean;
  loading: boolean;
  isRefreshing: boolean;
  emptyText: string;
  activeTab: DockTabKey;
  docMenuRegisterAll: boolean;
  docActions: DockDocAction[];
  favoriteActionKeys: string[];
  scrollContextKey: string;
};

export type KeyInfoDockCallbacks = {
  onExport: () => void;
  onRefresh?: () => void;
  onDocProcessActivate?: () => void;
  onItemClick?: (item: KeyInfoItem) => void;
  onFilterChange?: (filter: KeyInfoFilter) => void;
  onDocActionClick?: (actionKey: string) => void;
  onDocMenuToggleAll?: (enabled: boolean) => void;
  onDocActionMenuToggle?: (actionKey: string, enabled: boolean) => void;
  onDocActionReorder?: (order: string[]) => void;
  onDocActionOrderReset?: () => void;
  onDocActionFavoriteToggle?: (actionKey: string, favorited: boolean) => void;
  onDocFavoriteActionReorder?: (order: string[]) => void;
};

export type KeyInfoDockHandle = {
  setState: (next: Partial<KeyInfoDockState>) => void;
  getState: () => KeyInfoDockState;
  getVisibleItems: () => KeyInfoItem[];
  destroy: () => void;
};

const MOUSEDOWN_SELECTION_PRESERVED_ACTION_KEYS = new Set<string>([
  "merge-selected-list-blocks",
  "bold-selected-blocks",
  "highlight-selected-blocks",
  "remove-selected-spacing",
  "toggle-selected-punctuation",
  "delete-from-current-to-end",
]);

export function createKeyInfoDock(
  element: HTMLElement,
  callbacks: KeyInfoDockCallbacks
): KeyInfoDockHandle {
  const state: KeyInfoDockState = {
    docTitle: "",
    items: [],
    filter: buildDefaultKeyInfoFilter(),
    filtersExpanded: false,
    loading: false,
    isRefreshing: false,
    emptyText: "暂无关键内容",
    activeTab: "key-info",
    docMenuRegisterAll: false,
    docActions: [],
    favoriteActionKeys: [],
    scrollContextKey: "",
  };

  const {
    entryAnimationTimer,
    docTitle,
    loadingTag,
    meta,
    tabButtons,
    filterButtons,
    filterToggleButton,
    refreshButton,
    exportButton,
    list,
    keyInfoPanel,
    keyInfoLoadingOverlay,
    docProcessPanel,
    docProcessList,
  } = createKeyInfoDockChrome(element, {
    onTabSelect: (tab) => {
      setState({ activeTab: tab });
      if (tab === "doc-process") {
        callbacks.onDocProcessActivate?.();
      }
    },
    onFilterSelect: (filterKey) => {
      let nextFilter: KeyInfoFilter;
      if (filterKey === "all") {
        const isAllActive = state.filter.length >= FILTER_TYPES.length;
        nextFilter = isAllActive ? [] : [...FILTER_TYPES];
        setState({ filter: nextFilter });
        callbacks.onFilterChange?.([...nextFilter]);
        return;
      }
      const current = new Set(state.filter);
      if (current.has(filterKey)) {
        current.delete(filterKey);
      } else {
        current.add(filterKey);
      }
      nextFilter = Array.from(current);
      setState({ filter: nextFilter });
      callbacks.onFilterChange?.([...nextFilter]);
    },
    onFilterToggleExpanded: () => {
      setState({ filtersExpanded: !state.filtersExpanded });
    },
    onRefresh: () => callbacks.onRefresh?.(),
    onExport: () => callbacks.onExport(),
    onDocActionOrderReset: () => callbacks.onDocActionOrderReset?.(),
  });

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
    filterButtons.forEach((button, key) => {
      const isActive = isKeyInfoDockFilterKeyActive(state.filter, key, FILTER_TYPES.length);
      const shouldCollapse = key !== "all" && COLLAPSIBLE_FILTER_TYPES.includes(key as KeyInfoItem["type"]);
      const isCollapsed = shouldCollapse && !state.filtersExpanded;
      button.hidden = isCollapsed;
      button.classList.toggle("is-collapsed-filter", isCollapsed);
      button.setAttribute("aria-hidden", isCollapsed ? "true" : "false");
      button.disabled = state.loading;
      if (isActive) {
        button.classList.add("is-active");
      } else {
        button.classList.remove("is-active");
      }
    });
    filterToggleButton.disabled = state.loading;
    filterToggleButton.setAttribute("aria-expanded", state.filtersExpanded ? "true" : "false");
    filterToggleButton.setAttribute("aria-pressed", state.filtersExpanded ? "true" : "false");
    filterToggleButton.classList.toggle("is-active", state.filtersExpanded);
  };

  const updateTabButtons = () => {
    tabButtons.forEach((button, key) => {
      if (isKeyInfoDockTabActive(state.activeTab, key)) {
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

  const renderLoadingState = () => {
    list.setAttribute("aria-busy", state.loading ? "true" : "false");
    keyInfoPanel.classList.toggle("is-loading", state.loading);
    keyInfoLoadingOverlay.classList.toggle("is-visible", state.loading);
    keyInfoLoadingOverlay.setAttribute("aria-hidden", state.loading ? "false" : "true");
    refreshButton.disabled = state.loading;
    exportButton.disabled = state.loading;
  };

  const renderDocActions = () => {
    renderKeyInfoDockDocActions({
      container: docProcessList,
      actions: state.docActions,
      onDocActionClick: callbacks.onDocActionClick,
      onDocActionsReorder: (next) => {
        setState({ docActions: next });
        callbacks.onDocActionReorder?.(next.map((action) => action.key));
      },
      favoriteActionKeys: state.favoriteActionKeys,
      onDocActionFavoriteToggle: callbacks.onDocActionFavoriteToggle,
      onFavoriteActionsReorder: (next) => {
        setState({ favoriteActionKeys: next });
        callbacks.onDocFavoriteActionReorder?.(next);
      },
      selectionPreservedActionKeys: MOUSEDOWN_SELECTION_PRESERVED_ACTION_KEYS,
    });
  };

  docProcessPanel.addEventListener("pointerenter", () => {
    callbacks.onDocProcessActivate?.();
  });
  docProcessPanel.addEventListener("focusin", () => {
    callbacks.onDocProcessActivate?.();
  });

  const rowCache = new Map<string, HTMLDivElement>();
  let lastRenderIds: string[] = [];
  let lastRenderFilterSignature = "";
  let lastRenderLoading = state.loading;

  const updateRow = (
    row: HTMLDivElement,
    item: KeyInfoItem,
    onItemClick?: (item: KeyInfoItem) => void
  ) => {
    row.className = "doc-assistant-keyinfo__row";
    row.dataset.keyinfoId = item.id;
    row.dataset.type = item.type;
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
    const renderedText = formatKeyInfoDockText(item);
    text.textContent = renderedText;

    if (item.blockId && onItemClick) {
      row.classList.remove("is-disabled");
      row.classList.add("is-clickable");
      row.setAttribute("role", "button");
      row.setAttribute("aria-disabled", "false");
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
      row.classList.remove("is-clickable");
      row.classList.add("is-disabled");
      row.removeAttribute("role");
      row.setAttribute("aria-disabled", "true");
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
    const visible = filterKeyInfoDockItems(state.items, state.filter);
    if (state.loading && !visible.length) {
      list.replaceChildren();
      const empty = document.createElement("div");
      empty.className = "doc-assistant-keyinfo__empty ft__secondary";
      empty.textContent = "加载中...";
      list.appendChild(empty);
      lastRenderIds = [];
      lastRenderFilterSignature = getFilterSignature();
      lastRenderLoading = state.loading;
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
      lastRenderLoading = state.loading;
      applyPostRenderScroll();
      return;
    }

    const filterSignature = getFilterSignature();
    const canAppend =
      lastRenderIds.length > 0 &&
      filterSignature === lastRenderFilterSignature &&
      state.loading === lastRenderLoading &&
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
          row = buildKeyInfoDockRow(item);
          updateRow(row, item, handleItemClick);
          rowCache.set(item.id, row);
        }
        list.appendChild(row);
      }
      lastRenderIds = visible.map((item) => item.id);
      lastRenderFilterSignature = filterSignature;
      lastRenderLoading = state.loading;
      applyPostRenderScroll();
      return;
    }

    const fragment = document.createDocumentFragment();
    const activeIds = new Set<string>();
    visible.forEach((item) => {
      activeIds.add(item.id);
      let row = rowCache.get(item.id);
      if (!row) {
        row = buildKeyInfoDockRow(item);
        rowCache.set(item.id, row);
      }
      updateRow(row, item, state.loading ? undefined : handleItemClick);
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
    lastRenderLoading = state.loading;
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
    if (state.activeTab === "key-info") {
      const visibleCount = filterKeyInfoDockItems(state.items, state.filter).length;
      meta.textContent = `关键内容 ${state.items.length} · 当前筛选 ${visibleCount}`;
      return;
    }
    const registeredCount = state.docActions.filter((action) => action.menuRegistered).length;
    meta.textContent = `文档命令 ${state.docActions.length} · 收藏 ${state.favoriteActionKeys.length} · 已注册 ${registeredCount}`;
  };

  const setState = (next: Partial<KeyInfoDockState>) => {
    const prevState: KeyInfoDockStateSnapshot = {
      items: state.items,
      filter: state.filter,
      loading: state.loading,
      emptyText: state.emptyText,
      activeTab: state.activeTab,
      docMenuRegisterAll: state.docMenuRegisterAll,
      docActions: state.docActions,
      favoriteActionKeys: state.favoriteActionKeys,
      scrollContextKey: state.scrollContextKey,
    };
    Object.assign(state, next);
    const renderFlags = deriveKeyInfoDockRenderFlags(prevState, state);
    scrollState = updateKeyInfoListScrollContext(scrollState, state.scrollContextKey);
    if (renderFlags.scrollContextChanged) {
      scrollLock = null;
    }
    renderHeader();
    renderLoadingState();
    updateFilterButtons();
    updateTabButtons();
    renderTabPanels();
    if (renderFlags.renderDocActions) {
      renderDocActions();
    }
    if (renderFlags.renderList) {
      renderList();
    }
  };

  updateFilterButtons();
  updateTabButtons();
  renderTabPanels();
  renderHeader();
  renderLoadingState();
  renderList();
  renderDocActions();

  return {
    setState,
    getState: () => ({ ...state }),
    getVisibleItems: () => filterKeyInfoDockItems(state.items, state.filter),
    destroy: () => {
      clearTimeout(entryAnimationTimer);
      element.replaceChildren();
    },
  };
}
