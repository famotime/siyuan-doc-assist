/** @vitest-environment jsdom */

import { describe, expect, test } from "vitest";
import { createKeyInfoDock } from "@/ui/key-info-dock";
import { KeyInfoItem } from "@/core/key-info-core";

function item(partial: Partial<KeyInfoItem>): KeyInfoItem {
  return {
    id: partial.id || "id-1",
    type: partial.type || "bold",
    text: partial.text || "",
    raw: partial.raw || partial.text || "",
    offset: partial.offset ?? 0,
    blockId: partial.blockId || "block-1",
    blockSort: partial.blockSort ?? 0,
    order: partial.order ?? 0,
    listItem: partial.listItem,
    listPrefix: partial.listPrefix,
  };
}

describe("key-info-dock list prefix", () => {
  test("renders list prefix only for list line content", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const dock = createKeyInfoDock(host, { onExport: () => {} });
    dock.setState({
      items: [
        item({ id: "a", text: "测试", listItem: true, listPrefix: "- " }),
        item({ id: "b", text: "段落测试", listItem: false }),
        item({ id: "c", text: "有序测试", listItem: true, listPrefix: "3. " }),
      ],
      loading: false,
      isRefreshing: false,
    });

    const texts = Array.from(host.querySelectorAll(".doc-assistant-keyinfo__text")).map((el) =>
      (el.textContent || "").trim()
    );

    expect(texts).toEqual(["- 测试", "段落测试", "3. 有序测试"]);

    dock.destroy();
    host.remove();
  });
});

