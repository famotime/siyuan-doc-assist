/**
 * 选区 DOM 清理公共骨架
 * 「选中块」与「局部选区」两条 DOM 清理路径的共享纯 DOM 逻辑：
 * 文本节点遍历变换、选中块收集、单块选区解析与选区内容替换。
 * 具体清理规则（空格/表情/标点）由调用方以 TextTransform 注入。
 */

export type TextTransformResult = {
  next: string;
  changedCount: number;
};

export type TextTransform = (source: string) => TextTransformResult;

export type SelectedBlocksCleanupResult = {
  changedBlockCount: number;
  changedCount: number;
};

export type PartialSelectionCleanupResult = {
  handled: boolean;
  changedCount: number;
};

export function findBlockElementById(root: HTMLElement, blockId: string): HTMLElement | null {
  const nodes = root.querySelectorAll<HTMLElement>("[data-node-id]");
  for (const node of nodes) {
    const id = node.dataset.nodeId || node.getAttribute("data-node-id") || "";
    if (id === blockId) {
      return node;
    }
  }
  return null;
}

export function isComplexStructuralBlock(block: HTMLElement): boolean {
  const type = (block.getAttribute("data-type") || "").trim().toLowerCase();
  return (
    type === "nodetable" ||
    type === "table" ||
    type === "nodelist" ||
    type === "list" ||
    type === "nodelistitem" ||
    type === "nodeblockquote" ||
    type === "nodesuperblock" ||
    block.querySelector("table") !== null
  );
}

export function resolveEditableForRange(range: Range, blockElement: HTMLElement): HTMLElement | null {
  let current: Node | null = range.startContainer;
  while (current && current !== blockElement) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const el = current as HTMLElement;
      if (el.tagName === "TH" || el.tagName === "TD") {
        return el;
      }
      if (el.getAttribute("contenteditable") === "true" && el.tagName !== "TABLE") {
        return el;
      }
    }
    current = current.parentElement;
  }
  const editable = blockElement.querySelector('[contenteditable="true"]') as HTMLElement | null;
  if (editable && editable.tagName === "TABLE") {
    return null;
  }
  return editable || blockElement;
}

export function filterOutNestedSelectedBlockIds(
  root: HTMLElement | undefined,
  selectedIds: string[]
): string[] {
  if (!root || selectedIds.length <= 1) {
    return selectedIds;
  }
  const idSet = new Set(selectedIds);
  const topIds: string[] = [];
  for (const id of selectedIds) {
    const el = findBlockElementById(root, id);
    if (!el) {
      topIds.push(id);
      continue;
    }
    let ancestor = el.parentElement;
    let hasAncestorInSet = false;
    while (ancestor && ancestor !== root) {
      const ancestorId = ancestor.getAttribute("data-node-id");
      if (ancestorId && idSet.has(ancestorId)) {
        hasAncestorInSet = true;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    if (!hasAncestorInSet) {
      topIds.push(id);
    }
  }
  return topIds;
}

export function resolveRangeBoundaryBlockId(root: HTMLElement, container: Node): string {
  const baseElement =
    container.nodeType === Node.ELEMENT_NODE ?
        (container as Element) :
      container.parentElement;
  if (!baseElement) {
    return "";
  }
  const blockElement = baseElement.closest?.("[data-node-id]") as HTMLElement | null;
  if (!blockElement || !root.contains(blockElement)) {
    return "";
  }
  return (blockElement.dataset.nodeId || blockElement.getAttribute("data-node-id") || "").trim();
}

/**
 * 对元素内所有文本节点应用变换，写回并返回累计变更数
 */
export function transformTextNodesInElement(root: HTMLElement, transform: TextTransform): number {
  let changedCount = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    const textNode = current as Text;
    const source = textNode.nodeValue || "";
    const transformed = transform(source);
    if (transformed.changedCount > 0) {
      textNode.nodeValue = transformed.next;
      changedCount += transformed.changedCount;
    }
    current = walker.nextNode();
  }
  return changedCount;
}

/**
 * 收集选中块对应的块元素（按传入顺序）。
 * 任一选中块缺失或为复杂结构块时返回 null（放弃 DOM 路径，由调用方走 fallback）。
 */
export function collectSelectedBlockElements(
  root: HTMLElement | undefined,
  selectedIds: string[]
): HTMLElement[] | null {
  if (!root || !selectedIds.length) {
    return null;
  }

  const blockElements: HTMLElement[] = [];
  for (const id of selectedIds) {
    const block = findBlockElementById(root, id);
    if (!block || isComplexStructuralBlock(block)) {
      return null;
    }
    blockElements.push(block);
  }
  return blockElements;
}

/**
 * 「选中块」路径骨架：对每个选中块的编辑区应用文本节点变换。
 */
export function applyTextTransformToSelectedBlocks(
  root: HTMLElement | undefined,
  selectedIds: string[],
  transform: TextTransform
): SelectedBlocksCleanupResult | null {
  const blockElements = collectSelectedBlockElements(root, selectedIds);
  if (!blockElements) {
    return null;
  }

  let changedBlockCount = 0;
  let changedCount = 0;
  for (const block of blockElements) {
    const editable =
      (block.querySelector('[contenteditable="true"]') as HTMLElement | null) || block;
    const changedInBlock = transformTextNodesInElement(editable, transform);
    if (changedInBlock > 0) {
      changedBlockCount += 1;
      changedCount += changedInBlock;
      editable.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  return { changedBlockCount, changedCount };
}

/**
 * 「局部选区」路径骨架：仅处理位于单个块内的非折叠选区，
 * 将选中文本经变换后写回，并总是清除当前选区。
 */
export function applyTextTransformToPartialSelection(
  root: HTMLElement | undefined,
  transform: TextTransform
): PartialSelectionCleanupResult {
  if (typeof window === "undefined") {
    return { handled: false, changedCount: 0 };
  }

  if (!root) {
    return { handled: false, changedCount: 0 };
  }
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return { handled: false, changedCount: 0 };
  }

  const range = selection.getRangeAt(0);
  const startBlockId = resolveRangeBoundaryBlockId(root, range.startContainer);
  const endBlockId = resolveRangeBoundaryBlockId(root, range.endContainer);
  if (!startBlockId || !endBlockId || startBlockId !== endBlockId) {
    return { handled: false, changedCount: 0 };
  }

  const blockElement = findBlockElementById(root, startBlockId);
  if (!blockElement) {
    return { handled: false, changedCount: 0 };
  }

  const editable = resolveEditableForRange(range, blockElement);
  if (!editable) {
    return { handled: false, changedCount: 0 };
  }

  const selectedText = range.toString();
  const transformed = transform(selectedText);
  const changedCount = transformed.changedCount;

  if (changedCount > 0) {
    range.deleteContents();
    range.insertNode(document.createTextNode(transformed.next));
    editable.dispatchEvent(new Event("input", { bubbles: true }));
  }
  selection.removeAllRanges();
  return { handled: true, changedCount };
}
