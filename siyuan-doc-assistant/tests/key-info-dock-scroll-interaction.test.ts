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
});
