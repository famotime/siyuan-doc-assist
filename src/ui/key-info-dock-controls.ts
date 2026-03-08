import { KeyInfoFilter, KeyInfoItem, KeyInfoType, keyInfoTypeLabel } from "@/core/key-info-core";
import { DockTabKey, DOCK_TABS } from "@/core/dock-panel-core";

export type FilterKey = "all" | KeyInfoType;

export const FILTER_TYPES: KeyInfoType[] = [
  "title",
  "bold",
  "italic",
  "highlight",
  "code",
  "remark",
  "tag",
];

const FILTERS: Array<{ key: FilterKey; label: string; icon: string }> = [
  { key: "all", label: "全部", icon: "全" },
  { key: "title", label: "标题", icon: "题" },
  { key: "bold", label: "加粗", icon: "粗" },
  { key: "highlight", label: "高亮", icon: "亮" },
  { key: "remark", label: "备注", icon: "注" },
  { key: "italic", label: "斜体", icon: "斜" },
  { key: "code", label: "代码", icon: "码" },
  { key: "tag", label: "标签", icon: "签" },
];

export type KeyInfoDockChrome = {
  entryAnimationTimer: number;
  docTitle: HTMLDivElement;
  loadingTag: HTMLSpanElement;
  meta: HTMLDivElement;
  tabButtons: Map<DockTabKey, HTMLButtonElement>;
  filterButtons: Map<FilterKey, HTMLButtonElement>;
  refreshButton: HTMLButtonElement;
  exportButton: HTMLButtonElement;
  list: HTMLDivElement;
  keyInfoPanel: HTMLDivElement;
  keyInfoLoadingOverlay: HTMLDivElement;
  docProcessPanel: HTMLDivElement;
  docMenuToggleInput: HTMLInputElement;
  docProcessList: HTMLDivElement;
};

type KeyInfoDockChromeCallbacks = {
  onTabSelect: (tab: DockTabKey) => void;
  onFilterSelect: (key: FilterKey) => void;
  onRefresh: () => void;
  onExport: () => void;
  onDocMenuToggleAll: (enabled: boolean) => void;
  onDocActionOrderReset: () => void;
};

export function filterKeyInfoDockItems(items: KeyInfoItem[], filter: KeyInfoFilter): KeyInfoItem[] {
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

export function buildKeyInfoDockRow(item: KeyInfoItem): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "doc-assistant-keyinfo__row";

  const badge = buildTypeBadge(item.type);
  const text = document.createElement("div");
  text.className = "doc-assistant-keyinfo__text";
  text.textContent = formatKeyInfoDockText(item);

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
      callbacks.onFilterSelect(filter.key);
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
  refreshBtn.addEventListener("click", callbacks.onRefresh);
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
  exportBtn.addEventListener("click", callbacks.onExport);
  footer.appendChild(refreshBtn);
  footer.appendChild(exportBtn);

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
  const docMenuToggleRow = document.createElement("div");
  docMenuToggleRow.className = "doc-assistant-keyinfo__menu-toggle-row";
  const docMenuToggle = document.createElement("label");
  docMenuToggle.className = "doc-assistant-keyinfo__menu-toggle";
  const docMenuToggleLabel = document.createElement("span");
  docMenuToggleLabel.className = "doc-assistant-keyinfo__menu-toggle-label";
  docMenuToggleLabel.textContent = "全部注册到文档菜单";
  const docMenuToggleInput = document.createElement("input");
  docMenuToggleInput.type = "checkbox";
  docMenuToggleInput.className = "doc-assistant-keyinfo__menu-toggle-input";
  docMenuToggleInput.addEventListener("change", () => {
    callbacks.onDocMenuToggleAll(docMenuToggleInput.checked);
  });
  docMenuToggle.appendChild(docMenuToggleLabel);
  docMenuToggle.appendChild(docMenuToggleInput);
  const docActionResetBtn = document.createElement("button");
  docActionResetBtn.type = "button";
  docActionResetBtn.className =
    "b3-button b3-button--outline b3-button--small doc-assistant-keyinfo__action-reset-btn";
  docActionResetBtn.textContent = "重置排序";
  docActionResetBtn.addEventListener("click", callbacks.onDocActionOrderReset);
  docMenuToggleRow.appendChild(docActionResetBtn);
  docMenuToggleRow.appendChild(docMenuToggle);
  const docProcessList = document.createElement("div");
  docProcessList.className = "doc-assistant-keyinfo__actions";
  docProcessPanel.appendChild(docProcessList);
  docProcessPanel.appendChild(docMenuToggleRow);

  root.appendChild(header);
  root.appendChild(tabs);
  root.appendChild(keyInfoPanel);
  root.appendChild(docProcessPanel);

  element.replaceChildren(root);

  return {
    entryAnimationTimer,
    docTitle,
    loadingTag,
    meta,
    tabButtons,
    filterButtons,
    refreshButton: refreshBtn,
    exportButton: exportBtn,
    list,
    keyInfoPanel,
    keyInfoLoadingOverlay,
    docProcessPanel,
    docMenuToggleInput,
    docProcessList,
  };
}
