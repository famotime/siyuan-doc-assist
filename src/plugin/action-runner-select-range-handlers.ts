import { showMessage } from "siyuan";
import { createDocAssistantLogger } from "@/core/logger-core";
import {
  findSelectFromCurrentToEndBlockIds,
  findSelectFromStartToCurrentBlockIds,
} from "@/core/markdown-cleanup-core";
import { resolveDocDirectChildBlockId } from "@/services/block-lineage";
import { getChildBlockRefsByParentId } from "@/services/kernel";
import { resolveCurrentBlockId } from "@/plugin/action-runner-context";
import { PartialActionHandlerMap } from "@/plugin/action-runner-dispatcher";
import { ProtyleLike } from "@/plugin/doc-context";

const selectRangeLogger = createDocAssistantLogger("SelectRange");

export function isBlockOrAncestorInTargetSet(
  node: HTMLElement,
  targetSet: Set<string>
): boolean {
  let current: HTMLElement | null = node;
  while (current && current.hasAttribute("data-node-id")) {
    const id = current.dataset.nodeId || current.getAttribute("data-node-id") || "";
    if (id && targetSet.has(id)) {
      return true;
    }
    const parent: HTMLElement | null = current.parentElement;
    current = parent ? (parent.closest("[data-node-id]") as HTMLElement | null) : null;
  }
  return false;
}

export function applyBlockSelectionInDom(root: HTMLElement, targetBlockIds: string[]): number {
  const targetSet = new Set(targetBlockIds);
  const blockNodes = root.querySelectorAll<HTMLElement>("[data-node-id]");
  let count = 0;
  blockNodes.forEach((node) => {
    if (isBlockOrAncestorInTargetSet(node, targetSet)) {
      node.classList.add("protyle-wysiwyg--select");
      count++;
    } else {
      node.classList.remove("protyle-wysiwyg--select");
    }
  });
  return count;
}

export class RangeSelectionObserverManager {
  private activeRoot: HTMLElement | null = null;
  private activeTargetSet = new Set<string>();
  private observer: MutationObserver | null = null;
  private scrollHandler: (() => void) | null = null;

  public activate(root: HTMLElement, targetBlockIds: string[]) {
    this.deactivate();

    this.activeRoot = root;
    this.activeTargetSet = new Set(targetBlockIds);

    applyBlockSelectionInDom(root, targetBlockIds);

    if (typeof MutationObserver !== "undefined") {
      this.observer = new MutationObserver(() => {
        if (this.activeRoot && this.activeTargetSet.size > 0) {
          applyBlockSelectionInDom(this.activeRoot, Array.from(this.activeTargetSet));
        }
      });

      try {
        this.observer.observe(root, {
          childList: true,
          subtree: true,
        });
      } catch {
        // Ignore observation errors in synthetic test environments
      }
    }

    const scrollContainer =
      (root.closest(".protyle-content") as HTMLElement | null) ||
      root.parentElement;

    if (scrollContainer) {
      this.scrollHandler = () => {
        if (this.activeRoot && this.activeTargetSet.size > 0) {
          applyBlockSelectionInDom(this.activeRoot, Array.from(this.activeTargetSet));
        }
      };
      try {
        scrollContainer.addEventListener("scroll", this.scrollHandler, { passive: true });
      } catch {
        // Ignore event listener errors in synthetic environments
      }
    }
  }

  public deactivate() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.activeRoot && this.scrollHandler) {
      const scrollContainer =
        (this.activeRoot.closest(".protyle-content") as HTMLElement | null) ||
        this.activeRoot.parentElement;
      if (scrollContainer) {
        try {
          scrollContainer.removeEventListener("scroll", this.scrollHandler);
        } catch {
          // Ignore event unbind errors in synthetic environments
        }
      }
    }
    this.scrollHandler = null;
    this.activeRoot = null;
    this.activeTargetSet.clear();
  }

  public getActiveTargetSet(): Set<string> {
    return new Set(this.activeTargetSet);
  }
}

export const rangeSelectionObserverManager = new RangeSelectionObserverManager();

