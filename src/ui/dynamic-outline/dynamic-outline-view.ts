import {
  calculateViewportIndicator,
  DynamicOutlineItem,
  DynamicOutlinePosition,
  filterDynamicOutlineItems,
  FilteredOutlineItem,
  highlightMatchRanges
} from "@/core/dynamic-outline-core";
import { resolveKeyInfoTypeLabel } from "@/core/key-info-core";
import { HeadingLevel } from "@/core/key-info-heading-color-core";
import { applyHeadingColorsToElement } from "@/services/key-info-heading-color";

const LUCIDE_SEARCH_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8" fill="none"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';

const LUCIDE_X_SVG =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

const LUCIDE_LIST_TREE_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12h-8" fill="none"></path><path d="M21 6H8" fill="none"></path><path d="M21 18h-8" fill="none"></path><path d="M3 6v4c0 1.1.9 2 2 2h3" fill="none"></path><path d="M3 10v6c0 1.1.9 2 2 2h3" fill="none"></path></svg>';

const LUCIDE_PIN_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" fill="none"></path></svg>';

const LUCIDE_PIN_ACTIVE_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" fill="none"></path></svg>';

const LUCIDE_SWITCH_SIDE_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7 3 12l5 5" fill="none"></path><path d="M3 12h18"></path><path d="m16 17 5-5-5-5" fill="none"></path></svg>';

const LUCIDE_ARROW_UP_TO_LINE_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6" fill="none"></path><path d="M6 5h12"></path></svg>';

const LUCIDE_ARROW_DOWN_TO_LINE_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" fill="none"></path><path d="M6 19h12"></path></svg>';

export type DynamicOutlineViewOptions = {
  position?: DynamicOutlinePosition;
  isZh?: boolean;
  onItemClick: (item: DynamicOutlineItem) => void;
  onPinChange?: (pinned: boolean) => void;
  onTogglePosition?: (nextPosition: DynamicOutlinePosition) => void;
  onJumpToTop?: () => void;
  onJumpToBottom?: () => void;
  onSearchChange?: (query: string, showTreeContext: boolean) => void;
};

export type DynamicOutlineViewHandle = {
  setItems: (items: DynamicOutlineItem[], modeLabel?: string) => void;
  setScroll: (
    scrollTop: number,
    scrollHeight: number,
    clientHeight: number,
    overrideProgressRatio?: number
  ) => void;
  setActiveIndex: (index: number) => void;
  setPosition: (position: DynamicOutlinePosition) => void;
  setHeadingColors: (colors: Record<HeadingLevel, string>) => void;
  resetSearch: () => void;
  setSearchQuery: (query: string) => void;
  destroy: () => void;
  element: HTMLElement;
};

