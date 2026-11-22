import { confirm, showMessage } from "siyuan";
import { ClipboardFilterKey, ClipboardHistoryItem } from "@/core/clipboard-core";
import { DynamicOutlineViewMode } from "@/core/dynamic-outline-core";
import {
  createClipboardBatchBar,
  createClipboardFilterBar,
  renderClipboardListItems
} from "@/ui/dynamic-outline/dynamic-outline-clipboard-panel";

export type DynamicOutlineClipboardControllerOptions = {
  getViewMode: () => DynamicOutlineViewMode;
  getAllItems: () => readonly ClipboardHistoryItem[];
  getFilteredItems: () => readonly ClipboardHistoryItem[];
  onFilterChanged: () => void;
  onRequestRenderList: () => void;
  onClipboardCopy?: (item: ClipboardHistoryItem) => Promise<{ ok: boolean; reason?: string }>;
  onClipboardCopyMerged?: (
    ids: string[]
  ) => Promise<{ ok: boolean; reason?: string; skippedImageCount?: number }>;
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
  onClipboardOpenFileLocation?: (
    filePath: string
  ) => Promise<{ ok: boolean; reason?: string }>;
  resolveClipboardImageUrl?: (imageFileName?: string) => string | null;
};

export type DynamicOutlineClipboardController = {
  filterBarElement: HTMLElement;
  batchBarElement: HTMLElement;
  getFilter: () => ClipboardFilterKey;
  syncBatchBar: () => void;
  resetBatchStateIfNeeded: () => void;
  pruneSelection: (items: readonly ClipboardHistoryItem[]) => void;
  renderList: (params: {
    list: HTMLElement;
    selectedIndex: number;
    searchQuery: string;
  }) => HTMLElement[];
};

