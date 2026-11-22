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

const LUCIDE_CHECK_SQUARE_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="m9 12 2 2 4-4"></path></svg>';

const LUCIDE_MERGE_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 6 4-4 4 4"></path><path d="M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22"></path><path d="m20 22-5-5"></path></svg>';

const LUCIDE_FOLDER_OPEN_SVG =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"></path></svg>';

const LUCIDE_CHEVRON_DOWN_SVG =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>';

const LUCIDE_CHEVRON_RIGHT_SVG =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>';

const LUCIDE_CLOSE_SVG =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';

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
  setBatchMode: (active: boolean) => void;
};

export function createClipboardFilterBar(options: {
  initialFilter: ClipboardFilterKey;
  onFilterChange: (filter: ClipboardFilterKey) => void;
  onToggleBatchMode: () => void;
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

  const toolsWrap = document.createElement("div");
  toolsWrap.className = "doc-assistant-dynamic-outline__clipboard-filter-tools";

  const batchBtn = document.createElement("button");
  batchBtn.type = "button";
  batchBtn.className =
    "doc-assistant-dynamic-outline__btn doc-assistant-dynamic-outline__clipboard-clear-btn";
  batchBtn.innerHTML = LUCIDE_CHECK_SQUARE_SVG;
  applyNativeTooltip(batchBtn, "批量选择（支持 Ctrl / Shift 点击）");
  batchBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    options.onToggleBatchMode();
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

  toolsWrap.append(batchBtn, clearBtn);
  bar.appendChild(toolsWrap);

  const setActiveFilter = (filter: ClipboardFilterKey) => {
    buttons.forEach((btn, key) => {
      btn.classList.toggle("is-active", key === filter);
    });
  };
  const setBatchMode = (active: boolean) => {
    batchBtn.classList.toggle("is-active", active);
  };
  setActiveFilter(options.initialFilter);

  return {
    element: bar,
    setActiveFilter,
    setBatchMode
  };
}

export type ClipboardBatchBarHandle = {
  element: HTMLElement;
  updateState: (state: {
    visible: boolean;
    selectedCount: number;
    totalCount: number;
    allSelected: boolean;
  }) => void;
};

export function createClipboardBatchBar(options: {
  onToggleSelectAll: () => void;
  onMergeCopy: () => void;
  onAggregate: () => void;
  onDeleteSelected: () => void;
  onExitBatchMode: () => void;
}): ClipboardBatchBarHandle {
  const bar = document.createElement("div");
  bar.className = "doc-assistant-dynamic-outline__clipboard-batch-bar";
  bar.style.display = "none";

  const leftWrap = document.createElement("div");
  leftWrap.className = "doc-assistant-dynamic-outline__clipboard-batch-left";

  const countLabel = document.createElement("span");
  countLabel.className = "doc-assistant-dynamic-outline__clipboard-batch-count";
  countLabel.textContent = "已选 0 项";

  const selectAllBtn = document.createElement("button");
  selectAllBtn.type = "button";
  selectAllBtn.className = "doc-assistant-dynamic-outline__clipboard-batch-text-btn";
  selectAllBtn.textContent = "全选";
  selectAllBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    options.onToggleSelectAll();
  });

  leftWrap.append(countLabel, selectAllBtn);

  const actionsWrap = document.createElement("div");
  actionsWrap.className = "doc-assistant-dynamic-outline__clipboard-batch-actions";

  const mergeCopyBtn = document.createElement("button");
  mergeCopyBtn.type = "button";
  mergeCopyBtn.className = "doc-assistant-dynamic-outline__clipboard-batch-btn";
  mergeCopyBtn.innerHTML = `${LUCIDE_COPY_SVG}<span>复制</span>`;
  applyNativeTooltip(mergeCopyBtn, "合并复制到系统剪贴板");
  mergeCopyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    options.onMergeCopy();
  });

  const aggregateBtn = document.createElement("button");
  aggregateBtn.type = "button";
  aggregateBtn.className = "doc-assistant-dynamic-outline__clipboard-batch-btn";
  aggregateBtn.innerHTML = `${LUCIDE_MERGE_SVG}<span>聚合</span>`;
  applyNativeTooltip(aggregateBtn, "聚合为一条新记录并移除原条目");
  aggregateBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    options.onAggregate();
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "doc-assistant-dynamic-outline__clipboard-batch-btn is-danger";
  deleteBtn.innerHTML = `${LUCIDE_TRASH_SVG}<span>删除</span>`;
  applyNativeTooltip(deleteBtn, "批量删除选中记录");
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    options.onDeleteSelected();
  });

  const exitBtn = document.createElement("button");
  exitBtn.type = "button";
  exitBtn.className = "doc-assistant-dynamic-outline__clipboard-action-btn";
  exitBtn.innerHTML = LUCIDE_CLOSE_SVG;
  applyNativeTooltip(exitBtn, "退出批量模式");
  exitBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    options.onExitBatchMode();
  });

  actionsWrap.append(mergeCopyBtn, aggregateBtn, deleteBtn, exitBtn);
  bar.append(leftWrap, actionsWrap);

  const updateState = (state: {
    visible: boolean;
    selectedCount: number;
    totalCount: number;
    allSelected: boolean;
  }) => {
    bar.style.display = state.visible ? "flex" : "none";
    countLabel.textContent = `已选 ${state.selectedCount} 项`;
    selectAllBtn.textContent = state.allSelected && state.totalCount > 0 ? "取消全选" : "全选";
    selectAllBtn.disabled = state.totalCount === 0;
    const hasSelection = state.selectedCount > 0;
    mergeCopyBtn.disabled = !hasSelection;
    aggregateBtn.disabled = state.selectedCount < 2;
    deleteBtn.disabled = !hasSelection;
  };

  return {
    element: bar,
    updateState
  };
}