export function createDynamicOutlineView(
  parent: HTMLElement,
  options: DynamicOutlineViewOptions
): DynamicOutlineViewHandle {
  let currentPosition: DynamicOutlinePosition = options.position || "right";

  const container = document.createElement("div");
  container.className = `doc-assistant-dynamic-outline is-${currentPosition}`;

  const minimap = document.createElement("div");
  minimap.className = "doc-assistant-dynamic-outline__minimap";
  container.appendChild(minimap);

  const viewportIndicator = document.createElement("div");
  viewportIndicator.className = "doc-assistant-dynamic-outline__viewport";
  minimap.appendChild(viewportIndicator);

  const flyout = document.createElement("div");
  flyout.className = "doc-assistant-dynamic-outline__flyout";
  container.appendChild(flyout);

  const header = document.createElement("div");
  header.className = "doc-assistant-dynamic-outline__header";
  flyout.appendChild(header);

  const titleWrap = document.createElement("div");
  titleWrap.className = "doc-assistant-dynamic-outline__title";
  header.appendChild(titleWrap);

  const titleText = document.createElement("span");
  titleText.className = "doc-assistant-dynamic-outline__title-text";
  titleText.textContent = "文档大纲";
  titleWrap.appendChild(titleText);

  const countBadge = document.createElement("span");
  countBadge.className = "doc-assistant-dynamic-outline__count";
  countBadge.textContent = "0";
  titleWrap.appendChild(countBadge);

  const isZh = options.isZh !== undefined ? options.isZh : true;

  const actionsWrap = document.createElement("div");
  actionsWrap.className = "doc-assistant-dynamic-outline__header-actions";
  header.appendChild(actionsWrap);

  const toTopBtn = document.createElement("button");
  toTopBtn.className = "doc-assistant-dynamic-outline__btn doc-assistant-dynamic-outline__top-btn";
  toTopBtn.setAttribute("type", "button");
  toTopBtn.setAttribute("title", isZh ? "跳转到文档开头" : "Jump to top");
  toTopBtn.innerHTML = LUCIDE_ARROW_UP_TO_LINE_SVG;
  actionsWrap.appendChild(toTopBtn);

  const toBottomBtn = document.createElement("button");
  toBottomBtn.className = "doc-assistant-dynamic-outline__btn doc-assistant-dynamic-outline__bottom-btn";
  toBottomBtn.setAttribute("type", "button");
  toBottomBtn.setAttribute("title", isZh ? "跳转到文档结尾" : "Jump to bottom");
  toBottomBtn.innerHTML = LUCIDE_ARROW_DOWN_TO_LINE_SVG;
  actionsWrap.appendChild(toBottomBtn);

  const switchSideBtn = document.createElement("button");
  switchSideBtn.className = "doc-assistant-dynamic-outline__btn doc-assistant-dynamic-outline__switch-btn";
  switchSideBtn.setAttribute("type", "button");
  switchSideBtn.setAttribute("title", currentPosition === "left" ? "停靠在右侧" : "停靠在左侧");
  switchSideBtn.innerHTML = LUCIDE_SWITCH_SIDE_SVG;
  actionsWrap.appendChild(switchSideBtn);

  const pinBtn = document.createElement("button");
  pinBtn.className = "doc-assistant-dynamic-outline__btn doc-assistant-dynamic-outline__pin-btn";
  pinBtn.setAttribute("type", "button");
  pinBtn.setAttribute("title", "固定大纲");
  pinBtn.innerHTML = LUCIDE_PIN_SVG;
  actionsWrap.appendChild(pinBtn);

  // 搜索栏组件
  const searchBar = document.createElement("div");
  searchBar.className = "doc-assistant-dynamic-outline__search-bar";
  flyout.appendChild(searchBar);

  const searchInputWrap = document.createElement("div");
  searchInputWrap.className = "doc-assistant-dynamic-outline__search-input-wrap";
  searchBar.appendChild(searchInputWrap);

  const searchIcon = document.createElement("span");
  searchIcon.className = "doc-assistant-dynamic-outline__search-icon";
  searchIcon.innerHTML = LUCIDE_SEARCH_SVG;
  searchInputWrap.appendChild(searchIcon);

  const searchInput = document.createElement("input");
  searchInput.className = "doc-assistant-dynamic-outline__search-input";
  searchInput.type = "text";
  searchInput.placeholder = isZh ? "过滤章节 (拼音首字母/关键词)" : "Filter chapters (pinyin/keyword)";
  searchInputWrap.appendChild(searchInput);

  const clearBtn = document.createElement("button");
  clearBtn.className = "doc-assistant-dynamic-outline__btn doc-assistant-dynamic-outline__search-clear";
  clearBtn.type = "button";
  clearBtn.setAttribute("title", isZh ? "清空搜索 (Esc)" : "Clear search (Esc)");
  clearBtn.innerHTML = LUCIDE_X_SVG;
  clearBtn.style.display = "none";
  searchInputWrap.appendChild(clearBtn);

  const searchMeta = document.createElement("div");
  searchMeta.className = "doc-assistant-dynamic-outline__search-meta";
  searchBar.appendChild(searchMeta);

  const matchCountBadge = document.createElement("span");
  matchCountBadge.className = "doc-assistant-dynamic-outline__search-count";
  matchCountBadge.textContent = isZh ? "0 项" : "0 items";
  searchMeta.appendChild(matchCountBadge);

  const treeToggleBtn = document.createElement("button");
  treeToggleBtn.className = "doc-assistant-dynamic-outline__btn doc-assistant-dynamic-outline__tree-toggle";
  treeToggleBtn.type = "button";
  treeToggleBtn.innerHTML = LUCIDE_LIST_TREE_SVG;
  searchMeta.appendChild(treeToggleBtn);

  const list = document.createElement("div");
  list.className = "doc-assistant-dynamic-outline__list";
  flyout.appendChild(list);

  let currentItems: DynamicOutlineItem[] = [];
  let currentModeLabel = "文档大纲";
  let filteredItems: FilteredOutlineItem[] = [];
  let searchQuery = "";
  let showTreeContext = false;
  let selectedFilteredIndex = -1;
  let isPinned = false;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let activeIndex = -1;
  const itemElements: HTMLElement[] = [];
  const tickElements: HTMLElement[] = [];

  const updateTreeToggleBtn = () => {
    if (showTreeContext) {
      treeToggleBtn.classList.add("is-active");
      treeToggleBtn.setAttribute(
        "title",
        isZh ? "当前：树形上下文模式（点击切换为紧凑模式）" : "Current: Tree context (click for compact)"
      );
    } else {
      treeToggleBtn.classList.remove("is-active");
      treeToggleBtn.setAttribute(
        "title",
        isZh ? "当前：紧凑模式（点击切换为树形上下文）" : "Current: Compact mode (click for tree context)"
      );
    }
  };
  updateTreeToggleBtn();

  const updatePositionClass = (pos: DynamicOutlinePosition) => {
    currentPosition = pos;
    container.classList.remove("is-left", "is-right");
    container.classList.add(`is-${pos}`);
    switchSideBtn.setAttribute("title", pos === "left" ? "停靠在右侧" : "停靠在左侧");
  };

  let isComposing = false;

  const isInputActive = () => {
    return isComposing || document.activeElement === searchInput;
  };

  const openFlyout = () => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    flyout.classList.add("is-open");
  };

  const closeFlyoutLater = () => {
    if (isPinned || isInputActive()) {
      return;
    }
    if (closeTimer) {
      clearTimeout(closeTimer);
    }
    closeTimer = setTimeout(() => {
      if (isPinned || isInputActive()) {
        closeTimer = null;
        return;
      }
      flyout.classList.remove("is-open");
      closeTimer = null;
    }, 300);
  };

  container.addEventListener("mouseenter", openFlyout);
  container.addEventListener("mouseleave", closeFlyoutLater);

  toTopBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    options.onJumpToTop?.();
  });

  toBottomBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    options.onJumpToBottom?.();
  });

  pinBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    isPinned = !isPinned;
    if (isPinned) {
      pinBtn.classList.add("is-pinned");
      pinBtn.setAttribute("title", "取消固定");
      pinBtn.innerHTML = LUCIDE_PIN_ACTIVE_SVG;
      openFlyout();
    } else {
      pinBtn.classList.remove("is-pinned");
      pinBtn.setAttribute("title", "固定大纲");
      pinBtn.innerHTML = LUCIDE_PIN_SVG;
      closeFlyoutLater();
    }
    options.onPinChange?.(isPinned);
  });

  switchSideBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const nextPos: DynamicOutlinePosition = currentPosition === "left" ? "right" : "left";
    updatePositionClass(nextPos);
    options.onTogglePosition?.(nextPos);
  });

  parent.appendChild(container);

  const renderMinimapTicks = () => {
    const ticks = minimap.querySelectorAll(".doc-assistant-dynamic-outline__tick");
    ticks.forEach((tick) => tick.remove());
    tickElements.length = 0;

    const trackHeight = minimap.clientHeight || 260;
    currentItems.forEach((item) => {
      const tick = document.createElement("div");
      tick.className = "doc-assistant-dynamic-outline__tick";
      tick.setAttribute("data-level", String(item.level));
      tick.setAttribute("data-item-id", item.id);
      const topPx = Math.round(item.posRatio * (trackHeight - 6)) + 3;
      tick.style.top = `${topPx}px`;
      minimap.appendChild(tick);
      tickElements.push(tick);
    });
  };

  const updateMinimapFilterMarks = (matchedIds: Set<string>) => {
    const hasFilter = searchQuery.trim().length > 0;
    if (!hasFilter) {
      minimap.classList.remove("is-filtering");
      tickElements.forEach((tick) => {
        tick.classList.remove("is-dimmed", "is-matched");
      });
      return;
    }

    minimap.classList.add("is-filtering");
    tickElements.forEach((tick) => {
      const itemId = tick.getAttribute("data-item-id") || "";
      if (matchedIds.has(itemId)) {
        tick.classList.add("is-matched");
        tick.classList.remove("is-dimmed");
      } else {
        tick.classList.add("is-dimmed");
        tick.classList.remove("is-matched");
      }
    });
  };

  const renderList = () => {
    list.innerHTML = "";
    itemElements.length = 0;

    titleText.textContent = currentModeLabel || "文档大纲";

    if (filteredItems.length === 0) {
      const empty = document.createElement("div");
      empty.className = "doc-assistant-dynamic-outline__empty";
      empty.textContent = searchQuery.trim() ?
          (isZh ? "未匹配到相关章节" : "No matching chapters") :
          (isZh ? "暂无大纲内容" : "No outline items");
      list.appendChild(empty);
      return;
    }

    filteredItems.forEach((fItem, index) => {
      const item = fItem.item;
      const row = document.createElement("div");
      row.className = "doc-assistant-dynamic-outline__item";
      row.setAttribute("data-level", String(item.level));
      row.setAttribute("data-block-id", item.blockId);

      if (fItem.isAncestor) {
        row.classList.add("is-ancestor");
        row.setAttribute("title", isZh ? "父级上下文" : "Parent context");
      }
      if (index === selectedFilteredIndex) {
        row.classList.add("is-selected");
      }
      if (activeIndex >= 0 && currentItems[activeIndex] && currentItems[activeIndex].id === item.id) {
        row.classList.add("is-active");
      }

      if (item.level === 0 && item.type !== "title") {
        const badge = document.createElement("span");
        badge.className = "doc-assistant-dynamic-outline__item-badge";
        badge.setAttribute("data-type", item.type);
        badge.textContent = resolveKeyInfoTypeLabel(item.type, isZh);
        row.appendChild(badge);
      }

      const textSpan = document.createElement("span");
      textSpan.className = "doc-assistant-dynamic-outline__item-text";
      textSpan.setAttribute("data-level", String(item.level));
      textSpan.setAttribute("title", item.text);

      if (fItem.matchRange) {
        const segments = highlightMatchRanges(item.text, fItem.matchRange);
        segments.forEach((seg) => {
          if (seg.highlight) {
            const mark = document.createElement("mark");
            mark.className = "doc-assistant-dynamic-outline__highlight";
            mark.textContent = seg.text;
            textSpan.appendChild(mark);
          } else {
            textSpan.appendChild(document.createTextNode(seg.text));
          }
        });
      } else {
        textSpan.textContent = item.text || "(空)";
      }

      row.appendChild(textSpan);

      row.addEventListener("click", () => {
        options.onItemClick(item);
        if (!isPinned) {
          flyout.classList.remove("is-open");
        }
      });

      list.appendChild(row);
      itemElements.push(row);
    });
  };

  const updateFilteredView = () => {
    const query = searchQuery.trim();
    clearBtn.style.display = query ? "inline-flex" : "none";

    if (!query) {
      searchBar.classList.remove("is-filtering");
      countBadge.textContent = String(currentItems.length);
      matchCountBadge.textContent = isZh ? `${currentItems.length} 项` : `${currentItems.length} items`;
      filteredItems = currentItems.map((item) => ({ item, isAncestor: false }));
      updateMinimapFilterMarks(new Set());
    } else {
      searchBar.classList.add("is-filtering");
      filteredItems = filterDynamicOutlineItems(currentItems, query, { showTreeContext });
      const directMatchCount = filteredItems.filter((f) => !f.isAncestor).length;
      countBadge.textContent = `${directMatchCount}/${currentItems.length}`;
      matchCountBadge.textContent = isZh ?
        `${directMatchCount}/${currentItems.length} 项` :
        `${directMatchCount}/${currentItems.length}`;
      const matchedIds = new Set(filteredItems.map((f) => f.item.id));
      updateMinimapFilterMarks(matchedIds);
    }

    if (selectedFilteredIndex >= filteredItems.length) {
      selectedFilteredIndex = -1;
    }

    renderList();
  };

  const updateSelectionHighlight = () => {
    itemElements.forEach((el, i) => {
      if (i === selectedFilteredIndex) {
        el.classList.add("is-selected");
        if (typeof el.scrollIntoView === "function") {
          el.scrollIntoView({ block: "nearest" });
        }
      } else {
        el.classList.remove("is-selected");
      }
    });
  };

  searchInput.addEventListener("focus", () => {
    openFlyout();
  });

  searchInput.addEventListener("blur", () => {
    setTimeout(() => {
      if (!isPinned && !isComposing && document.activeElement !== searchInput) {
        const isHovered = typeof container.matches === "function" ? container.matches(":hover") : false;
        if (!isHovered) {
          closeFlyoutLater();
        }
      }
    }, 150);
  });

  searchInput.addEventListener("compositionstart", () => {
    isComposing = true;
    openFlyout();
  });

  searchInput.addEventListener("compositionend", () => {
    isComposing = false;
    searchQuery = searchInput.value;
    selectedFilteredIndex = -1;
    updateFilteredView();
    options.onSearchChange?.(searchQuery, showTreeContext);
  });

  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value;
    selectedFilteredIndex = -1;
    updateFilteredView();
    options.onSearchChange?.(searchQuery, showTreeContext);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filteredItems.length > 0) {
        selectedFilteredIndex =
          selectedFilteredIndex < filteredItems.length - 1 ? selectedFilteredIndex + 1 : 0;
        updateSelectionHighlight();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filteredItems.length > 0) {
        selectedFilteredIndex =
          selectedFilteredIndex > 0 ? selectedFilteredIndex - 1 : filteredItems.length - 1;
        updateSelectionHighlight();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredItems.length > 0) {
        const target =
          selectedFilteredIndex >= 0 && filteredItems[selectedFilteredIndex] ?
            filteredItems[selectedFilteredIndex] :
              (filteredItems.find((f) => !f.isAncestor) || filteredItems[0]);
        if (target) {
          options.onItemClick(target.item);
          if (!isPinned) {
            flyout.classList.remove("is-open");
          }
        }
      }
    } else if (e.key === "Escape") {
      if (e.isComposing || isComposing) {
        return;
      }
      if (searchInput.value) {
        searchInput.value = "";
        searchQuery = "";
        selectedFilteredIndex = -1;
        updateFilteredView();
        options.onSearchChange?.("", showTreeContext);
        e.stopPropagation();
      } else if (!isPinned) {
        flyout.classList.remove("is-open");
        e.stopPropagation();
      }
    }
  });

  clearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    searchInput.value = "";
    searchQuery = "";
    selectedFilteredIndex = -1;
    updateFilteredView();
    searchInput.focus();
    options.onSearchChange?.("", showTreeContext);
  });

  treeToggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showTreeContext = !showTreeContext;
    updateTreeToggleBtn();
    updateFilteredView();
    options.onSearchChange?.(searchQuery, showTreeContext);
  });

  flyout.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  const setItems = (items: DynamicOutlineItem[], modeLabel?: string) => {
    currentItems = items;
    if (modeLabel) {
      currentModeLabel = modeLabel;
    }
    renderMinimapTicks();
    updateFilteredView();
  };

  const setScroll = (
    scrollTop: number,
    scrollHeight: number,
    clientHeight: number,
    overrideProgressRatio?: number
  ) => {
    const trackHeight = minimap.clientHeight || 260;
    const { top, height } = calculateViewportIndicator(
      scrollTop,
      scrollHeight,
      clientHeight,
      trackHeight,
      overrideProgressRatio
    );
    viewportIndicator.style.top = `${top}px`;
    viewportIndicator.style.height = `${height}px`;
  };

  const setActiveIndex = (index: number) => {
    activeIndex = index;
    const targetItem = currentItems[index];
    const targetFilteredIdx = targetItem ? filteredItems.findIndex((f) => f.item.id === targetItem.id) : -1;
    itemElements.forEach((el, i) => {
      if (i === targetFilteredIdx) {
        el.classList.add("is-active");
      } else {
        el.classList.remove("is-active");
      }
    });
  };

  const setPosition = (position: DynamicOutlinePosition) => {
    updatePositionClass(position);
  };

  const setHeadingColors = (colors: Record<HeadingLevel, string>) => {
    applyHeadingColorsToElement(container, colors);
  };

  const resetSearch = () => {
    searchInput.value = "";
    searchQuery = "";
    selectedFilteredIndex = -1;
    updateFilteredView();
  };

  const setSearchQuery = (query: string) => {
    searchInput.value = query;
    searchQuery = query;
    selectedFilteredIndex = -1;
    updateFilteredView();
  };

  const destroy = () => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    container.remove();
  };

  return {
    setItems,
    setScroll,
    setActiveIndex,
    setPosition,
    setHeadingColors,
    resetSearch,
    setSearchQuery,
    destroy,
    element: container
  };
}
