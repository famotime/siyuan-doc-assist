import {
  FilteredOpenDocItem,
  FilteredRecentDocItem,
  highlightMatchRanges,
  OpenDocTabItem,
  RecentDocItem
} from "@/core/dynamic-outline-core";

const LUCIDE_DOC_PIN_SVG =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" fill="none"></path></svg>';

const LUCIDE_CHEVRON_DOWN_SVG =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" fill="none"></path></svg>';

export type VisibleDocEntry =
  | { kind: "open"; item: OpenDocTabItem } |
  { kind: "recent"; item: RecentDocItem };

export function appendHighlightedText(
  target: HTMLElement,
  text: string,
  matchRange?: [number, number]
): void {
  if (matchRange) {
    const segments = highlightMatchRanges(text, matchRange);
    segments.forEach((seg) => {
      if (seg.highlight) {
        const mark = document.createElement("mark");
        mark.className = "doc-assistant-dynamic-outline__highlight";
        mark.textContent = seg.text;
        target.appendChild(mark);
      } else {
        target.appendChild(document.createTextNode(seg.text));
      }
    });
  } else {
    target.textContent = text || "(空)";
  }
}

type DocRowRenderParams = {
  list: HTMLElement;
  itemElements: HTMLElement[];
  isZh: boolean;
  docId: string;
  title: string;
  iconHtml?: string;
  matchRange?: [number, number];
  tabId?: string;
  isPinned?: boolean;
  isActive?: boolean;
  isSelected: boolean;
  attachRowPopover: (row: HTMLElement) => void;
  onClick: () => void;
};

function renderDocRow(params: DocRowRenderParams): void {
  const row = document.createElement("div");
  row.className =
    "doc-assistant-dynamic-outline__item doc-assistant-dynamic-outline__doc-item popover__block";
  row.setAttribute("data-level", "0");
  row.setAttribute("data-id", params.docId);
  row.setAttribute("data-doc-id", params.docId);
  if (params.tabId) {
    row.setAttribute("data-tab-id", params.tabId);
  }
  row.setAttribute("prevent-popover", "true");

  if (params.isPinned) {
    row.classList.add("is-doc-pinned");
  }
  if (params.isActive) {
    row.classList.add("is-active");
  }
  if (params.isSelected) {
    row.classList.add("is-selected");
  }

  if (params.isPinned) {
    const pinBadge = document.createElement("span");
    pinBadge.className = "doc-assistant-dynamic-outline__doc-pin";
    pinBadge.setAttribute("title", params.isZh ? "常驻钉住" : "Pinned");
    pinBadge.innerHTML = LUCIDE_DOC_PIN_SVG;
    row.appendChild(pinBadge);
  }

  if (params.iconHtml) {
    const iconSpan = document.createElement("span");
    iconSpan.className = "doc-assistant-dynamic-outline__doc-icon";
    iconSpan.innerHTML = params.iconHtml;
    row.appendChild(iconSpan);
  }

  const textSpan = document.createElement("span");
  textSpan.className = "doc-assistant-dynamic-outline__item-text";
  textSpan.setAttribute("data-level", "0");
  textSpan.setAttribute("title", params.title);
  appendHighlightedText(textSpan, params.title, params.matchRange);
  row.appendChild(textSpan);

  row.addEventListener("click", params.onClick);
  params.attachRowPopover(row);

  params.list.appendChild(row);
  params.itemElements.push(row);
}

function renderDocSectionHeader(
  list: HTMLElement,
  params: {
    sectionKey: "open" | "recent";
    title: string;
    countText: string;
    expanded: boolean;
    onToggle: () => void;
  }
): void {
  const headerBtn = document.createElement("button");
  headerBtn.type = "button";
  headerBtn.className = "doc-assistant-dynamic-outline__doc-section-header";
  headerBtn.setAttribute("data-section", params.sectionKey);
  headerBtn.setAttribute("aria-expanded", String(params.expanded));
  if (!params.expanded) {
    headerBtn.classList.add("is-collapsed");
  }

  const arrow = document.createElement("span");
  arrow.className = "doc-assistant-dynamic-outline__doc-section-arrow";
  arrow.innerHTML = LUCIDE_CHEVRON_DOWN_SVG;
  headerBtn.appendChild(arrow);

  const titleEl = document.createElement("span");
  titleEl.className = "doc-assistant-dynamic-outline__doc-section-title";
  titleEl.textContent = params.title;
  headerBtn.appendChild(titleEl);

  const countEl = document.createElement("span");
  countEl.className = "doc-assistant-dynamic-outline__doc-section-count";
  countEl.textContent = params.countText;
  headerBtn.appendChild(countEl);

  headerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    params.onToggle();
  });

  list.appendChild(headerBtn);
}

