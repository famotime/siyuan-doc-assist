/** @vitest-environment jsdom */

import { describe, expect, test } from "vitest";
import { createKeyInfoDock } from "@/ui/key-info-dock";
import {
  applyHeadingColorsToElement,
  refreshDockHeadingColors
} from "@/services/key-info-heading-color";

describe("key-info dock heading level rendering", () => {
  test("renders H1, H2, H3 tags and sets data-heading-level attribute on rows", () => {
    const host = document.createElement("div");
    const dock = createKeyInfoDock(host, {});

    dock.setState({
      loading: false,
      filter: ["title", "bold"],
      items: [
        {
          id: "item-h1",
          type: "title",
          headingLevel: 1,
          text: "一级标题内容",
          raw: "# 一级标题内容",
          offset: 0,
          blockSort: 0,
          order: 0
        },
        {
          id: "item-h2",
          type: "title",
          headingLevel: 2,
          text: "二级标题内容",
          raw: "## 二级标题内容",
          offset: 0,
          blockSort: 1,
          order: 1
        },
        {
          id: "item-h3",
          type: "title",
          headingLevel: 3,
          text: "三级标题内容",
          raw: "### 三级标题内容",
          offset: 0,
          blockSort: 2,
          order: 2
        },
        {
          id: "item-bold",
          type: "bold",
          text: "加粗重点内容",
          raw: "**加粗重点内容**",
          offset: 0,
          blockSort: 3,
          order: 3
        }
      ]
    });

    const rows = host.querySelectorAll<HTMLDivElement>(".doc-assistant-keyinfo__row");
    expect(rows.length).toBe(4);

    // H1
    expect(rows[0]?.dataset.type).toBe("title");
    expect(rows[0]?.dataset.headingLevel).toBe("1");
    expect(rows[0]?.querySelector(".doc-assistant-keyinfo__badge")?.textContent).toBe("H1");

    // H2
    expect(rows[1]?.dataset.type).toBe("title");
    expect(rows[1]?.dataset.headingLevel).toBe("2");
    expect(rows[1]?.querySelector(".doc-assistant-keyinfo__badge")?.textContent).toBe("H2");

    // H3
    expect(rows[2]?.dataset.type).toBe("title");
    expect(rows[2]?.dataset.headingLevel).toBe("3");
    expect(rows[2]?.querySelector(".doc-assistant-keyinfo__badge")?.textContent).toBe("H3");

    // Bold (non-title)
    expect(rows[3]?.dataset.type).toBe("bold");
    expect(rows[3]?.dataset.headingLevel).toBeUndefined();
    expect(rows[3]?.querySelector(".doc-assistant-keyinfo__badge")?.textContent).toBe("加粗");

    dock.destroy();
  });

  test("applies heading color CSS variables to target element", () => {
    const el = document.createElement("div");
    applyHeadingColorsToElement(el, {
      1: "#111111",
      2: "#222222",
      3: "#333333",
      4: "#444444",
      5: "#555555",
      6: "#666666"
    });

    expect(el.style.getPropertyValue("--da-heading-color-1")).toBe("#111111");
    expect(el.style.getPropertyValue("--da-heading-color-2")).toBe("#222222");
    expect(el.style.getPropertyValue("--da-heading-color-3")).toBe("#333333");
    expect(el.style.getPropertyValue("--da-heading-color-4")).toBe("#444444");
    expect(el.style.getPropertyValue("--da-heading-color-5")).toBe("#555555");
    expect(el.style.getPropertyValue("--da-heading-color-6")).toBe("#666666");
  });

  test("refreshes heading colors on dock root automatically", () => {
    const host = document.createElement("div");
    const colors = refreshDockHeadingColors(host);

    expect(colors[1]).toBeTruthy();
    expect(colors[2]).toBeTruthy();
    expect(host.style.getPropertyValue("--da-heading-color-1")).toBeTruthy();
    expect(host.style.getPropertyValue("--da-heading-color-2")).toBeTruthy();
  });
});
