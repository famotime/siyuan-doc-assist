const DOC_POPOVER_HOVER_DELAY_MS = 350;

export type DocPopoverControllerOptions = {
  container: HTMLElement;
  list: HTMLElement;
  getRowElements: () => readonly HTMLElement[];
  onLeaveOutside: () => void;
};

export type DocPopoverController = {
  attachRow: (row: HTMLElement) => void;
  resetListState: () => void;
  clearMoveListener: () => void;
  isPointerInPopover: (relatedTarget?: EventTarget | null) => boolean;
  scheduleLeaveWatch: () => void;
  destroy: () => void;
};

export function createDocPopoverController(
  options: DocPopoverControllerOptions
): DocPopoverController {
  const { container, list, getRowElements, onLeaveOutside } = options;

  const rowHoverTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  const rowCloseTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  const hoveredRows = new WeakSet<HTMLElement>();
  let pendingPopoverRow: HTMLElement | null = null;
  let hasEnteredPopover = false;
  let popoverMoveListener: ((e: PointerEvent) => void) | null = null;

  const clearRowPopoverTimers = () => {
    rowHoverTimers.forEach((timer) => clearTimeout(timer));
    rowHoverTimers.clear();
    rowCloseTimers.forEach((timer) => clearTimeout(timer));
    rowCloseTimers.clear();
  };

  const isPointerInElement = (el: HTMLElement) => hoveredRows.has(el);

  const resetPreventPopoverAttrs = () => {
    getRowElements().forEach((el) => {
      if (el.classList.contains("doc-assistant-dynamic-outline__doc-item")) {
        el.setAttribute("prevent-popover", "true");
      }
    });
  };

  const hasUnpinnedRowPopover = (row: HTMLElement) => {
    const blockPanels = (window as unknown as {
      siyuan?: { blockPanels?: Array<{ element?: Element; targetElement?: Node; destroy?: () => void }> };
    })?.siyuan?.blockPanels;
    if (!Array.isArray(blockPanels)) {
      return false;
    }
    return blockPanels.some((panel) => {
      if (!panel || panel.element?.getAttribute?.("data-pin") === "true") {
        return false;
      }
      const targetEl = panel.targetElement;
      return targetEl === row || (targetEl ? row.contains(targetEl) : false);
    });
  };

  const destroyUnpinnedRowPopovers = (row?: HTMLElement | null) => {
    const blockPanels = (window as unknown as {
      siyuan?: { blockPanels?: Array<{ element?: Element; targetElement?: Node; destroy?: () => void }> };
    })?.siyuan?.blockPanels;
    if (!Array.isArray(blockPanels)) {
      return;
    }
    for (let i = blockPanels.length - 1; i >= 0; i--) {
      const panel = blockPanels[i];
      if (!panel || panel.element?.getAttribute?.("data-pin") === "true") {
        continue;
      }
      const targetEl = panel.targetElement;
      const matched = row ?
          (targetEl === row || (targetEl ? row.contains(targetEl) : false)) :
          Boolean(targetEl && list.contains(targetEl));
      if (matched && typeof panel.destroy === "function") {
        panel.destroy();
      }
    }
  };

  const clearMoveListener = () => {
    if (popoverMoveListener) {
      document.removeEventListener("pointermove", popoverMoveListener);
      popoverMoveListener = null;
    }
  };

  const isPointerInPopover = (relatedTarget?: EventTarget | null) => {
    if (relatedTarget && relatedTarget instanceof Element && relatedTarget.closest(".block__popover")) {
      return true;
    }
    try {
      return Boolean(document.querySelector(".block__popover:hover"));
    } catch {
      return false;
    }
  };

  const scheduleLeaveWatch = () => {
    if (popoverMoveListener) {
      return;
    }
    popoverMoveListener = (moveEvent: PointerEvent) => {
      const target = moveEvent.target;
      const inContainer = target instanceof Node ? container.contains(target) : false;
      const inPopover =
        (target instanceof Element ? Boolean(target.closest(".block__popover")) : false) ||
        isPointerInPopover();
      if (inPopover) {
        hasEnteredPopover = true;
      }
      if (
        pendingPopoverRow &&
        hasEnteredPopover &&
        !inPopover &&
        !isPointerInElement(pendingPopoverRow)
      ) {
        destroyUnpinnedRowPopovers(pendingPopoverRow);
        resetPreventPopoverAttrs();
        pendingPopoverRow = null;
        hasEnteredPopover = false;
      }
      if (!inContainer && !inPopover) {
        clearMoveListener();
        onLeaveOutside();
      }
    };
    document.addEventListener("pointermove", popoverMoveListener, { passive: true });
  };

  const isPointerInCloseBtn = (target: EventTarget | null, row: HTMLElement) => {
    if (target instanceof Element && target.closest(".doc-assistant-dynamic-outline__doc-close")) {
      return true;
    }
    try {
      return Boolean(row.querySelector(".doc-assistant-dynamic-outline__doc-close:hover"));
    } catch {
      return false;
    }
  };

  const attachRow = (row: HTMLElement) => {
    row.addEventListener("mouseover", (e) => {
      if (!isPointerInCloseBtn(e.target, row)) {
        return;
      }
      const existingHoverTimer = rowHoverTimers.get(row);
      if (existingHoverTimer) {
        clearTimeout(existingHoverTimer);
        rowHoverTimers.delete(row);
      }
      row.setAttribute("prevent-popover", "true");
      destroyUnpinnedRowPopovers(row);
      if (pendingPopoverRow === row) {
        pendingPopoverRow = null;
        hasEnteredPopover = false;
      }
    });

    row.addEventListener("mouseenter", () => {
      hoveredRows.add(row);
      const pendingCloseTimer = rowCloseTimers.get(row);
      if (pendingCloseTimer) {
        clearTimeout(pendingCloseTimer);
        rowCloseTimers.delete(row);
      }
      const existingTimer = rowHoverTimers.get(row);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // 若当前已显示该文档的浮窗，保持 prevent-popover="true" 防止思源重复重建同一浮窗导致闪烁
      if (hasUnpinnedRowPopover(row)) {
        row.setAttribute("prevent-popover", "true");
        if (pendingPopoverRow === row) {
          pendingPopoverRow = null;
          hasEnteredPopover = false;
        }
        return;
      }

      const hoverTimer = setTimeout(() => {
        rowHoverTimers.delete(row);
        if (hasEnteredPopover || isPointerInPopover() || isPointerInCloseBtn(null, row)) {
          return;
        }
        if (hasUnpinnedRowPopover(row)) {
          row.setAttribute("prevent-popover", "true");
          return;
        }
        if (pendingPopoverRow && pendingPopoverRow !== row) {
          destroyUnpinnedRowPopovers(pendingPopoverRow);
          pendingPopoverRow = null;
        }
        resetPreventPopoverAttrs();
        row.removeAttribute("prevent-popover");
        row.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        if (hasUnpinnedRowPopover(row)) {
          row.setAttribute("prevent-popover", "true");
        }
      }, DOC_POPOVER_HOVER_DELAY_MS);
      rowHoverTimers.set(row, hoverTimer);
    });

    row.addEventListener("mouseleave", (e) => {
      hoveredRows.delete(row);
      const existingHoverTimer = rowHoverTimers.get(row);
      if (existingHoverTimer) {
        clearTimeout(existingHoverTimer);
        rowHoverTimers.delete(row);
      }
      row.setAttribute("prevent-popover", "true");

      const hasActivePopoverForRow = hasUnpinnedRowPopover(row);

      if (isPointerInPopover(e.relatedTarget)) {
        pendingPopoverRow = row;
        hasEnteredPopover = true;
        scheduleLeaveWatch();
        return;
      }

      let nextDocRow: HTMLElement | null = null;
      if (e.relatedTarget instanceof Element) {
        nextDocRow = e.relatedTarget.closest(".doc-assistant-dynamic-outline__doc-item") as HTMLElement | null;
      }
      const movingToSiblingDoc = Boolean(nextDocRow && nextDocRow !== row && list.contains(nextDocRow));

      const existingCloseTimer = rowCloseTimers.get(row);
      if (existingCloseTimer) {
        clearTimeout(existingCloseTimer);
      }

      if (movingToSiblingDoc && hasActivePopoverForRow) {
        // 鼠标从当前文档向下方/上方移动经过相邻文档项去往浮窗时，保持当前浮窗等待用户进入浮窗
        pendingPopoverRow = row;
        hasEnteredPopover = false;
        scheduleLeaveWatch();

        const timer = setTimeout(() => {
          rowCloseTimers.delete(row);
          if (isPointerInElement(row)) {
            return;
          }
          if (isPointerInPopover() || hasEnteredPopover) {
            return;
          }
          destroyUnpinnedRowPopovers(row);
          resetPreventPopoverAttrs();
          pendingPopoverRow = null;
        }, 360);
        rowCloseTimers.set(row, timer);
        return;
      }

      const timer = setTimeout(() => {
        rowCloseTimers.delete(row);
        if (isPointerInElement(row)) {
          return;
        }
        if (isPointerInPopover()) {
          pendingPopoverRow = row;
          hasEnteredPopover = true;
          scheduleLeaveWatch();
          return;
        }
        destroyUnpinnedRowPopovers(row);
        resetPreventPopoverAttrs();
        if (pendingPopoverRow === row) {
          pendingPopoverRow = null;
          hasEnteredPopover = false;
        }
      }, 150);
      rowCloseTimers.set(row, timer);
    });
  };

  const resetListState = () => {
    clearRowPopoverTimers();
    pendingPopoverRow = null;
    hasEnteredPopover = false;
  };

  const destroy = () => {
    clearMoveListener();
    resetListState();
  };

  return {
    attachRow,
    resetListState,
    clearMoveListener,
    isPointerInPopover,
    scheduleLeaveWatch,
    destroy
  };
}
