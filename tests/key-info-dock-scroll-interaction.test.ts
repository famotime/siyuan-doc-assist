/** @vitest-environment jsdom */

import { describe, expect, test, vi } from "vitest";
import { KeyInfoItem } from "@/core/key-info-core";
import { createKeyInfoDock } from "@/ui/key-info-dock";

function item(id: string): KeyInfoItem {
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

describe("key-info-dock scroll interaction", () => {
  test("allows immediate user scrolling after clicking a key item", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const onItemClick = vi.fn();
    const dock = createKeyInfoDock(host, {
      onExport: () => {},
      onItemClick,
    });

    dock.setState({
      items: [item("1"), item("2")],
      loading: false,
      isRefreshing: false,
      scrollContextKey: "doc-a",
    });

    const list = host.querySelector(".doc-assistant-keyinfo__list") as HTMLDivElement | null;
    const row = host.querySelector(".doc-assistant-keyinfo__row") as HTMLDivElement | null;

    expect(list).toBeTruthy();
    expect(row).toBeTruthy();

    list!.scrollTop = 180;
    list!.dispatchEvent(new Event("scroll"));

    row!.click();
    expect(onItemClick).toHaveBeenCalledTimes(1);

    list!.scrollTop = 260;
    list!.dispatchEvent(new Event("scroll"));

    expect(list!.scrollTop).toBe(260);

    dock.destroy();
    host.remove();
  });

  test("does not prevent default on regular doc action button mousedown to allow dragging", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const dock = createKeyInfoDock(host, {
      onExport: () => {},
      onDocActionClick: () => {},
    });

    dock.setState({
      docActions: [
        {
          key: "insert-backlinks",
          label: "插入反链文档列表（去重）",
          icon: "iconList",
          group: "edit",
          groupLabel: "编辑",
          disabled: false,
          menuRegistered: true,
          menuToggleDisabled: false,
        },
      ],
    });

    const button = host.querySelector(".doc-assistant-keyinfo__action-btn") as HTMLButtonElement | null;
    expect(button).toBeTruthy();

    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    button!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);

    dock.destroy();
    host.remove();
  });

  test("prevents default on selection style action mousedown to keep editor selection", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const dock = createKeyInfoDock(host, {
      onExport: () => {},
      onDocActionClick: () => {},
    });

    dock.setState({
      docActions: [
        {
          key: "bold-selected-blocks",
          label: "选中块全部加粗",
          icon: "iconBold",
          group: "edit",
          groupLabel: "编辑",
          disabled: false,
          menuRegistered: true,
          menuToggleDisabled: false,
        },
      ],
    });

    const button = host.querySelector(".doc-assistant-keyinfo__action-btn") as HTMLButtonElement | null;
    expect(button).toBeTruthy();

    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    button!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);

    dock.destroy();
    host.remove();
  });

  test("reorders doc actions within same group and reports latest order", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const onDocActionReorder = vi.fn();
    const dock = createKeyInfoDock(host, {
      onExport: () => {},
      onDocActionClick: () => {},
      onDocActionReorder,
    });

    dock.setState({
      docActions: [
        {
          key: "export-current",
          label: "仅导出当前文档",
          icon: "iconDownload",
          group: "export",
          groupLabel: "导出",
          disabled: false,
          menuRegistered: true,
          menuToggleDisabled: false,
        },
        {
          key: "export-forward-zip",
          label: "打包导出正链文档",
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
          icon: "iconList",
          group: "edit",
          groupLabel: "编辑",
          disabled: false,
          menuRegistered: true,
          menuToggleDisabled: false,
        },
      ],
    });

    const rows = host.querySelectorAll(".doc-assistant-keyinfo__action-row");
    expect(rows.length).toBe(3);

    rows[0].dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    rows[1].dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));

    expect(onDocActionReorder).toHaveBeenCalledWith([
      "export-forward-zip",
      "export-current",
      "insert-backlinks",
    ]);
    const labels = Array.from(
      host.querySelectorAll(".doc-assistant-keyinfo__action-label")
    ).map((node) => node.textContent);
    expect(labels[0]).toBe("打包导出正链文档");

    dock.destroy();
    host.remove();
  });

  test("ignores cross-group row drop to avoid adding repeated group labels", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const onDocActionReorder = vi.fn();
    const dock = createKeyInfoDock(host, {
      onExport: () => {},
      onDocActionClick: () => {},
      onDocActionReorder,
    });

    dock.setState({
      docActions: [
        {
          key: "export-current",
          label: "仅导出当前文档",
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
          icon: "iconList",
          group: "edit",
          groupLabel: "编辑",
          disabled: false,
          menuRegistered: true,
          menuToggleDisabled: false,
        },
        {
          key: "export-forward-zip",
          label: "打包导出正链文档",
          icon: "iconDownload",
          group: "export",
          groupLabel: "导出",
          disabled: false,
          menuRegistered: true,
          menuToggleDisabled: false,
        },
      ],
    });

    const rows = host.querySelectorAll(".doc-assistant-keyinfo__action-row");
    expect(rows.length).toBe(3);

    rows[0].dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: {
        getData: (type: string) => (type === "text/plain" ? "export-current" : ""),
      },
    });
    rows[2].dispatchEvent(dropEvent);

    expect(onDocActionReorder).not.toHaveBeenCalled();
    const separatorLabels = Array.from(
      host.querySelectorAll(".doc-assistant-keyinfo__action-separator-label")
    ).map((node) => node.textContent);
    expect(separatorLabels.filter((label) => label === "导出")).toHaveLength(1);

    dock.destroy();
    host.remove();
  });

  test("ignores cross-group separator drop", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const onDocActionReorder = vi.fn();
    const dock = createKeyInfoDock(host, {
      onExport: () => {},
      onDocActionClick: () => {},
      onDocActionReorder,
    });

    dock.setState({
      docActions: [
        {
          key: "export-current",
          label: "仅导出当前文档",
          icon: "iconDownload",
          group: "export",
          groupLabel: "导出",
          disabled: false,
          menuRegistered: true,
          menuToggleDisabled: false,
        },
        {
          key: "export-forward-zip",
          label: "打包导出正链文档",
          icon: "iconDownload",
          group: "export",
          groupLabel: "导出",
          disabled: false,
          menuRegistered: true,
          menuToggleDisabled: false,
        },
        {
          key: "move-backlinks",
          label: "移动反链文档为子文档",
          icon: "iconMove",
          group: "organize",
          groupLabel: "整理",
          disabled: false,
          menuRegistered: true,
          menuToggleDisabled: false,
        },
        {
          key: "dedupe",
          label: "识别本层级重复文档",
          icon: "iconTrashcan",
          group: "organize",
          groupLabel: "整理",
          disabled: false,
          menuRegistered: true,
          menuToggleDisabled: false,
        },
        {
          key: "insert-backlinks",
          label: "插入反链文档列表（去重）",
          icon: "iconList",
          group: "edit",
          groupLabel: "编辑",
          disabled: false,
          menuRegistered: true,
          menuToggleDisabled: false,
        },
        {
          key: "insert-child-docs",
          label: "插入子文档列表（去重）",
          icon: "iconList",
          group: "edit",
          groupLabel: "编辑",
          disabled: false,
          menuRegistered: true,
          menuToggleDisabled: false,
        },
      ],
    });

    const rows = host.querySelectorAll(".doc-assistant-keyinfo__action-row");
    const separators = host.querySelectorAll(".doc-assistant-keyinfo__action-separator");
    expect(rows.length).toBe(6);
    expect(separators.length).toBeGreaterThanOrEqual(3);

    rows[4].dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: {
        getData: (type: string) => (type === "text/plain" ? "insert-backlinks" : ""),
      },
    });
    separators[1].dispatchEvent(dropEvent);

    expect(onDocActionReorder).not.toHaveBeenCalled();

    dock.destroy();
    host.remove();
  });

  test("triggers reset callback when clicking reset action order button", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const onDocActionOrderReset = vi.fn();
    const dock = createKeyInfoDock(host, {
      onExport: () => {},
      onDocActionOrderReset,
    });

    const resetButton = host.querySelector(
      ".doc-assistant-keyinfo__action-reset-btn"
    ) as HTMLButtonElement | null;
    expect(resetButton).toBeTruthy();

    resetButton!.click();
    expect(onDocActionOrderReset).toHaveBeenCalledTimes(1);

    dock.destroy();
    host.remove();
  });
});
