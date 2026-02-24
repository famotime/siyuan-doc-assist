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

  test("prevents default on doc action button mousedown to keep editor selection", () => {
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

  test("reorders doc actions by drag and reports latest order", () => {
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
      ],
    });

    const rows = host.querySelectorAll(".doc-assistant-keyinfo__action-row");
    const list = host.querySelector(".doc-assistant-keyinfo__actions") as HTMLDivElement | null;
    expect(rows.length).toBe(2);
    expect(list).toBeTruthy();

    rows[0].dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    list!.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));

    expect(onDocActionReorder).toHaveBeenCalledWith([
      "insert-backlinks",
      "export-current",
    ]);
    const labels = Array.from(
      host.querySelectorAll(".doc-assistant-keyinfo__action-label")
    ).map((node) => node.textContent);
    expect(labels[0]).toBe("插入反链文档列表（去重）");

    dock.destroy();
    host.remove();
  });
});
