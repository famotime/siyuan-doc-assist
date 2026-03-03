import type { KeyInfoFilter, KeyInfoItem, KeyInfoType } from "@/core/key-info-core";
import type { DockDocAction, DockTabKey } from "@/core/dock-panel-core";

export type KeyInfoDockStateSnapshot = {
  items: KeyInfoItem[];
  filter: KeyInfoFilter;
  loading: boolean;
  emptyText: string;
  activeTab: DockTabKey;
  docMenuRegisterAll: boolean;
  docActions: DockDocAction[];
  favoriteActionKeys: string[];
  scrollContextKey: string;
};

export type KeyInfoDockRenderFlags = {
  renderList: boolean;
  renderDocActions: boolean;
  renderDocMenuToggle: boolean;
  scrollContextChanged: boolean;
};

export function deriveKeyInfoDockRenderFlags(
  prev: KeyInfoDockStateSnapshot,
  next: KeyInfoDockStateSnapshot
): KeyInfoDockRenderFlags {
  const scrollContextChanged = prev.scrollContextKey !== next.scrollContextKey;
  return {
    renderList:
      prev.items !== next.items ||
      prev.filter !== next.filter ||
      prev.loading !== next.loading ||
      prev.emptyText !== next.emptyText ||
      prev.activeTab !== next.activeTab ||
      scrollContextChanged,
    renderDocActions:
      prev.docActions !== next.docActions ||
      prev.favoriteActionKeys !== next.favoriteActionKeys,
    renderDocMenuToggle: prev.docMenuRegisterAll !== next.docMenuRegisterAll,
    scrollContextChanged,
  };
}

export function isKeyInfoDockAllFilterActive(
  filter: KeyInfoFilter,
  totalTypeCount: number
): boolean {
  return filter.length >= totalTypeCount;
}

export function isKeyInfoDockFilterKeyActive(
  filter: KeyInfoFilter,
  key: "all" | KeyInfoType,
  totalTypeCount: number
): boolean {
  if (key === "all") {
    return isKeyInfoDockAllFilterActive(filter, totalTypeCount);
  }
  return new Set(filter).has(key);
}

export function isKeyInfoDockTabActive(
  activeTab: DockTabKey,
  tabKey: DockTabKey
): boolean {
  return activeTab === tabKey;
}
