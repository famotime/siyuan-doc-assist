import { showMessage } from "siyuan";
import {
  ClipboardFilterKey,
  ClipboardHistoryItem,
  formatClipboardRelativeTime
} from "@/core/clipboard-core";

const LUCIDE_COPY_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>';

const LUCIDE_CHECK_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>';

const LUCIDE_STAR_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';

const LUCIDE_TRASH_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>';

const LUCIDE_ERASER_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"></path><path d="M22 21H7"></path><path d="m5 11 9 9"></path></svg>';

const LUCIDE_TEXT_SVG =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path></svg>';

const LUCIDE_IMAGE_SVG =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path></svg>';

const LUCIDE_FILE_SVG =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path></svg>';

const FILTER_OPTIONS: Array<{ key: ClipboardFilterKey; label: string }> = [
  { key: "all", label: "全部" },
  { key: "text", label: "文本" },
  { key: "image", label: "图像" },
  { key: "file", label: "文件" },
  { key: "favorite", label: "收藏" }
];

function applyNativeTooltip(el: HTMLElement, label: string) {
  el.classList.add("ariaLabel");
  el.setAttribute("aria-label", label);
  el.setAttribute("data-position", "parent");
  el.removeAttribute("title");
}

export type ClipboardFilterBarHandle = {
  element: HTMLElement;
  setActiveFilter: (filter: ClipboardFilterKey) => void;
};

export function createClipboardFilterBar(options: {
  initialFilter: ClipboardFilterKey;
  onFilterChange: (filter: ClipboardFilterKey) => void;
  onClearNonFavorites: () => void;
}): ClipboardFilterBarHandle {
  const bar = document.createElement("div");
  bar.className = "doc-assistant-dynamic-outline__clipboard-filters";

  const pillsWrap = document.createElement("div");
  pillsWrap.className = "doc-assistant-dynamic-outline__clipboard-filter-pills";
  bar.appendChild(pillsWrap);

  const buttons = new Map<ClipboardFilterKey, HTMLButtonElement>();
  FILTER_OPTIONS.forEach(({ key, label }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "doc-assistant-dynamic-outline__clipboard-filter-btn";
    btn.dataset.filter = key;
    btn.textContent = label;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      options.onFilterChange(key);
    });
    pillsWrap.appendChild(btn);
    buttons.set(key, btn);
  });

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className =
    "doc-assistant-dynamic-outline__btn doc-assistant-dynamic-outline__clipboard-clear-btn";
  clearBtn.innerHTML = LUCIDE_ERASER_SVG;
  applyNativeTooltip(clearBtn, "清空非收藏记录");
  clearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    options.onClearNonFavorites();
  });
  bar.appendChild(clearBtn);

  const setActiveFilter = (filter: ClipboardFilterKey) => {
    buttons.forEach((btn, key) => {
      btn.classList.toggle("is-active", key === filter);
    });
  };
  setActiveFilter(options.initialFilter);

  return {
    element: bar,
    setActiveFilter
  };
}

