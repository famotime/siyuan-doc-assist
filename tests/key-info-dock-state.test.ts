import { describe, expect, test } from "vitest";
import type { KeyInfoItem, KeyInfoType } from "@/core/key-info-core";
import type { DockDocAction } from "@/core/dock-panel-core";
import {
  deriveKeyInfoDockRenderFlags,
  isKeyInfoDockAllFilterActive,
  isKeyInfoDockFilterKeyActive,
  isKeyInfoDockTabActive,
  type KeyInfoDockStateSnapshot,
} from "@/ui/key-info-dock-state";

function buildItem(id: string): KeyInfoItem {
  return {
    id,
    type: "bold",
    text: `text-${id}`,
    raw: `text-${id}`,
    offset: 0,
    blockId: `block-${id}`,
    blockSort: 0,
    order: 0,
  };
}

function buildDocAction(key: string): DockDocAction {
  return {
    key,
    label: key,
    icon: "icon",
    group: "edit",
    groupLabel: "编辑",
    disabled: false,
    menuRegistered: true,
    menuToggleDisabled: false,
  };
}

function buildState(): KeyInfoDockStateSnapshot {
  return {
    items: [buildItem("1")],
    filter: ["bold"],
    loading: false,
    emptyText: "暂无关键内容",
    activeTab: "key-info",
    docMenuRegisterAll: true,
    docActions: [buildDocAction("insert-backlinks")],
    favoriteActionKeys: ["insert-backlinks"],
    scrollContextKey: "doc-a",
  };
}

describe("key-info-dock-state", () => {
  test("returns no render flags when tracked state references stay unchanged", () => {
    const prev = buildState();
    const next = { ...prev };

    expect(deriveKeyInfoDockRenderFlags(prev, next)).toEqual({
      renderList: false,
      renderDocActions: false,
      renderDocMenuToggle: false,
      scrollContextChanged: false,
    });
  });

  test.each([
    ["items", (state: KeyInfoDockStateSnapshot) => ({ ...state, items: [...state.items] })],
    ["filter", (state: KeyInfoDockStateSnapshot) => ({ ...state, filter: [...state.filter] })],
    ["loading", (state: KeyInfoDockStateSnapshot) => ({ ...state, loading: true })],
    ["emptyText", (state: KeyInfoDockStateSnapshot) => ({ ...state, emptyText: "空" })],
    ["activeTab", (state: KeyInfoDockStateSnapshot) => ({ ...state, activeTab: "doc-process" })],
  ])("marks list for rerender when %s changes", (_, buildNext) => {
    const prev = buildState();
    const next = buildNext(prev);

    expect(deriveKeyInfoDockRenderFlags(prev, next).renderList).toBe(true);
  });

  test("marks list rerender and scroll context change when scrollContextKey changes", () => {
    const prev = buildState();
    const next = { ...prev, scrollContextKey: "doc-b" };

    expect(deriveKeyInfoDockRenderFlags(prev, next)).toEqual({
      renderList: true,
      renderDocActions: false,
      renderDocMenuToggle: false,
      scrollContextChanged: true,
    });
  });

  test("marks doc actions for rerender when actions or favorites change", () => {
    const prev = buildState();

    const nextActions = { ...prev, docActions: [...prev.docActions] };
    expect(deriveKeyInfoDockRenderFlags(prev, nextActions).renderDocActions).toBe(true);

    const nextFavorites = {
      ...prev,
      favoriteActionKeys: [...prev.favoriteActionKeys, "move-backlinks"],
    };
    expect(deriveKeyInfoDockRenderFlags(prev, nextFavorites).renderDocActions).toBe(true);
  });

  test("marks doc menu toggle for rerender when register-all flag changes", () => {
    const prev = buildState();
    const next = { ...prev, docMenuRegisterAll: false };

    expect(deriveKeyInfoDockRenderFlags(prev, next).renderDocMenuToggle).toBe(true);
  });

  test("derives all filter active state from full type count", () => {
    expect(isKeyInfoDockAllFilterActive(["bold", "title"], 2)).toBe(true);
    expect(isKeyInfoDockAllFilterActive(["bold"], 2)).toBe(false);
  });

  test("derives filter button active state for all and type keys", () => {
    const filter: KeyInfoType[] = ["bold", "highlight"];

    expect(isKeyInfoDockFilterKeyActive(filter, "all", 2)).toBe(true);
    expect(isKeyInfoDockFilterKeyActive(filter, "bold", 2)).toBe(true);
    expect(isKeyInfoDockFilterKeyActive(filter, "code", 2)).toBe(false);
  });

  test("derives tab button active state", () => {
    expect(isKeyInfoDockTabActive("key-info", "key-info")).toBe(true);
    expect(isKeyInfoDockTabActive("key-info", "doc-process")).toBe(false);
  });
});
