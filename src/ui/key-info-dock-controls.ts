import {
  filterKeyInfoItems,
  KEY_INFO_TYPES,
  KeyInfoFilter,
  KeyInfoItem,
  KeyInfoType,
  keyInfoItemBadgeText,
  keyInfoTypeLabel
} from "@/core/key-info-core";
import { DockTabKey, DOCK_TABS } from "@/core/dock-panel-core";

export type FilterKey = "all" | KeyInfoType;

export const FILTER_TYPES: KeyInfoType[] = [...KEY_INFO_TYPES];

export const COLLAPSIBLE_FILTER_TYPES: KeyInfoType[] = ["code", "link", "ref", "tag"];

const FILTERS: Array<{ key: FilterKey; label: string; icon: string }> = [
  { key: "all", label: "全部", icon: "全" },
  { key: "title", label: "标题", icon: "题" },
  { key: "bold", label: "加粗", icon: "粗" },
  { key: "highlight", label: "高亮", icon: "亮" },
  { key: "remark", label: "备注", icon: "注" },
  { key: "italic", label: "斜体", icon: "斜" },
  { key: "underline", label: "下划", icon: "下" },
  { key: "code", label: "代码", icon: "码" },
  { key: "tag", label: "标签", icon: "签" },
  { key: "link", label: "链接", icon: "链" },
  { key: "ref", label: "引用", icon: "引" }
];

const FOOTER_LUCIDE_ICONS = {
  refresh:
    '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />',
  export:
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M12 18v-6" /><path d="m9 15 3 3 3-3" />',
  canvas:
    '<rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" />'
};