export function renderClipboardListItems(params: {
  list: HTMLElement;
  items: ClipboardHistoryItem[];
  expandedIds: Set<string>;
  selectedIndex: number;
  hasQueryOrFilter: boolean;
  resolveImageUrl?: (fileName?: string) => string | null;
  onToggleExpand: (id: string) => void;
  onCopy: (item: ClipboardHistoryItem) => Promise<{ ok: boolean; reason?: string }>;
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
}): HTMLElement[] {
  const { list, items, expandedIds, selectedIndex } = params;
  const rows: HTMLElement[] = [];

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "doc-assistant-dynamic-outline__empty";
    empty.textContent = params.hasQueryOrFilter ?
      "未匹配到剪贴板记录" :
      "暂无剪贴板记录（桌面端后台静默捕获中）";
    list.appendChild(empty);
    return rows;
  }

  const now = Date.now();
  items.forEach((item, index) => {
    const isExpanded = expandedIds.has(item.id);
    const card = document.createElement("div");
    card.className = "doc-assistant-dynamic-outline__clipboard-item";
    if (isExpanded) {
      card.classList.add("is-expanded");
    }
    if (index === selectedIndex) {
      card.classList.add("is-selected");
    }
    if (item.favorited) {
      card.classList.add("is-favorited");
    }
    card.dataset.clipboardId = item.id;

    const topRow = document.createElement("div");
    topRow.className = "doc-assistant-dynamic-outline__clipboard-top";

    const kindBadge = document.createElement("span");
    kindBadge.className = `doc-assistant-dynamic-outline__clipboard-kind is-${item.kind}`;
    kindBadge.innerHTML =
      item.kind === "image" ?
        LUCIDE_IMAGE_SVG :
        item.kind === "file" ?
          LUCIDE_FILE_SVG :
          LUCIDE_TEXT_SVG;
    applyNativeTooltip(
      kindBadge,
      item.kind === "image" ? "图像" : item.kind === "file" ? "文件" : "文本"
    );
    topRow.appendChild(kindBadge);

    const summary = document.createElement("span");
    summary.className = "doc-assistant-dynamic-outline__clipboard-summary";
    summary.textContent = item.previewText || "(空)";
    topRow.appendChild(summary);

    const actions = document.createElement("div");
    actions.className = "doc-assistant-dynamic-outline__clipboard-actions";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "doc-assistant-dynamic-outline__clipboard-action-btn";
    copyBtn.innerHTML = LUCIDE_COPY_SVG;
    applyNativeTooltip(copyBtn, "复制到系统剪贴板");
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void params.onCopy(item).then((res) => {
        if (res.ok) {
          copyBtn.innerHTML = LUCIDE_CHECK_SVG;
          copyBtn.classList.add("is-copied");
          setTimeout(() => {
            copyBtn.innerHTML = LUCIDE_COPY_SVG;
            copyBtn.classList.remove("is-copied");
          }, 1000);
        } else {
          showMessage(res.reason || "复制失败", 3000, "error");
        }
      });
    });

    const favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.className = "doc-assistant-dynamic-outline__clipboard-action-btn";
    if (item.favorited) {
      favBtn.classList.add("is-favorited");
    }
    favBtn.innerHTML = LUCIDE_STAR_SVG;
    applyNativeTooltip(favBtn, item.favorited ? "取消收藏" : "收藏");
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      params.onToggleFavorite(item.id);
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className =
      "doc-assistant-dynamic-outline__clipboard-action-btn is-danger";
    delBtn.innerHTML = LUCIDE_TRASH_SVG;
    applyNativeTooltip(delBtn, "删除");
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      params.onDelete(item.id);
    });

    actions.append(copyBtn, favBtn, delBtn);
    topRow.appendChild(actions);
    card.appendChild(topRow);

    const metaRow = document.createElement("div");
    metaRow.className = "doc-assistant-dynamic-outline__clipboard-meta";
    metaRow.textContent = formatClipboardRelativeTime(item.updatedAt, now);
    card.appendChild(metaRow);

    if (isExpanded) {
      const preview = document.createElement("div");
      preview.className = "doc-assistant-dynamic-outline__clipboard-preview";
      if (item.kind === "text") {
        const pre = document.createElement("pre");
        pre.className = "doc-assistant-dynamic-outline__clipboard-preview-text";
        pre.textContent = item.text || item.previewText || "";
        preview.appendChild(pre);
      } else if (item.kind === "image") {
        const src = params.resolveImageUrl?.(item.imageFileName);
        if (src) {
          const img = document.createElement("img");
          img.className = "doc-assistant-dynamic-outline__clipboard-preview-img";
          img.src = src;
          img.alt = item.previewText || "剪贴板图片";
          preview.appendChild(img);
        } else {
          const miss = document.createElement("div");
          miss.className = "doc-assistant-dynamic-outline__clipboard-preview-miss";
          miss.textContent = "图片文件不可用或已被删除";
          preview.appendChild(miss);
        }
      } else if (item.kind === "file") {
        const ul = document.createElement("ul");
        ul.className = "doc-assistant-dynamic-outline__clipboard-preview-files";
        (item.filePaths || []).forEach((fp) => {
          const li = document.createElement("li");
          li.textContent = fp;
          ul.appendChild(li);
        });
        preview.appendChild(ul);
      }
      card.appendChild(preview);
    }

    card.addEventListener("click", (e) => {
      e.stopPropagation();
      params.onToggleExpand(item.id);
    });

    list.appendChild(card);
    rows.push(card);
  });

  return rows;
}