export function createDynamicOutlineClipboardController(
  options: DynamicOutlineClipboardControllerOptions
): DynamicOutlineClipboardController {
  let clipboardFilter: ClipboardFilterKey = "all";
  const expandedClipboardIds = new Set<string>();
  let isClipboardBatchMode = false;
  let selectedClipboardIds: string[] = [];
  let lastBatchAnchorId: string | null = null;

  let clipboardFilterBar: ReturnType<typeof createClipboardFilterBar>;
  let clipboardBatchBar: ReturnType<typeof createClipboardBatchBar>;

  const syncBatchBar = () => {
    const isClipboard = options.getViewMode() === "clipboard";
    const filteredItems = options.getFilteredItems();
    const visibleIds = new Set(filteredItems.map((item) => item.id));
    const selectedVisibleCount = selectedClipboardIds.filter((id) => visibleIds.has(id)).length;
    clipboardFilterBar.setBatchMode(isClipboardBatchMode);
    clipboardBatchBar.updateState({
      visible: isClipboard && (isClipboardBatchMode || selectedClipboardIds.length > 0),
      selectedCount: selectedClipboardIds.length,
      totalCount: filteredItems.length,
      allSelected: filteredItems.length > 0 && selectedVisibleCount === filteredItems.length
    });
  };

  const exitBatchMode = () => {
    isClipboardBatchMode = false;
    selectedClipboardIds = [];
    lastBatchAnchorId = null;
    syncBatchBar();
    if (options.getViewMode() === "clipboard") {
      options.onRequestRenderList();
    }
  };

  const resetBatchStateIfNeeded = () => {
    if (options.getViewMode() !== "clipboard" && (isClipboardBatchMode || selectedClipboardIds.length > 0)) {
      isClipboardBatchMode = false;
      selectedClipboardIds = [];
      lastBatchAnchorId = null;
    }
  };

  const toggleClipboardSelect = (
    id: string,
    modifiers: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }
  ) => {
    const filteredItems = options.getFilteredItems();
    const enteringBatchFromSingle = !isClipboardBatchMode;
    if (enteringBatchFromSingle) {
      isClipboardBatchMode = true;
    }

    if (modifiers.shiftKey && lastBatchAnchorId) {
      const anchorIdx = filteredItems.findIndex((item) => item.id === lastBatchAnchorId);
      const targetIdx = filteredItems.findIndex((item) => item.id === id);
      if (anchorIdx >= 0 && targetIdx >= 0) {
        const step = anchorIdx <= targetIdx ? 1 : -1;
        const nextSet = new Set(selectedClipboardIds);
        const nextOrdered = [...selectedClipboardIds];
        for (let i = anchorIdx; ; i += step) {
          const rangeId = filteredItems[i].id;
          if (!nextSet.has(rangeId)) {
            nextSet.add(rangeId);
            nextOrdered.push(rangeId);
          }
          if (i === targetIdx) {
            break;
          }
        }
        selectedClipboardIds = nextOrdered;
        lastBatchAnchorId = id;
        syncBatchBar();
        options.onRequestRenderList();
        return;
      }
    }

    if (
      enteringBatchFromSingle &&
      (modifiers.ctrlKey || modifiers.metaKey) &&
      lastBatchAnchorId &&
      lastBatchAnchorId !== id &&
      filteredItems.some((item) => item.id === lastBatchAnchorId) &&
      !selectedClipboardIds.includes(lastBatchAnchorId)
    ) {
      selectedClipboardIds = [...selectedClipboardIds, lastBatchAnchorId];
    }

    if (selectedClipboardIds.includes(id)) {
      selectedClipboardIds = selectedClipboardIds.filter((itemId) => itemId !== id);
    } else {
      selectedClipboardIds = [...selectedClipboardIds, id];
    }
    lastBatchAnchorId = id;
    syncBatchBar();
    options.onRequestRenderList();
  };

  clipboardFilterBar = createClipboardFilterBar({
    initialFilter: clipboardFilter,
    onFilterChange: (nextFilter) => {
      clipboardFilter = nextFilter;
      clipboardFilterBar.setActiveFilter(nextFilter);
      options.onFilterChanged();
    },
    onToggleBatchMode: () => {
      if (isClipboardBatchMode) {
        exitBatchMode();
      } else {
        isClipboardBatchMode = true;
        syncBatchBar();
        options.onRequestRenderList();
      }
    },
    onClearNonFavorites: () => {
      void options.onClipboardClearNonFavorites?.();
    }
  });

  clipboardBatchBar = createClipboardBatchBar({
    onToggleSelectAll: () => {
      const filteredItems = options.getFilteredItems();
      if (filteredItems.length === 0) {
        return;
      }
      const visibleIds = filteredItems.map((item) => item.id);
      const selectedSet = new Set(selectedClipboardIds);
      const allSelected = visibleIds.every((id) => selectedSet.has(id));
      if (allSelected) {
        const visibleSet = new Set(visibleIds);
        selectedClipboardIds = selectedClipboardIds.filter((id) => !visibleSet.has(id));
      } else {
        const nextOrdered = [...selectedClipboardIds];
        for (const id of visibleIds) {
          if (!selectedSet.has(id)) {
            selectedSet.add(id);
            nextOrdered.push(id);
          }
        }
        selectedClipboardIds = nextOrdered;
      }
      syncBatchBar();
      options.onRequestRenderList();
    },
    onMergeCopy: () => {
      if (selectedClipboardIds.length === 0) {
        return;
      }
      void options.onClipboardCopyMerged?.([...selectedClipboardIds]).then((res) => {
        if (!res || !res.ok) {
          showMessage(res?.reason || "合并复制失败", 3000, "error");
          return;
        }
        const msg =
          res.skippedImageCount && res.skippedImageCount > 0 ?
            `已合并复制到系统剪贴板（已跳过 ${res.skippedImageCount} 张图像）` :
            "已合并复制到系统剪贴板";
        showMessage(msg, 2500, "info");
      });
    },
    onAggregate: () => {
      if (selectedClipboardIds.length < 2) {
        return;
      }
      void options.onClipboardAggregate?.([...selectedClipboardIds]).then((res) => {
        if (!res || !res.ok) {
          showMessage(res?.reason || "聚合失败", 3000, "error");
          return;
        }
        const msg =
          res.skippedImageCount && res.skippedImageCount > 0 ?
            `已聚合为新记录（已跳过 ${res.skippedImageCount} 张图像）` :
            "已聚合为新记录";
        showMessage(msg, 2500, "info");
        exitBatchMode();
      });
    },
    onDeleteSelected: () => {
      if (selectedClipboardIds.length === 0) {
        return;
      }
      const idsToDelete = [...selectedClipboardIds];
      const selectedSet = new Set(idsToDelete);
      const favCount = options
        .getAllItems()
        .filter((item) => selectedSet.has(item.id) && item.favorited)
        .length;
      const confirmDesc =
        favCount > 0 ?
          `确定要删除选中的 ${idsToDelete.length} 条剪贴板记录吗？（其中包含 ${favCount} 条已收藏记录）` :
          `确定要删除选中的 ${idsToDelete.length} 条剪贴板记录吗？`;
      confirm("批量删除剪贴板记录", confirmDesc, () => {
        void (async () => {
          for (const id of idsToDelete) {
            expandedClipboardIds.delete(id);
          }
          try {
            await options.onClipboardDeleteBatch?.(idsToDelete);
            exitBatchMode();
          } catch {
            showMessage("批量删除剪贴板记录失败", 3000, "error");
          }
        })();
      });
    },
    onExitBatchMode: () => {
      exitBatchMode();
    }
  });

  const pruneSelection = (items: readonly ClipboardHistoryItem[]) => {
    if (selectedClipboardIds.length > 0) {
      const validIds = new Set(items.map((item) => item.id));
      selectedClipboardIds = selectedClipboardIds.filter((id) => validIds.has(id));
    }
  };

  const renderList = (params: {
    list: HTMLElement;
    selectedIndex: number;
    searchQuery: string;
  }): HTMLElement[] => {
    syncBatchBar();
    return renderClipboardListItems({
      list: params.list,
      items: [...options.getFilteredItems()],
      expandedIds: expandedClipboardIds,
      selectedIndex: params.selectedIndex,
      batchMode: isClipboardBatchMode,
      selectedIds: selectedClipboardIds,
      hasQueryOrFilter: Boolean(params.searchQuery.trim() || clipboardFilter !== "all"),
      resolveImageUrl: options.resolveClipboardImageUrl,
      onToggleExpand: (id) => {
        lastBatchAnchorId = id;
        const wasExpanded = expandedClipboardIds.has(id);
        expandedClipboardIds.clear();
        if (!wasExpanded) {
          expandedClipboardIds.add(id);
        }
        options.onRequestRenderList();
      },
      onToggleSelect: (id, modifiers) => {
        toggleClipboardSelect(id, modifiers);
      },
      onCopy: async (item) => {
        return (await options.onClipboardCopy?.(item)) || { ok: false, reason: "复制不可用" };
      },
      onToggleFavorite: (id) => {
        void options.onClipboardToggleFavorite?.(id);
      },
      onDelete: (id) => {
        expandedClipboardIds.delete(id);
        selectedClipboardIds = selectedClipboardIds.filter((itemId) => itemId !== id);
        void options.onClipboardDelete?.(id);
      },
      onOpenFileLocation: async (filePath) => {
        return (
          (await options.onClipboardOpenFileLocation?.(filePath)) || {
            ok: false,
            reason: "无法打开目录"
          }
        );
      }
    });
  };

  return {
    filterBarElement: clipboardFilterBar.element,
    batchBarElement: clipboardBatchBar.element,
    getFilter: () => clipboardFilter,
    syncBatchBar,
    resetBatchStateIfNeeded,
    pruneSelection,
    renderList
  };
}
