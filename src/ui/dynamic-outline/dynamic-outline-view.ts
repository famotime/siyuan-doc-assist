import { ClipboardHistoryItem, filterClipboardItems } from "@/core/clipboard-core";
import {
  calculateViewportIndicator,
  computeOutlineExpandableIds,
  DEFAULT_DYNAMIC_OUTLINE_VIEW_MODES,
  deduplicateRecentDocs,
  DynamicOutlineItem,
  DynamicOutlinePosition,
  DynamicOutlineViewMode,
  filterCollapsedOutlineItems,
  filterDynamicOutlineItems,
  FilteredOutlineItem,
  FilteredOpenDocItem,
  FilteredRecentDocItem,
  filterOpenDocItems,
  filterRecentDocItems,
  normalizeDynamicOutlineViewModes,
  OpenDocTabItem,
  RecentDocItem
} from "@/core/dynamic-outline-core";
import { resolveKeyInfoTypeLabel } from "@/core/key-info-core";
import { HeadingLevel } from "@/core/key-info-heading-color-core";
import { applyHeadingColorsToElement } from "@/services/key-info-heading-color";
import { createDynamicOutlineClipboardController } from "@/ui/dynamic-outline/dynamic-outline-clipboard-batch";
import { createDocPopoverController } from "@/ui/dynamic-outline/dynamic-outline-doc-popover";
import {
  appendHighlightedText,
  renderOpenDocsPanel,
  VisibleDocEntry
} from "@/ui/dynamic-outline/dynamic-outline-docs-panel";

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

const LUCIDE_FLOAT_TEXT_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h4"></path><rect width="10" height="7" x="12" y="13" rx="2"></rect></svg>';

const LUCIDE_MODE_SWITCH_SVG =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5" fill="none"></path><path d="m7 9 5-5 5 5" fill="none"></path></svg>';

const LUCIDE_CHEVRON_DOWN_SVG =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" fill="none"></path></svg>';

export type DynamicOutlineViewOptions = {
  position?: DynamicOutlinePosition;
  initialViewMode?: DynamicOutlineViewMode;
  availableViewModes?: DynamicOutlineViewMode[];
  quickSwitchEnabled?: boolean;
  initialOpenDocsExpanded?: boolean;
  initialRecentDocsExpanded?: boolean;
  isZh?: boolean;
  onItemClick: (item: DynamicOutlineItem) => void;
  onOpenDocClick?: (item: OpenDocTabItem) => void;
  onRecentDocClick?: (item: RecentDocItem) => void;
  onDocSectionsChange?: (sections: {
    openDocsExpanded: boolean;
    recentDocsExpanded: boolean;
  }) => void;
  onViewModeChange?: (mode: DynamicOutlineViewMode) => void;
  onFlyoutOpen?: () => void;
  onPinChange?: (pinned: boolean) => void;
  onTogglePosition?: (nextPosition: DynamicOutlinePosition) => void;
  onJumpToTop?: () => void;
  onJumpToBottom?: () => void;
  onFloatSelectedText?: () => void;
  onSearchChange?: (query: string, showTreeContext: boolean) => void;
  onClipboardCopy?: (item: ClipboardHistoryItem) => Promise<{ ok: boolean; reason?: string }>;
  onClipboardCopyMerged?: (ids: string[]) => Promise<{ ok: boolean; reason?: string; skippedImageCount?: number }>;
  onClipboardAggregate?: (ids: string[]) => Promise<{
    ok: boolean;
    items?: ClipboardHistoryItem[];
    reason?: string;
    skippedImageCount?: number;
  }>;
  onClipboardToggleFavorite?: (id: string) => Promise<void> | void;
  onClipboardDelete?: (id: string) => Promise<void> | void;
  onClipboardDeleteBatch?: (ids: string[]) => Promise<void> | void;
  onClipboardClearNonFavorites?: () => Promise<void> | void;
  onClipboardOpenFileLocation?: (filePath: string) => Promise<{ ok: boolean; reason?: string }>;
  resolveClipboardImageUrl?: (imageFileName?: string) => string | null;
};

