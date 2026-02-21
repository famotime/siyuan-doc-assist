import {
  KeyInfoFilter,
  KeyInfoItem,
  KeyInfoType,
  keyInfoTypeLabel,
} from "@/core/key-info-core";

export type KeyInfoDockState = {
  docTitle: string;
  items: KeyInfoItem[];
  filter: KeyInfoFilter;
  loading: boolean;
  emptyText: string;
};

export type KeyInfoDockHandle = {
  setState: (next: Partial<KeyInfoDockState>) => void;
  getState: () => KeyInfoDockState;
  getVisibleItems: () => KeyInfoItem[];
  destroy: () => void;
};

const FILTERS: Array<{ key: KeyInfoFilter; label: string; icon: string }> = [
  { key: "all", label: "全部", icon: "全" },
  { key: "title", label: "标题", icon: "题" },
  { key: "bold", label: "加粗", icon: "粗" },
  { key: "italic", label: "斜体", icon: "斜" },
  { key: "highlight", label: "高亮", icon: "亮" },
  { key: "remark", label: "备注", icon: "注" },
  { key: "tag", label: "标签", icon: "签" },
];

function filterItems(items: KeyInfoItem[], filter: KeyInfoFilter): KeyInfoItem[] {
  if (filter === "all") {
    return items;
  }
  return items.filter((item) => item.type === filter);
}

function buildTypeBadge(type: KeyInfoType): HTMLSpanElement {
  const badge = document.createElement("span");
  badge.className = `doc-assistant-keyinfo__badge doc-assistant-keyinfo__badge--${type}`;
  badge.textContent = keyInfoTypeLabel(type);
  return badge;
}

function buildRow(
  item: KeyInfoItem,
  onItemClick?: (item: KeyInfoItem) => void
): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "doc-assistant-keyinfo__row";
  row.dataset.keyinfoId = item.id;
  if (item.blockId) {
    row.dataset.blockId = item.blockId;
  }

  const badge = buildTypeBadge(item.type);
  const text = document.createElement("div");
  text.className = "doc-assistant-keyinfo__text";
  text.textContent = item.text;

  row.appendChild(badge);
  row.appendChild(text);

  if (item.blockId && onItemClick) {
    row.classList.add("is-clickable");
    row.setAttribute("role", "button");
    row.tabIndex = 0;
    row.addEventListener("click", () => {
      onItemClick(item);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onItemClick(item);
      }
    });
  } else if (!item.blockId) {
    row.classList.add("is-disabled");
  }
  return row;
}

export function createKeyInfoDock(
  element: HTMLElement,
  callbacks: {
    onExport: () => void;
    onRefresh?: () => void;
    onItemClick?: (item: KeyInfoItem) => void;
  }
): KeyInfoDockHandle {
  const state: KeyInfoDockState = {
    docTitle: "",
    items: [],
    filter: "all",
    loading: false,
    emptyText: "暂无关键内容",
  };

  const root = document.createElement("div");
  root.className = "doc-assistant-keyinfo";

  const header = document.createElement("div");
  header.className = "doc-assistant-keyinfo__header";
  const title = document.createElement("div");
  title.className = "doc-assistant-keyinfo__title";
  title.textContent = "关键内容";
  const docTitle = document.createElement("div");
  docTitle.className = "doc-assistant-keyinfo__doc-title ft__secondary";
  docTitle.textContent = "未选择文档";
  header.appendChild(title);
  header.appendChild(docTitle);

  const filters = document.createElement("div");
  filters.className = "doc-assistant-keyinfo__filters";
  const filterButtons = new Map<KeyInfoFilter, HTMLButtonElement>();

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
      setState({ filter: filter.key });
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

  root.appendChild(header);
  root.appendChild(filters);
  root.appendChild(list);
  root.appendChild(footer);

  element.replaceChildren(root);

  const updateFilterButtons = () => {
    filterButtons.forEach((button, key) => {
      if (state.filter === key) {
        button.classList.add("is-active");
      } else {
        button.classList.remove("is-active");
      }
    });
  };

  const renderList = () => {
    list.replaceChildren();
    if (state.loading) {
      const empty = document.createElement("div");
      empty.className = "doc-assistant-keyinfo__empty ft__secondary";
      empty.textContent = "加载中...";
      list.appendChild(empty);
      return;
    }

    const visible = filterItems(state.items, state.filter);
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "doc-assistant-keyinfo__empty ft__secondary";
      empty.textContent = state.emptyText || "暂无关键内容";
      list.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    visible.forEach((item) => {
      fragment.appendChild(buildRow(item, callbacks.onItemClick));
    });
    list.appendChild(fragment);
  };

  const renderHeader = () => {
    docTitle.textContent = state.docTitle || "未选择文档";
  };

  const setState = (next: Partial<KeyInfoDockState>) => {
    Object.assign(state, next);
    renderHeader();
    updateFilterButtons();
    renderList();
  };

  updateFilterButtons();
  renderList();

  return {
    setState,
    getState: () => ({ ...state }),
    getVisibleItems: () => filterItems(state.items, state.filter),
    destroy: () => {
      element.replaceChildren();
    },
  };
}