function createFooterIconNode(innerSvg: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("doc-assistant-keyinfo__footer-icon-svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.innerHTML = innerSvg;
  return svg;
}

export type KeyInfoDockChrome = {
  root: HTMLDivElement;
  entryAnimationTimer: number;
  docTitle: HTMLDivElement;
  loadingTag: HTMLSpanElement;
  meta: HTMLDivElement;
  tabButtons: Map<DockTabKey, HTMLButtonElement>;
  filterButtons: Map<FilterKey, HTMLButtonElement>;
  filterToggleButton: HTMLButtonElement;
  refreshButton: HTMLButtonElement;
  exportButton: HTMLButtonElement;
  canvasButton: HTMLButtonElement;
  list: HTMLDivElement;
  keyInfoPanel: HTMLDivElement;
  keyInfoLoadingOverlay: HTMLDivElement;
  docProcessPanel: HTMLDivElement;
  docProcessList: HTMLDivElement;
};

type KeyInfoDockChromeCallbacks = {
  onTabSelect: (tab: DockTabKey) => void;
  onFilterSelect: (key: FilterKey) => void;
  onFilterToggleExpanded: () => void;
  onRefresh: () => void;
  onExport: () => void;
  onGenerateCanvas: () => void;
  onDocActionOrderReset: () => void;
};

export function filterKeyInfoDockItems(items: KeyInfoItem[], filter: KeyInfoFilter): KeyInfoItem[] {
  return filterKeyInfoItems(items, filter);
}

function buildTypeBadge(itemOrType: KeyInfoItem | KeyInfoType): HTMLSpanElement {
  const type = typeof itemOrType === "string" ? itemOrType : itemOrType.type;
  const badge = document.createElement("span");
  badge.className = `doc-assistant-keyinfo__badge doc-assistant-keyinfo__badge--${type}`;
  badge.textContent = typeof itemOrType === "string" ? keyInfoTypeLabel(itemOrType) : keyInfoItemBadgeText(itemOrType);
  return badge;
}

export function formatKeyInfoDockText(item: KeyInfoItem): string {
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

export function preserveVisibleSpaces(text: string): string {
  return (text || "").replace(/ {2,}/g, (spaces) => "\u00A0".repeat(spaces.length));
}

export function buildKeyInfoDockRow(item: KeyInfoItem): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "doc-assistant-keyinfo__row";
  row.dataset.keyinfoId = item.id;
  row.dataset.type = item.type;
  if (item.type === "title") {
    row.dataset.headingLevel = String(item.headingLevel || 1);
  }

  const badge = buildTypeBadge(item);
  const text = document.createElement("div");
  text.className = "doc-assistant-keyinfo__text";
  text.textContent = preserveVisibleSpaces(formatKeyInfoDockText(item));

  row.appendChild(badge);
  row.appendChild(text);
  return row;
}

export function createKeyInfoDockChrome(
  element: HTMLElement,
  callbacks: KeyInfoDockChromeCallbacks
): KeyInfoDockChrome {
  const root = document.createElement("div");
  root.className = "doc-assistant-keyinfo is-entering";
  const entryAnimationTimer = window.setTimeout(() => {
    root.classList.remove("is-entering");
    root.classList.add("is-entered");
  }, 180);

  const header = document.createElement("div");
  header.className = "doc-assistant-keyinfo__header";
  const titleRow = document.createElement("div");
  titleRow.className = "doc-assistant-keyinfo__title-row doc-assistant-keyinfo__title-row--centered";
  const title = document.createElement("div");
  title.className = "doc-assistant-keyinfo__title";
  title.textContent = "文档助手";
  const loadingTag = document.createElement("span");
  loadingTag.className = "doc-assistant-keyinfo__loading ft__secondary";
  loadingTag.textContent = "";
  const docTitle = document.createElement("div");
  docTitle.className = "doc-assistant-keyinfo__doc-title doc-assistant-keyinfo__doc-title--prominent";
  docTitle.textContent = "未选择文档";
  const meta = document.createElement("div");
  meta.className = "doc-assistant-keyinfo__meta ft__secondary";
  meta.textContent = "关键内容 0 · 当前筛选 0";
  titleRow.appendChild(title);
  titleRow.appendChild(loadingTag);
  header.appendChild(titleRow);
  header.appendChild(docTitle);
  header.appendChild(meta);

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
      callbacks.onTabSelect(tab.key);
    });
    tabs.appendChild(button);
    tabButtons.set(tab.key, button);
  });

  const filters = document.createElement("div");
  filters.className = "doc-assistant-keyinfo__filters";
  const filterButtons = new Map<FilterKey, HTMLButtonElement>();
  const appendFilterButton = (filter: { key: FilterKey; label: string; icon: string }) => {
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
      callbacks.onFilterSelect(filter.key);
    });
    filters.appendChild(button);
    filterButtons.set(filter.key, button);
  };
  FILTERS.filter((filter) => !COLLAPSIBLE_FILTER_TYPES.includes(filter.key as KeyInfoType)).forEach(
    appendFilterButton
  );
  const filterToggleButton = document.createElement("button");
  filterToggleButton.type = "button";
  filterToggleButton.className =
    "b3-button b3-button--small doc-assistant-keyinfo__filter doc-assistant-keyinfo__filter-toggle";
  filterToggleButton.dataset.role = "more";
  filterToggleButton.setAttribute("aria-expanded", "false");
  const filterToggleIcon = document.createElement("span");
  filterToggleIcon.className = "doc-assistant-keyinfo__filter-icon";
  filterToggleIcon.textContent = "多";
  const filterToggleLabel = document.createElement("span");
  filterToggleLabel.className = "doc-assistant-keyinfo__filter-label";
  filterToggleLabel.textContent = "更多";
  filterToggleButton.appendChild(filterToggleIcon);
  filterToggleButton.appendChild(filterToggleLabel);
  filterToggleButton.addEventListener("click", callbacks.onFilterToggleExpanded);
  filters.appendChild(filterToggleButton);
  COLLAPSIBLE_FILTER_TYPES.forEach((key) => {
    const filter = FILTERS.find((item) => item.key === key);
    if (filter) {
      appendFilterButton(filter);
    }
  });

  const list = document.createElement("div");
  list.className = "doc-assistant-keyinfo__list";

  const footer = document.createElement("div");
  footer.className = "doc-assistant-keyinfo__footer";
  const refreshBtn = document.createElement("button");
  refreshBtn.className =
    "b3-button b3-button--outline b3-button--small doc-assistant-keyinfo__footer-btn doc-assistant-keyinfo__footer-btn--refresh ariaLabel";
  refreshBtn.setAttribute("aria-label", "重新提取当前文档关键信息");
  refreshBtn.setAttribute("data-position", "parent");
  const refreshIcon = document.createElement("span");
  refreshIcon.className = "doc-assistant-keyinfo__footer-icon";
  refreshIcon.appendChild(createFooterIconNode(FOOTER_LUCIDE_ICONS.refresh));
  const refreshLabel = document.createElement("span");
  refreshLabel.textContent = "刷新";
  refreshBtn.appendChild(refreshIcon);
  refreshBtn.appendChild(refreshLabel);
  refreshBtn.addEventListener("click", callbacks.onRefresh);

  const exportBtn = document.createElement("button");
  exportBtn.className =
    "b3-button b3-button--outline b3-button--small doc-assistant-keyinfo__footer-btn doc-assistant-keyinfo__footer-btn--export ariaLabel";
  exportBtn.setAttribute("aria-label", "将关键信息导出为 Markdown 文档");
  exportBtn.setAttribute("data-position", "parent");
  const exportIcon = document.createElement("span");
  exportIcon.className = "doc-assistant-keyinfo__footer-icon";
  exportIcon.appendChild(createFooterIconNode(FOOTER_LUCIDE_ICONS.export));
  const exportLabel = document.createElement("span");
  exportLabel.textContent = "导出";
  exportBtn.appendChild(exportIcon);
  exportBtn.appendChild(exportLabel);
  exportBtn.addEventListener("click", callbacks.onExport);

  const canvasBtn = document.createElement("button");
  canvasBtn.className =
    "b3-button b3-button--outline b3-button--small doc-assistant-keyinfo__footer-btn doc-assistant-keyinfo__footer-btn--canvas ariaLabel";
  canvasBtn.setAttribute("aria-label", "将关键信息发送至「无界」插件生成画板");
  canvasBtn.setAttribute("data-position", "parent");
  const canvasIcon = document.createElement("span");
  canvasIcon.className = "doc-assistant-keyinfo__footer-icon";
  canvasIcon.appendChild(createFooterIconNode(FOOTER_LUCIDE_ICONS.canvas));
  const canvasLabel = document.createElement("span");
  canvasLabel.textContent = "无界";
  canvasBtn.appendChild(canvasIcon);
  canvasBtn.appendChild(canvasLabel);
  canvasBtn.addEventListener("click", callbacks.onGenerateCanvas);
  footer.appendChild(refreshBtn);
  footer.appendChild(exportBtn);
  footer.appendChild(canvasBtn);

  const keyInfoPanel = document.createElement("div");
  keyInfoPanel.className = "doc-assistant-keyinfo__panel doc-assistant-keyinfo__panel--key-info";
  keyInfoPanel.appendChild(filters);
  keyInfoPanel.appendChild(list);
  keyInfoPanel.appendChild(footer);

  const keyInfoLoadingOverlay = document.createElement("div");
  keyInfoLoadingOverlay.className = "doc-assistant-keyinfo__loading-overlay";
  keyInfoLoadingOverlay.setAttribute("aria-hidden", "true");
  const keyInfoLoadingCard = document.createElement("div");
  keyInfoLoadingCard.className = "doc-assistant-keyinfo__loading-card";
  const keyInfoLoadingSpinner = document.createElement("span");
  keyInfoLoadingSpinner.className = "doc-assistant-keyinfo__loading-spinner";
  keyInfoLoadingSpinner.setAttribute("aria-hidden", "true");
  const keyInfoLoadingText = document.createElement("span");
  keyInfoLoadingText.className = "doc-assistant-keyinfo__loading-text";
  keyInfoLoadingText.textContent = "加载中...";
  keyInfoLoadingCard.appendChild(keyInfoLoadingSpinner);
  keyInfoLoadingCard.appendChild(keyInfoLoadingText);
  keyInfoLoadingOverlay.appendChild(keyInfoLoadingCard);
  keyInfoPanel.appendChild(keyInfoLoadingOverlay);

  const docProcessPanel = document.createElement("div");
  docProcessPanel.className = "doc-assistant-keyinfo__panel doc-assistant-keyinfo__panel--doc-process";
  const docProcessFooter = document.createElement("div");
  docProcessFooter.className = "doc-assistant-keyinfo__doc-process-footer";
  const docActionResetBtn = document.createElement("button");
  docActionResetBtn.type = "button";
  docActionResetBtn.className =
    "b3-button b3-button--outline b3-button--small doc-assistant-keyinfo__action-reset-btn";
  docActionResetBtn.textContent = "重置排序";
  docActionResetBtn.addEventListener("click", callbacks.onDocActionOrderReset);
  docProcessFooter.appendChild(docActionResetBtn);
  const docProcessList = document.createElement("div");
  docProcessList.className = "doc-assistant-keyinfo__actions";
  docProcessPanel.appendChild(docProcessList);
  docProcessPanel.appendChild(docProcessFooter);

  root.appendChild(header);
  root.appendChild(tabs);
  root.appendChild(keyInfoPanel);
  root.appendChild(docProcessPanel);

  element.replaceChildren(root);

  return {
    root,
    entryAnimationTimer,
    docTitle,
    loadingTag,
    meta,
    tabButtons,
    filterButtons,
    filterToggleButton,
    refreshButton: refreshBtn,
    exportButton: exportBtn,
    canvasButton: canvasBtn,
    list,
    keyInfoPanel,
    keyInfoLoadingOverlay,
    docProcessPanel,
    docProcessList
  };
}