function renderDocSectionEmpty(list: HTMLElement, message: string): void {
  const empty = document.createElement("div");
  empty.className = "doc-assistant-dynamic-outline__doc-section-empty";
  empty.textContent = message;
  list.appendChild(empty);
}

export function renderOpenDocsPanel(params: {
  list: HTMLElement;
  itemElements: HTMLElement[];
  isZh: boolean;
  searchQuery: string;
  currentOpenDocsCount: number;
  currentRecentDocsCount: number;
  filteredOpenDocs: FilteredOpenDocItem[];
  filteredRecentDocs: FilteredRecentDocItem[];
  openDocsExpanded: boolean;
  recentDocsExpanded: boolean;
  selectedFilteredIndex: number;
  attachRowPopover: (row: HTMLElement) => void;
  onToggleOpenSection: () => void;
  onToggleRecentSection: () => void;
  onOpenDocClick: (doc: OpenDocTabItem) => void;
  onRecentDocClick: (doc: RecentDocItem) => void;
}): VisibleDocEntry[] {
  const { list, itemElements, isZh } = params;
  const visibleDocEntries: VisibleDocEntry[] = [];
  const hasQuery = params.searchQuery.trim().length > 0;

  if (
    hasQuery &&
    params.filteredOpenDocs.length === 0 &&
    params.filteredRecentDocs.length === 0
  ) {
    const empty = document.createElement("div");
    empty.className = "doc-assistant-dynamic-outline__empty";
    empty.textContent = isZh ? "未匹配到相关文档" : "No matching documents";
    list.appendChild(empty);
    return visibleDocEntries;
  }

  const showOpenSection = !hasQuery || params.filteredOpenDocs.length > 0;
  const showRecentSection = !hasQuery || params.filteredRecentDocs.length > 0;

  if (showOpenSection) {
    const isSectionExpanded = hasQuery ? true : params.openDocsExpanded;
    const openCountText = hasQuery ?
      `${params.filteredOpenDocs.length}/${params.currentOpenDocsCount}` :
        String(params.currentOpenDocsCount);
    renderDocSectionHeader(list, {
      sectionKey: "open",
      title: isZh ? "已打开文档" : "Open Docs",
      countText: openCountText,
      expanded: isSectionExpanded,
      onToggle: params.onToggleOpenSection
    });

    if (isSectionExpanded) {
      if (params.filteredOpenDocs.length === 0) {
        renderDocSectionEmpty(list, isZh ? "当前编辑区暂无已打开文档" : "No open documents");
      } else {
        params.filteredOpenDocs.forEach((fDoc) => {
          const doc = fDoc.item;
          const entryIndex = visibleDocEntries.length;
          visibleDocEntries.push({ kind: "open", item: doc });
          renderDocRow({
            list,
            itemElements,
            isZh,
            docId: doc.docId,
            title: doc.title,
            iconHtml: doc.iconHtml,
            matchRange: fDoc.matchRange,
            tabId: doc.tabId,
            isPinned: doc.isPinned,
            isActive: doc.isActive,
            isSelected: entryIndex === params.selectedFilteredIndex,
            attachRowPopover: params.attachRowPopover,
            onClick: () => params.onOpenDocClick(doc)
          });
        });
      }
    }
  }

  if (showRecentSection) {
    const isSectionExpanded = hasQuery ? true : params.recentDocsExpanded;
    const recentCountText = hasQuery ?
      `${params.filteredRecentDocs.length}/${params.currentRecentDocsCount}` :
        String(params.currentRecentDocsCount);
    renderDocSectionHeader(list, {
      sectionKey: "recent",
      title: isZh ? "最近的文档" : "Recent Docs",
      countText: recentCountText,
      expanded: isSectionExpanded,
      onToggle: params.onToggleRecentSection
    });

    if (isSectionExpanded) {
      if (params.filteredRecentDocs.length === 0) {
        renderDocSectionEmpty(list, isZh ? "暂无更多最近文档" : "No more recent documents");
      } else {
        params.filteredRecentDocs.forEach((fDoc) => {
          const doc = fDoc.item;
          const entryIndex = visibleDocEntries.length;
          visibleDocEntries.push({ kind: "recent", item: doc });
          renderDocRow({
            list,
            itemElements,
            isZh,
            docId: doc.docId,
            title: doc.title,
            iconHtml: doc.iconHtml,
            matchRange: fDoc.matchRange,
            isSelected: entryIndex === params.selectedFilteredIndex,
            attachRowPopover: params.attachRowPopover,
            onClick: () => params.onRecentDocClick(doc)
          });
        });
      }
    }
  }

  return visibleDocEntries;
}
