import { describe, expect, test, vi } from "vitest";
import {
  buildDockDocActions,
  DOCK_ACTIVE_TAB_STORAGE_KEY,
  DOCK_TABS,
  loadPersistedDockActiveTab,
  normalizeDockTabKey,
  savePersistedDockActiveTab,
} from "@/core/dock-panel-core";

describe("dock-panel-core", () => {
  test("defines key info and doc process tabs", () => {
    expect(DOCK_TABS).toEqual([
      { key: "key-info", label: "关键内容" },
      { key: "doc-process", label: "文档处理" },
    ]);
  });

  test("marks desktop-only actions as disabled on mobile", () => {
    const actions = buildDockDocActions(
      [
        {
          key: "export-current",
          commandText: "仅导出当前文档",
          icon: "iconDownload",
          group: "export",
        },
        {
          key: "move-backlinks",
          commandText: "移动反链文档为子文档",
          desktopOnly: true,
          icon: "iconMove",
          group: "organize",
        },
        {
          key: "convert-images-to-webp",
          commandText: "批量转换为WebP",
          icon: "iconImage",
          group: "image",
        },
        {
          key: "convert-images-to-png",
          commandText: "批量转换为PNG",
          icon: "iconImage",
          group: "image",
        },
        {
          key: "remove-doc-images",
          commandText: "删除本文档图片",
          icon: "iconImage",
          group: "image",
        },
      ],
      true,
      {
        "export-current": false,
        "move-backlinks": true,
        "convert-images-to-webp": true,
        "convert-images-to-png": true,
        "remove-doc-images": true,
      }
    );

    expect(actions).toEqual([
      {
        key: "export-current",
        label: "仅导出当前文档",
        tooltip: "仅导出当前文档",
        icon: "iconDownload",
        group: "export",
        groupLabel: "导出",
        disabled: false,
        menuRegistered: false,
        menuToggleDisabled: false,
      },
      {
        key: "move-backlinks",
        label: "移动反链文档为子文档",
        tooltip: "移动反链文档为子文档",
        icon: "iconMove",
        group: "organize",
        groupLabel: "整理",
        disabled: true,
        disabledReason: "该操作当前仅支持桌面端",
        menuRegistered: true,
        menuToggleDisabled: true,
        menuToggleDisabledReason: "该操作当前仅支持桌面端",
      },
      {
        key: "convert-images-to-webp",
        label: "批量转换为WebP",
        tooltip: "批量转换为WebP",
        icon: "iconImage",
        group: "image",
        groupLabel: "图片",
        disabled: false,
        menuRegistered: true,
        menuToggleDisabled: false,
      },
      {
        key: "convert-images-to-png",
        label: "批量转换为PNG",
        tooltip: "批量转换为PNG",
        icon: "iconImage",
        group: "image",
        groupLabel: "图片",
        disabled: false,
        menuRegistered: true,
        menuToggleDisabled: false,
      },
      {
        key: "remove-doc-images",
        label: "删除本文档图片",
        tooltip: "删除本文档图片",
        icon: "iconImage",
        group: "image",
        groupLabel: "图片",
        disabled: false,
        menuRegistered: true,
        menuToggleDisabled: false,
      },
    ]);
  });

  test("marks writable-doc actions as disabled when current doc is readonly", () => {
    const actions = buildDockDocActions(
      [
        {
          key: "export-current",
          commandText: "仅导出当前文档",
          icon: "iconDownload",
          group: "export",
        },
        {
          key: "insert-backlinks",
          commandText: "插入反链文档列表（去重）",
          icon: "iconList",
          group: "insert",
          requiresWritableDoc: true,
        },
        {
          key: "move-backlinks",
          commandText: "移动反链文档为子文档",
          icon: "iconMove",
          group: "organize",
          requiresWritableDoc: true,
        },
      ],
      false,
      {
        "export-current": true,
        "insert-backlinks": true,
        "move-backlinks": true,
      },
      true
    );

    expect(actions).toEqual([
      {
        key: "export-current",
        label: "仅导出当前文档",
        tooltip: "仅导出当前文档",
        icon: "iconDownload",
        group: "export",
        groupLabel: "导出",
        disabled: false,
        menuRegistered: true,
        menuToggleDisabled: false,
      },
      {
        key: "insert-backlinks",
        label: "插入反链文档列表（去重）",
        tooltip: "插入反链文档列表（去重）",
        icon: "iconList",
        group: "insert",
        groupLabel: "插入",
        disabled: true,
        disabledReason: "当前文档已锁定，仅支持导出、筛选等只读操作",
        menuRegistered: true,
        menuToggleDisabled: true,
        menuToggleDisabledReason: "当前文档已锁定，仅支持导出、筛选等只读操作",
      },
      {
        key: "move-backlinks",
        label: "移动反链文档为子文档",
        tooltip: "移动反链文档为子文档",
        icon: "iconMove",
        group: "organize",
        groupLabel: "整理",
        disabled: true,
        disabledReason: "当前文档已锁定，仅支持导出、筛选等只读操作",
        menuRegistered: true,
        menuToggleDisabled: true,
        menuToggleDisabledReason: "当前文档已锁定，仅支持导出、筛选等只读操作",
      },
    ]);
  });

  test("normalizes persisted dock tab keys", () => {
    expect(normalizeDockTabKey("doc-process")).toBe("doc-process");
    expect(normalizeDockTabKey("key-info")).toBe("key-info");
    expect(normalizeDockTabKey("invalid")).toBe("key-info");
    expect(normalizeDockTabKey("invalid", "doc-process")).toBe("doc-process");
  });

  test("loads and saves persisted dock active tab defensively", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value);
      }),
    };

    expect(loadPersistedDockActiveTab(storage)).toBe("key-info");

    savePersistedDockActiveTab(storage, "doc-process");

    expect(storage.setItem).toHaveBeenCalledWith(DOCK_ACTIVE_TAB_STORAGE_KEY, "doc-process");
    expect(loadPersistedDockActiveTab(storage)).toBe("doc-process");

    values.set(DOCK_ACTIVE_TAB_STORAGE_KEY, "invalid");

    expect(loadPersistedDockActiveTab(storage)).toBe("key-info");
  });

  test("ignores dock active tab storage errors", () => {
    const throwingStorage = {
      getItem: vi.fn(() => {
        throw new Error("storage offline");
      }),
      setItem: vi.fn(() => {
        throw new Error("storage offline");
      }),
    };

    expect(loadPersistedDockActiveTab(throwingStorage)).toBe("key-info");
    expect(() => savePersistedDockActiveTab(throwingStorage, "doc-process")).not.toThrow();
  });
});