export type DynamicOutlineViewHandle = {
  setItems: (items: DynamicOutlineItem[], modeLabel?: string) => void;
  setOpenDocs: (items: OpenDocTabItem[]) => void;
  setClipboardItems: (items: ClipboardHistoryItem[]) => void;
  setAvailableViewModes: (modes: DynamicOutlineViewMode[]) => void;
  setQuickSwitchEnabled: (enabled: boolean) => void;
  setRecentDocs: (items: RecentDocItem[]) => void;
  setViewMode: (mode: DynamicOutlineViewMode) => void;
  getViewMode: () => DynamicOutlineViewMode;
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

function createActionButton(className: string, title: string, iconSvg: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = className;
  btn.setAttribute("type", "button");
  btn.setAttribute("title", title);
  btn.innerHTML = iconSvg;
  return btn;
}

function formatQuickBadgeCount(count: number): string {
  return count > 99 ? "99+" : String(Math.max(0, count));
}

export function createDynamicOutlineView(
  parent: HTMLElement,
  options: DynamicOutlineViewOptions
): DynamicOutlineViewHandle {
  const isZh = options.isZh !== undefined ? options.isZh : true;
  let currentPosition: DynamicOutlinePosition = options.position || "right";
  let quickSwitchEnabled = Boolean(options.quickSwitchEnabled);

  const container = document.createElement("div");
  container.className = `doc-assistant-dynamic-outline is-${currentPosition}`;

  const rail = document.createElement("div");
  rail.className = "doc-assistant-dynamic-outline__rail";
  container.appendChild(rail);

  const openDocsQuickBadge = document.createElement("button");
  openDocsQuickBadge.className = "doc-assistant-dynamic-outline__quick-badge is-open-docs";
  openDocsQuickBadge.setAttribute("type", "button");
  openDocsQuickBadge.textContent = "0";
  openDocsQuickBadge.style.display = "none";
  rail.appendChild(openDocsQuickBadge);

  const minimap = document.createElement("div");
  minimap.className = "doc-assistant-dynamic-outline__minimap";
  rail.appendChild(minimap);

  const clipboardQuickBadge = document.createElement("button");
  clipboardQuickBadge.className = "doc-assistant-dynamic-outline__quick-badge is-clipboard";
  clipboardQuickBadge.setAttribute("type", "button");
  clipboardQuickBadge.textContent = "0";
  clipboardQuickBadge.style.display = "none";
  rail.appendChild(clipboardQuickBadge);

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

  const titleBtn = document.createElement("button");
  titleBtn.className = "doc-assistant-dynamic-outline__title-btn";
  titleBtn.setAttribute("type", "button");
  titleWrap.appendChild(titleBtn);

  const titleText = document.createElement("span");
  titleText.className = "doc-assistant-dynamic-outline__title-text";
  titleText.textContent = "文档大纲";
  titleBtn.appendChild(titleText);

  const titleSwitchIcon = document.createElement("span");
  titleSwitchIcon.className = "doc-assistant-dynamic-outline__title-switch-icon";
  titleSwitchIcon.innerHTML = LUCIDE_MODE_SWITCH_SVG;
  titleBtn.appendChild(titleSwitchIcon);

  const countBadge = document.createElement("span");
  countBadge.className = "doc-assistant-dynamic-outline__count";
  countBadge.textContent = "0";
  titleWrap.appendChild(countBadge);

  const titleDropdown = document.createElement("div");
  titleDropdown.className = "doc-assistant-dynamic-outline__title-dropdown";
  titleDropdown.style.display = "none";
  titleWrap.appendChild(titleDropdown);

  const actionsWrap = document.createElement("div");
  actionsWrap.className = "doc-assistant-dynamic-outline__header-actions";
  header.appendChild(actionsWrap);

  const toTopBtn = createActionButton(
    "doc-assistant-dynamic-outline__btn doc-assistant-dynamic-outline__top-btn",
    isZh ? "跳转到文档开头" : "Jump to top",
    LUCIDE_ARROW_UP_TO_LINE_SVG
  );
  const toBottomBtn = createActionButton(
    "doc-assistant-dynamic-outline__btn doc-assistant-dynamic-outline__bottom-btn",
    isZh ? "跳转到文档结尾" : "Jump to bottom",
    LUCIDE_ARROW_DOWN_TO_LINE_SVG
  );
  const floatSelectedLabel = isZh ?
    "悬浮选中文本（未选中文本时自动悬浮整篇文档）" :
    "Float selected text (or current doc)";
  const floatSelectedBtn = createActionButton(
    "doc-assistant-dynamic-outline__btn doc-assistant-dynamic-outline__float-btn",
    floatSelectedLabel,
    LUCIDE_FLOAT_TEXT_SVG
  );
  floatSelectedBtn.setAttribute("aria-label", floatSelectedLabel);
  floatSelectedBtn.addEventListener("mousedown", (e) => e.preventDefault());
  floatSelectedBtn.addEventListener("click", () => options.onFloatSelectedText?.());

  const switchSideBtn = createActionButton(
    "doc-assistant-dynamic-outline__btn doc-assistant-dynamic-outline__switch-btn",
    currentPosition === "left" ? "停靠在右侧" : "停靠在左侧",
    LUCIDE_SWITCH_SIDE_SVG
  );
  const pinBtn = createActionButton(
    "doc-assistant-dynamic-outline__btn doc-assistant-dynamic-outline__pin-btn",
    "固定大纲",
    LUCIDE_PIN_SVG
  );
  actionsWrap.append(toTopBtn, toBottomBtn, floatSelectedBtn, switchSideBtn, pinBtn);

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

  const clearBtn = createActionButton(
    "doc-assistant-dynamic-outline__btn doc-assistant-dynamic-outline__search-clear",
    isZh ? "清空搜索 (Esc)" : "Clear search (Esc)",
    LUCIDE_X_SVG
  );
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

  let availableViewModes: DynamicOutlineViewMode[] = normalizeDynamicOutlineViewModes(
    options.availableViewModes || DEFAULT_DYNAMIC_OUTLINE_VIEW_MODES
  );
  let viewMode: DynamicOutlineViewMode =
    options.initialViewMode && availableViewModes.includes(options.initialViewMode) ?
      options.initialViewMode :
      availableViewModes[0];
  let currentItems: DynamicOutlineItem[] = [];
  let currentModeLabel = "文档大纲";
  let filteredItems: FilteredOutlineItem[] = [];
  let currentOpenDocs: OpenDocTabItem[] = [];
  let currentRecentDocsRaw: RecentDocItem[] = [];
  let currentRecentDocs: RecentDocItem[] = [];
  let filteredOpenDocs: FilteredOpenDocItem[] = [];
  let currentClipboardItems: ClipboardHistoryItem[] = [];
  let filteredClipboardItems: ClipboardHistoryItem[] = [];
  let filteredRecentDocs: FilteredRecentDocItem[] = [];
  let openDocsExpanded = options.initialOpenDocsExpanded ?? true;
  let recentDocsExpanded = options.initialRecentDocsExpanded ?? false;
  let visibleDocEntries: VisibleDocEntry[] = [];
  let isDropdownOpen = false;
  let searchQuery = "";
  let showTreeContext = false;
  let selectedFilteredIndex = -1;
  let isPinned = false;
  let isComposing = false;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let blurTimer: ReturnType<typeof setTimeout> | null = null;
  let activeIndex = -1;
  const collapsedHeadingIds = new Set<string>();
  const itemElements: HTMLElement[] = [];
  const tickElements: HTMLElement[] = [];

  let renderListFn: () => void = () => {};
  let updateFilteredViewFn: () => void = () => {};
  let closeFlyoutLaterFn: (relatedTarget?: EventTarget | null) => void = () => {};

  const docPopover = createDocPopoverController({
    container,
    list,
    getRowElements: () => itemElements,
    onLeaveOutside: () => closeFlyoutLaterFn()
  });

  const clipboardController = createDynamicOutlineClipboardController({
    getViewMode: () => viewMode,
    getAllItems: () => currentClipboardItems,
    getFilteredItems: () => filteredClipboardItems,
    onFilterChanged: () => {
      selectedFilteredIndex = -1;
      updateFilteredViewFn();
    },
    onRequestRenderList: () => renderListFn(),
    onClipboardCopy: options.onClipboardCopy,
    onClipboardCopyMerged: options.onClipboardCopyMerged,
    onClipboardAggregate: options.onClipboardAggregate,
    onClipboardToggleFavorite: options.onClipboardToggleFavorite,
    onClipboardDelete: options.onClipboardDelete,
    onClipboardDeleteBatch: options.onClipboardDeleteBatch,
    onClipboardClearNonFavorites: options.onClipboardClearNonFavorites,
    onClipboardOpenFileLocation: options.onClipboardOpenFileLocation,
    resolveClipboardImageUrl: options.resolveClipboardImageUrl
  });
  flyout.insertBefore(clipboardController.filterBarElement, list);
  flyout.insertBefore(clipboardController.batchBarElement, list);

  const getModeDisplayLabel = (mode: DynamicOutlineViewMode): string => {
    if (mode === "open-docs") {
      return isZh ? "已打开文档" : "Open Docs";
    }
    if (mode === "clipboard") {
      return isZh ? "剪贴板" : "Clipboard";
    }
    return currentModeLabel || (isZh ? "文档大纲" : "Outline");
  };

  const closeTitleDropdown = () => {
    if (!isDropdownOpen) {
      return;
    }
    isDropdownOpen = false;
    titleDropdown.style.display = "none";
    titleBtn.classList.remove("is-dropdown-open");
  };

  const syncQuickBadges = () => {
    const showOpenDocs = quickSwitchEnabled && availableViewModes.includes("open-docs");
    const showClipboard = quickSwitchEnabled && availableViewModes.includes("clipboard");

    const openDocsCount = currentOpenDocs.length;
    openDocsQuickBadge.style.display = showOpenDocs ? "inline-flex" : "none";
    openDocsQuickBadge.textContent = formatQuickBadgeCount(openDocsCount);
    openDocsQuickBadge.classList.toggle("is-active", viewMode === "open-docs");
    const openDocsLabel = isZh ? `已打开文档 (${openDocsCount})` : `Open Docs (${openDocsCount})`;
    openDocsQuickBadge.setAttribute("title", openDocsLabel);
    openDocsQuickBadge.setAttribute("aria-label", openDocsLabel);

    const clipboardCount = currentClipboardItems.length;
    clipboardQuickBadge.style.display = showClipboard ? "inline-flex" : "none";
    clipboardQuickBadge.textContent = formatQuickBadgeCount(clipboardCount);
    clipboardQuickBadge.classList.toggle("is-active", viewMode === "clipboard");
    const clipboardLabel = isZh ? `剪贴板 (${clipboardCount})` : `Clipboard (${clipboardCount})`;
    clipboardQuickBadge.setAttribute("title", clipboardLabel);
    clipboardQuickBadge.setAttribute("aria-label", clipboardLabel);
  };

  let switchToViewModeFn: (mode: DynamicOutlineViewMode) => void = () => {};

  const renderTitleDropdown = () => {
    titleDropdown.innerHTML = "";
    availableViewModes.forEach((mode) => {
      const itemBtn = document.createElement("button");
      itemBtn.type = "button";
      itemBtn.className = "doc-assistant-dynamic-outline__title-dropdown-item";
      if (mode === viewMode) {
        itemBtn.classList.add("is-active");
      }
      itemBtn.textContent = getModeDisplayLabel(mode);
      itemBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        switchToViewModeFn(mode);
      });
      titleDropdown.appendChild(itemBtn);
    });
  };

  const syncModeControls = () => {
    const isOpenDocs = viewMode === "open-docs";
    const isClipboard = viewMode === "clipboard";
    const hideDocControls = isOpenDocs || isClipboard;
    container.classList.toggle("is-open-docs-mode", isOpenDocs);
    container.classList.toggle("is-clipboard-mode", isClipboard);
    toTopBtn.style.display = hideDocControls ? "none" : "";
    toBottomBtn.style.display = hideDocControls ? "none" : "";
    floatSelectedBtn.style.display = hideDocControls ? "none" : "";
    treeToggleBtn.style.display = hideDocControls ? "none" : "";
    clipboardController.filterBarElement.style.display = isClipboard ? "flex" : "none";
    clipboardController.resetBatchStateIfNeeded();
    clipboardController.syncBatchBar();

    const canSwitch = availableViewModes.length > 1;
    titleSwitchIcon.style.display = canSwitch ? "inline-flex" : "none";
    titleBtn.style.cursor = canSwitch ? "pointer" : "default";
    titleBtn.removeAttribute("title");

    if (canSwitch) {
      titleBtn.classList.add("ariaLabel");
      titleBtn.setAttribute("data-position", "parent");
      if (availableViewModes.length === 2) {
        const otherMode = availableViewModes.find((m) => m !== viewMode) || availableViewModes[0];
        titleBtn.setAttribute(
          "aria-label",
          isZh ? `点击切换为${getModeDisplayLabel(otherMode)}` : `Switch to ${getModeDisplayLabel(otherMode)}`
        );
      } else {
        titleBtn.setAttribute(
          "aria-label",
          isZh ? "点击选择切换面板" : "Click to switch panel"
        );
      }
    } else {
      titleBtn.classList.remove("ariaLabel");
      titleBtn.removeAttribute("aria-label");
      titleBtn.removeAttribute("data-position");
    }

    if (isOpenDocs) {
      searchInput.placeholder = isZh ?
        "过滤文档 (拼音首字母/关键词)" :
        "Filter docs (pinyin/keyword)";
      titleText.textContent = getModeDisplayLabel("open-docs");
    } else if (isClipboard) {
      searchInput.placeholder = isZh ?
        "过滤剪贴板 (文本/文件名/拼音)" :
        "Filter clipboard (text/filename/pinyin)";
      titleText.textContent = getModeDisplayLabel("clipboard");
    } else {
      searchInput.placeholder = isZh ?
        "过滤章节 (拼音首字母/关键词)" :
        "Filter chapters (pinyin/keyword)";
      titleText.textContent = getModeDisplayLabel("outline");
    }
    if (isDropdownOpen) {
      renderTitleDropdown();
    }
    syncQuickBadges();
  };

  const switchToViewMode = (mode: DynamicOutlineViewMode) => {
    closeTitleDropdown();
    if (viewMode === mode) {
      return;
    }
    viewMode = mode;
    searchInput.value = "";
    searchQuery = "";
    selectedFilteredIndex = -1;
    syncModeControls();
    options.onViewModeChange?.(viewMode);
    updateFilteredViewFn();
  };
  switchToViewModeFn = switchToViewMode;
  syncModeControls();

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

  const isInputActive = () => isComposing || document.activeElement === searchInput;

  const openFlyout = () => {
    docPopover.clearMoveListener();
    if (blurTimer) {
      clearTimeout(blurTimer);
      blurTimer = null;
    }
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    flyout.classList.add("is-open");
    options.onFlyoutOpen?.();
  };

  const closeFlyoutLater = (relatedTarget?: EventTarget | null) => {
    if (isPinned || isInputActive()) {
      return;
    }
    if (docPopover.isPointerInPopover(relatedTarget)) {
      docPopover.scheduleLeaveWatch();
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
      if (docPopover.isPointerInPopover()) {
        closeTimer = null;
        docPopover.scheduleLeaveWatch();
        return;
      }
      flyout.classList.remove("is-open");
      closeTimer = null;
    }, 300);
  };
  closeFlyoutLaterFn = closeFlyoutLater;

  const switchViewModeOnHover = (targetMode: DynamicOutlineViewMode) => {
    if (!availableViewModes.includes(targetMode)) {
      openFlyout();
      return;
    }
    if (viewMode !== targetMode) {
      viewMode = targetMode;
      searchInput.value = "";
      searchQuery = "";
      selectedFilteredIndex = -1;
      closeTitleDropdown();
      syncModeControls();
      options.onViewModeChange?.(viewMode);
      updateFilteredViewFn();
    }
    openFlyout();
  };

  openDocsQuickBadge.addEventListener("mouseenter", () => {
    if (quickSwitchEnabled) {
      switchViewModeOnHover("open-docs");
    }
  });

  clipboardQuickBadge.addEventListener("mouseenter", () => {
    if (quickSwitchEnabled) {
      switchViewModeOnHover("clipboard");
    }
  });

  minimap.addEventListener("mouseenter", () => {
    if (quickSwitchEnabled && availableViewModes.includes("outline")) {
      switchViewModeOnHover("outline");
    } else {
      openFlyout();
    }
  });

  container.addEventListener("mouseenter", openFlyout);
  container.addEventListener("mouseleave", (e) => {
    closeFlyoutLater(e.relatedTarget);
  });

  const handleDocumentClick = (e: MouseEvent) => {
    if (isDropdownOpen && !titleWrap.contains(e.target as Node)) {
      closeTitleDropdown();
    }
  };
  document.addEventListener("click", handleDocumentClick);

  titleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (availableViewModes.length <= 1) {
      return;
    }
    if (availableViewModes.length === 2) {
      const nextMode = availableViewModes.find((m) => m !== viewMode) || availableViewModes[0];
      switchToViewMode(nextMode);
      return;
    }
    if (isDropdownOpen) {
      closeTitleDropdown();
    } else {
      renderTitleDropdown();
      isDropdownOpen = true;
      titleDropdown.style.display = "flex";
      titleBtn.classList.add("is-dropdown-open");
    }
  });

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

  const renderOutlineList = () => {
    if (filteredItems.length === 0) {
      const empty = document.createElement("div");
      empty.className = "doc-assistant-dynamic-outline__empty";
      empty.textContent = searchQuery.trim() ?
          (isZh ? "未匹配到相关章节" : "No matching chapters") :
          (isZh ? "暂无大纲内容" : "No outline items");
      list.appendChild(empty);
      return;
    }

    const isFiltering = searchQuery.trim().length > 0;
    const expandableIds = !isFiltering ? computeOutlineExpandableIds(currentItems) : new Set<string>();

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

      if (!isFiltering && item.level > 0) {
        if (expandableIds.has(item.id)) {
          const isCollapsed = collapsedHeadingIds.has(item.id);
          const toggleBtn = document.createElement("button");
          toggleBtn.type = "button";
          toggleBtn.className = "doc-assistant-dynamic-outline__item-toggle";
          if (isCollapsed) {
            toggleBtn.classList.add("is-collapsed");
          }
          toggleBtn.setAttribute("aria-expanded", String(!isCollapsed));
          toggleBtn.setAttribute(
            "title",
            isCollapsed ? (isZh ? "展开" : "Expand") : (isZh ? "折叠" : "Collapse")
          );
          toggleBtn.innerHTML = LUCIDE_CHEVRON_DOWN_SVG;
          toggleBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (collapsedHeadingIds.has(item.id)) {
              collapsedHeadingIds.delete(item.id);
            } else {
              collapsedHeadingIds.add(item.id);
            }
            selectedFilteredIndex = -1;
            updateFilteredViewFn();
          });
          row.appendChild(toggleBtn);
        } else if (expandableIds.size > 0) {
          const spacer = document.createElement("span");
          spacer.className = "doc-assistant-dynamic-outline__item-toggle-spacer";
          spacer.setAttribute("aria-hidden", "true");
          row.appendChild(spacer);
        }
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
      appendHighlightedText(textSpan, item.text, fItem.matchRange);
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

  const renderList = () => {
    docPopover.resetListState();
    list.innerHTML = "";
    itemElements.length = 0;

    syncModeControls();

    if (viewMode === "open-docs") {
      visibleDocEntries = renderOpenDocsPanel({
        list,
        itemElements,
        isZh,
        searchQuery,
        currentOpenDocsCount: currentOpenDocs.length,
        currentRecentDocsCount: currentRecentDocs.length,
        filteredOpenDocs,
        filteredRecentDocs,
        openDocsExpanded,
        recentDocsExpanded,
        selectedFilteredIndex,
        attachRowPopover: docPopover.attachRow,
        onToggleOpenSection: () => {
          openDocsExpanded = !openDocsExpanded;
          selectedFilteredIndex = -1;
          options.onDocSectionsChange?.({ openDocsExpanded, recentDocsExpanded });
          renderList();
        },
        onToggleRecentSection: () => {
          recentDocsExpanded = !recentDocsExpanded;
          selectedFilteredIndex = -1;
          options.onDocSectionsChange?.({ openDocsExpanded, recentDocsExpanded });
          renderList();
        },
        onOpenDocClick: (doc) => {
          options.onOpenDocClick?.(doc);
          if (!isPinned) {
            flyout.classList.remove("is-open");
          }
        },
        onRecentDocClick: (doc) => {
          options.onRecentDocClick?.(doc);
          if (!isPinned) {
            flyout.classList.remove("is-open");
          }
        }
      });
      return;
    }

    if (viewMode === "clipboard") {
      const renderedRows = clipboardController.renderList({
        list,
        selectedIndex: selectedFilteredIndex,
        searchQuery
      });
      itemElements.push(...renderedRows);
      return;
    }

    renderOutlineList();
  };
  renderListFn = renderList;

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

  const updateFilteredView = () => {
    const query = searchQuery.trim();
    clearBtn.style.display = query ? "inline-flex" : "none";

    if (viewMode === "open-docs") {
      const totalDocsCount = currentOpenDocs.length + currentRecentDocs.length;
      if (!query) {
        searchBar.classList.remove("is-filtering");
        countBadge.textContent = String(totalDocsCount);
        matchCountBadge.textContent = isZh ? `${totalDocsCount} 项` : `${totalDocsCount} items`;
        filteredOpenDocs = currentOpenDocs.map((item) => ({ item }));
        filteredRecentDocs = currentRecentDocs.map((item) => ({ item }));
      } else {
        searchBar.classList.add("is-filtering");
        filteredOpenDocs = filterOpenDocItems(currentOpenDocs, query);
        filteredRecentDocs = filterRecentDocItems(currentRecentDocs, query);
        const matchedTotal = filteredOpenDocs.length + filteredRecentDocs.length;
        countBadge.textContent = `${matchedTotal}/${totalDocsCount}`;
        matchCountBadge.textContent = isZh ?
          `${matchedTotal}/${totalDocsCount} 项` :
          `${matchedTotal}/${totalDocsCount}`;
      }
      updateMinimapFilterMarks(new Set());
      renderList();
      if (selectedFilteredIndex >= visibleDocEntries.length) {
        selectedFilteredIndex = -1;
        updateSelectionHighlight();
      }
      return;
    }

    if (viewMode === "clipboard") {
      const clipboardFilter = clipboardController.getFilter();
      filteredClipboardItems = filterClipboardItems(currentClipboardItems, clipboardFilter, query);
      const isFiltering = Boolean(query || clipboardFilter !== "all");
      searchBar.classList.toggle("is-filtering", Boolean(query));
      if (!isFiltering) {
        countBadge.textContent = String(currentClipboardItems.length);
        matchCountBadge.textContent = isZh ?
          `${currentClipboardItems.length} 项` :
          `${currentClipboardItems.length} items`;
      } else {
        countBadge.textContent = `${filteredClipboardItems.length}/${currentClipboardItems.length}`;
        matchCountBadge.textContent = isZh ?
          `${filteredClipboardItems.length}/${currentClipboardItems.length} 项` :
          `${filteredClipboardItems.length}/${currentClipboardItems.length}`;
      }
      updateMinimapFilterMarks(new Set());
      if (selectedFilteredIndex >= filteredClipboardItems.length) {
        selectedFilteredIndex = -1;
      }
      renderList();
      return;
    }

    if (!query) {
      searchBar.classList.remove("is-filtering");
      countBadge.textContent = String(currentItems.length);
      matchCountBadge.textContent = isZh ? `${currentItems.length} 项` : `${currentItems.length} items`;
      const visibleItems = filterCollapsedOutlineItems(currentItems, collapsedHeadingIds);
      filteredItems = visibleItems.map((item) => ({ item, isAncestor: false }));
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
  updateFilteredViewFn = updateFilteredView;

  searchInput.addEventListener("focus", () => {
    openFlyout();
  });

  searchInput.addEventListener("blur", () => {
    if (blurTimer) {
      clearTimeout(blurTimer);
    }
    blurTimer = setTimeout(() => {
      blurTimer = null;
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
    const activeListLength =
      viewMode === "open-docs" ?
        visibleDocEntries.length :
        viewMode === "clipboard" ?
          filteredClipboardItems.length :
          filteredItems.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (activeListLength > 0) {
        selectedFilteredIndex =
          selectedFilteredIndex < activeListLength - 1 ? selectedFilteredIndex + 1 : 0;
        updateSelectionHighlight();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (activeListLength > 0) {
        selectedFilteredIndex =
          selectedFilteredIndex > 0 ? selectedFilteredIndex - 1 : activeListLength - 1;
        updateSelectionHighlight();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (viewMode === "open-docs") {
        if (visibleDocEntries.length > 0) {
          const target =
            selectedFilteredIndex >= 0 && visibleDocEntries[selectedFilteredIndex] ?
              visibleDocEntries[selectedFilteredIndex] :
              visibleDocEntries[0];
          if (target) {
            if (target.kind === "open") {
              options.onOpenDocClick?.(target.item);
            } else {
              options.onRecentDocClick?.(target.item);
            }
            if (!isPinned) {
              flyout.classList.remove("is-open");
            }
          }
        }
      } else if (viewMode === "clipboard") {
        if (filteredClipboardItems.length > 0) {
          const target =
            selectedFilteredIndex >= 0 && filteredClipboardItems[selectedFilteredIndex] ?
              filteredClipboardItems[selectedFilteredIndex] :
              filteredClipboardItems[0];
          if (target) {
            void options.onClipboardCopy?.(target);
          }
        }
      } else if (filteredItems.length > 0) {
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
    const expandableIds = computeOutlineExpandableIds(items);
    for (const id of collapsedHeadingIds) {
      if (!expandableIds.has(id)) {
        collapsedHeadingIds.delete(id);
      }
    }
    if (modeLabel) {
      currentModeLabel = modeLabel;
    }
    renderMinimapTicks();
    updateFilteredView();
  };

  const setOpenDocs = (items: OpenDocTabItem[]) => {
    currentOpenDocs = items;
    currentRecentDocs = deduplicateRecentDocs(currentRecentDocsRaw, currentOpenDocs);
    syncQuickBadges();
    if (viewMode === "open-docs") {
      updateFilteredView();
    }
  };

  const setRecentDocs = (items: RecentDocItem[]) => {
    currentRecentDocsRaw = items;
    currentRecentDocs = deduplicateRecentDocs(currentRecentDocsRaw, currentOpenDocs);
    if (viewMode === "open-docs") {
      updateFilteredView();
    }
  };

  const setClipboardItems = (items: ClipboardHistoryItem[]) => {
    currentClipboardItems = items;
    clipboardController.pruneSelection(items);
    syncQuickBadges();
    if (viewMode === "clipboard") {
      updateFilteredView();
    }
  };

  const setAvailableViewModes = (modes: DynamicOutlineViewMode[]) => {
    availableViewModes = normalizeDynamicOutlineViewModes(modes);
    if (!availableViewModes.includes(viewMode)) {
      viewMode = availableViewModes[0];
    }
    syncModeControls();
    updateFilteredView();
  };

  const setQuickSwitchEnabled = (enabled: boolean) => {
    quickSwitchEnabled = Boolean(enabled);
    syncQuickBadges();
  };

  const setViewMode = (mode: DynamicOutlineViewMode) => {
    if (viewMode === mode || !availableViewModes.includes(mode)) {
      return;
    }
    viewMode = mode;
    selectedFilteredIndex = -1;
    syncModeControls();
    updateFilteredView();
  };

  const getViewMode = (): DynamicOutlineViewMode => viewMode;

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
    if (viewMode !== "outline") {
      return;
    }
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
    document.removeEventListener("click", handleDocumentClick);
    docPopover.destroy();
    if (blurTimer) {
      clearTimeout(blurTimer);
      blurTimer = null;
    }
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    container.remove();
  };

  return {
    setItems,
    setOpenDocs,
    setClipboardItems,
    setAvailableViewModes,
    setQuickSwitchEnabled,
    setRecentDocs,
    setViewMode,
    getViewMode,
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
