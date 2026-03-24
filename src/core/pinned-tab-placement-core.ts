type TabClassListLike = {
  contains: (token: string) => boolean;
};

type TabHeadElementLike = {
  classList?: TabClassListLike | null;
};

export type PinnedTabPlacementLike = {
  id?: string;
  pin?: boolean;
  headElement?: TabHeadElementLike | null;
  children?: unknown;
  instance?: string;
};

type LayoutNodeLike = {
  children?: unknown[];
  instance?: string;
};

export function isPinnedTab(tab: PinnedTabPlacementLike): boolean {
  if (tab.pin) {
    return true;
  }
  return Boolean(tab.headElement?.classList?.contains("item--pin"));
}

function isLayoutTabLike(value: unknown): value is PinnedTabPlacementLike {
  if (!value || typeof value !== "object") {
    return false;
  }
  return (value as LayoutNodeLike).instance === "Tab"
    || "id" in value
    || "headElement" in value
    || "pin" in value;
}

function getLayoutChildren(node: unknown): unknown[] {
  if (!node || typeof node !== "object") {
    return [];
  }
  return Array.isArray((node as LayoutNodeLike).children)
    ? ((node as LayoutNodeLike).children as unknown[])
    : [];
}

function collectLayoutTabIdsInto(node: unknown, ids: string[]) {
  if (!node || typeof node !== "object") {
    return;
  }
  if (isLayoutTabLike(node)) {
    const id = typeof node.id === "string" ? node.id.trim() : "";
    if (id) {
      ids.push(id);
    }
  }
  for (const child of getLayoutChildren(node)) {
    collectLayoutTabIdsInto(child, ids);
  }
}

export function collectLayoutTabIds(node: unknown): string[] {
  const ids: string[] = [];
  collectLayoutTabIdsInto(node, ids);
  return ids;
}

export function resolveMoveTabNextIdAfterPinned(
  tabs: PinnedTabPlacementLike[],
  currentTabId: string
): string | null {
  const currentIndex = tabs.findIndex((tab) => tab.id === currentTabId);
  if (currentIndex < 0) {
    return null;
  }
  const currentTab = tabs[currentIndex];
  if (!currentTab || isPinnedTab(currentTab)) {
    return null;
  }

  let lastPinnedIndex = -1;
  tabs.forEach((tab, index) => {
    if (isPinnedTab(tab)) {
      lastPinnedIndex = index;
    }
  });
  if (lastPinnedIndex < 0) {
    return null;
  }

  const targetIndex = lastPinnedIndex + 1;
  if (targetIndex === currentIndex || targetIndex >= tabs.length) {
    return null;
  }

  const nextTab = tabs[targetIndex];
  return typeof nextTab?.id === "string" && nextTab.id
    ? nextTab.id
    : null;
}