export function renderClipboardListItems(params: {
  list: HTMLElement;
  items: ClipboardHistoryItem[];
  expandedIds: Set<string>;
  selectedIndex: number;
  batchMode: boolean;
  selectedIds: string[];
  hasQueryOrFilter: boolean;
  resolveImageUrl?: (fileName?: string) => string | null;
  onToggleExpand: (id: string) => void;
  onToggleSelect: (
    id: string,
    modifiers: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }
  ) => void;
  onCopy: (item: ClipboardHistoryItem) => Promise<{ ok: boolean; reason?: string }>;
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenFileLocation: (filePath: string) => Promise<{ ok: boolean; reason?: string }>;
}): HTMLElement[] {
  const { list, items, expandedIds, selectedIndex, batchMode, selectedIds } = params;
  const rows: HTMLElement[] = [];
  const selectedIdSet = new Set(selectedIds);

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
    const isBatchSelected = selectedIdSet.has(item.id);
    const card = document.createElement("div");
    card.className = "doc-assistant-dynamic-outline__clipboard-item";
    if (isExpanded) {
      card.classList.add("is-expanded");
    }
    if (index === selectedIndex) {
      card.classList.add("is-selected");
    }
    if (isBatchSelected) {
      card.classList.add("is-batch-selected");
    }
    if (item.favorited) {
      card.classList.add("is-favorited");
    }
    card.dataset.clipboardId = item.id;

    const topRow = document.createElement("div");
    topRow.className = "doc-assistant-dynamic-outline__clipboard-top";

    if (batchMode) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "doc-assistant-dynamic-outline__clipboard-checkbox";
      checkbox.checked = isBatchSelected;
      checkbox.addEventListener("click", (e) => {
        e.stopPropagation();
        params.onToggleSelect(item.id, {
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          shiftKey: e.shiftKey
        });
      });
      topRow.appendChild(checkbox);
    }

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

    if (batchMode) {
      const expandBtn = document.createElement("button");
      expandBtn.type = "button";
      expandBtn.className = "doc-assistant-dynamic-outline__clipboard-action-btn";
      expandBtn.innerHTML = isExpanded ? LUCIDE_CHEVRON_DOWN_SVG : LUCIDE_CHEVRON_RIGHT_SVG;
      applyNativeTooltip(expandBtn, isExpanded ? "收起详情" : "展开详情");
      expandBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        params.onToggleExpand(item.id);
      });
      actions.append(expandBtn);
    }

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
          li.className = "doc-assistant-dynamic-outline__clipboard-preview-file-item";

          const pathText = document.createElement("span");
          pathText.className = "doc-assistant-dynamic-outline__clipboard-preview-file-path";
          pathText.textContent = fp;

          const openDirBtn = document.createElement("button");
          openDirBtn.type = "button";
          openDirBtn.className = "doc-assistant-dynamic-outline__clipboard-file-open-btn";
          openDirBtn.innerHTML = LUCIDE_FOLDER_OPEN_SVG;
          applyNativeTooltip(openDirBtn, "打开所在目录");
          openDirBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            void params.onOpenFileLocation(fp).then((res) => {
              if (!res.ok) {
                showMessage(res.reason || "打开所在目录失败", 3000, "error");
              }
            });
          });

          li.append(pathText, openDirBtn);
          ul.appendChild(li);
        });
        preview.appendChild(ul);
      }
      preview.addEventListener("click", (e) => {
        e.stopPropagation();
      });
      card.appendChild(preview);
    }

    card.addEventListener("click", (e) => {
      e.stopPropagation();
      if (batchMode || e.ctrlKey || e.metaKey || e.shiftKey) {
        params.onToggleSelect(item.id, {
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          shiftKey: e.shiftKey
        });
        return;
      }
      params.onToggleExpand(item.id);
    });

    list.appendChild(card);
    rows.push(card);
  });

  return rows;
}
