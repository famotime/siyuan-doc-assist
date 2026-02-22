import { describe, expect, test } from "vitest";
import { buildDockDocActions, DOCK_TABS } from "@/core/dock-panel-core";

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
      ],
      true,
      {
        "export-current": false,
        "move-backlinks": true,
      }
    );

    expect(actions).toEqual([
      {
        key: "export-current",
        label: "仅导出当前文档",
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
        icon: "iconMove",
        group: "organize",
        groupLabel: "整理",
        disabled: true,
        disabledReason: "该操作当前仅支持桌面端",
        menuRegistered: true,
        menuToggleDisabled: true,
        menuToggleDisabledReason: "该操作当前仅支持桌面端",
      },
    ]);
  });
});