export async function ensureRangeBlocksLoadedInDom(
  root: HTMLElement,
  targetBlockIds: string[],
  direction: "to-start" | "to-end",
  maxAttempts = 30,
  pollIntervalMs = 150
): Promise<number> {
  if (!targetBlockIds.length) {
    return 0;
  }

  const scrollContainer =
    (root.closest(".protyle-content") as HTMLElement | null) ||
    root.parentElement ||
    root;

  const targetSet = new Set(targetBlockIds);
  const boundaryBlockId =
    direction === "to-start"
      ? targetBlockIds[0]
      : targetBlockIds[targetBlockIds.length - 1];

  let attempts = 0;

  while (attempts < maxAttempts) {
    const renderedNodes = root.querySelectorAll<HTMLElement>("[data-node-id]");
    let renderedCount = 0;
    let hasBoundaryBlock = false;

    renderedNodes.forEach((node) => {
      const id = node.dataset.nodeId || node.getAttribute("data-node-id") || "";
      if (targetSet.has(id)) {
        renderedCount++;
      }
      if (id === boundaryBlockId) {
        hasBoundaryBlock = true;
      }
    });

    if (hasBoundaryBlock || renderedCount >= targetBlockIds.length) {
      break;
    }

    if (scrollContainer && typeof scrollContainer.dispatchEvent === "function") {
      if (direction === "to-start") {
        scrollContainer.scrollTop = 0;
      } else {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
      try {
        scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }));
      } catch {
        // Ignore scroll event dispatch errors in synthetic environments
      }
    }

    attempts++;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return applyBlockSelectionInDom(root, targetBlockIds);
}

export function createSelectRangeActionHandlers(): PartialActionHandlerMap {
  return {
    "select-from-start-to-current": async (docId, protyle) =>
      handleSelectFromStartToCurrent(docId, protyle),
    "select-from-current-to-end": async (docId, protyle) =>
      handleSelectFromCurrentToEnd(docId, protyle),
  };
}

async function handleSelectFromStartToCurrent(docId: string, protyle?: ProtyleLike) {
  const current = resolveCurrentBlockId(docId, protyle);
  const currentBlockId = current.id;
  if (!currentBlockId) {
    showMessage("未定位到当前段落，请将光标置于正文后重试", 5000, "error");
    return;
  }

  const blocks = await getChildBlockRefsByParentId(docId);
  if (!blocks.length) {
    showMessage("当前文档没有可处理的段落", 4000, "info");
    return;
  }

  const directChildIdSet = new Set(blocks.map((item) => item.id));
  let selectEndId = currentBlockId;
  if (!directChildIdSet.has(selectEndId)) {
    const mapped = await resolveDocDirectChildBlockId(docId, selectEndId);
    if (mapped) {
      selectEndId = mapped;
    }
  }

  const result = findSelectFromStartToCurrentBlockIds(blocks, selectEndId);
  if (result.selectedCount === 0) {
    showMessage("未找到可选中的段落范围", 5000, "error");
    return;
  }

  const root = protyle?.wysiwyg?.element as HTMLElement | undefined;
  if (root) {
    await ensureRangeBlocksLoadedInDom(root, result.selectedIds, "to-start");
    rangeSelectionObserverManager.activate(root, result.selectedIds);
  }

  selectRangeLogger.debug("select-from-start-to-current", {
    docId,
    currentBlockId,
    selectEndId,
    selectedCount: result.selectedCount,
  });
}

async function handleSelectFromCurrentToEnd(docId: string, protyle?: ProtyleLike) {
  const current = resolveCurrentBlockId(docId, protyle);
  const currentBlockId = current.id;
  if (!currentBlockId) {
    showMessage("未定位到当前段落，请将光标置于正文后重试", 5000, "error");
    return;
  }

  const blocks = await getChildBlockRefsByParentId(docId);
  if (!blocks.length) {
    showMessage("当前文档没有可处理的段落", 4000, "info");
    return;
  }

  const directChildIdSet = new Set(blocks.map((item) => item.id));
  let selectStartId = currentBlockId;
  if (!directChildIdSet.has(selectStartId)) {
    const mapped = await resolveDocDirectChildBlockId(docId, selectStartId);
    if (mapped) {
      selectStartId = mapped;
    }
  }

  const result = findSelectFromCurrentToEndBlockIds(blocks, selectStartId);
  if (result.selectedCount === 0) {
    showMessage("未找到可选中的段落范围", 5000, "error");
    return;
  }

  const root = protyle?.wysiwyg?.element as HTMLElement | undefined;
  if (root) {
    await ensureRangeBlocksLoadedInDom(root, result.selectedIds, "to-end");
    rangeSelectionObserverManager.activate(root, result.selectedIds);
  }

  selectRangeLogger.debug("select-from-current-to-end", {
    docId,
    currentBlockId,
    selectStartId,
    selectedCount: result.selectedCount,
  });
}
