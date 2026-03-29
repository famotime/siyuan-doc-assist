/** @vitest-environment jsdom */

import { describe, expect, test, vi } from "vitest";
import { createKeyInfoDock } from "@/ui/key-info-dock";
import type { KeyInfoItem, KeyInfoType } from "@/core/key-info-core";

function buildItem(id: string, type: KeyInfoType = "bold"): KeyInfoItem {
  return {
    id,
    type,
    text: `text-${id}`,
    raw: `text-${id}`,
    offset: 0,
    blockId: `block-${id}`,
    blockSort: 0,
    order: 0,
  };
}

describe("key-info-dock controls", () => {
  test("invokes footer refresh and export callbacks", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const onRefresh = vi.fn();
    const onExport = vi.fn();

    const dock = createKeyInfoDock(host, { onRefresh, onExport });

    const refreshBtn = host.querySelector(
      ".doc-assistant-keyinfo__footer-btn--refresh"
    ) as HTMLButtonElement | null;
    const exportBtn = host.querySelector(
      ".doc-assistant-keyinfo__footer-btn--export"
    ) as HTMLButtonElement | null;

    expect(refreshBtn).not.toBeNull();
    expect(exportBtn).not.toBeNull();

    refreshBtn?.click();
    exportBtn?.click();

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledTimes(1);

    dock.destroy();
    host.remove();
  });

  test("updates tab and filter active state from dock state and user clicks", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const dock = createKeyInfoDock(host, { onExport: () => {} });
    dock.setState({
      items: [buildItem("1", "bold"), buildItem("2", "title")],
      filter: ["bold"],
    });

    const keyInfoTab = host.querySelector(
      '.doc-assistant-keyinfo__tab[data-tab="key-info"]'
    ) as HTMLButtonElement | null;
    const docProcessTab = host.querySelector(
      '.doc-assistant-keyinfo__tab[data-tab="doc-process"]'
    ) as HTMLButtonElement | null;
    const boldFilter = host.querySelector(
      '.doc-assistant-keyinfo__filter[data-type="bold"]'
    ) as HTMLButtonElement | null;
    const titleFilter = host.querySelector(
      '.doc-assistant-keyinfo__filter[data-type="title"]'
    ) as HTMLButtonElement | null;
    const allFilter = host.querySelector(
      '.doc-assistant-keyinfo__filter[data-type="all"]'
    ) as HTMLButtonElement | null;

    expect(keyInfoTab?.classList.contains("is-active")).toBe(true);
    expect(docProcessTab?.classList.contains("is-active")).toBe(false);
    expect(boldFilter?.classList.contains("is-active")).toBe(true);
    expect(titleFilter?.classList.contains("is-active")).toBe(false);
    expect(allFilter?.classList.contains("is-active")).toBe(false);

    docProcessTab?.click();
    expect(docProcessTab?.classList.contains("is-active")).toBe(true);
    expect(keyInfoTab?.classList.contains("is-active")).toBe(false);

    titleFilter?.click();
    expect(titleFilter?.classList.contains("is-active")).toBe(true);
    expect(allFilter?.classList.contains("is-active")).toBe(false);

    allFilter?.click();
    expect(allFilter?.classList.contains("is-active")).toBe(true);
    expect(boldFilter?.classList.contains("is-active")).toBe(true);
    expect(titleFilter?.classList.contains("is-active")).toBe(true);

    dock.destroy();
    host.remove();
  });

  test("toggles collapsed filters via more button and preserves hidden active filters", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const dock = createKeyInfoDock(host, { onExport: () => {} });
    dock.setState({
      items: [
        buildItem("1", "bold"),
        buildItem("2", "tag"),
        buildItem("3", "link"),
        buildItem("4", "ref"),
      ],
      filter: ["tag", "link"],
    });

    const moreFilter = host.querySelector(
      ".doc-assistant-keyinfo__filter-toggle"
    ) as HTMLButtonElement | null;
    const tagFilter = host.querySelector(
      '.doc-assistant-keyinfo__filter[data-type="tag"]'
    ) as HTMLButtonElement | null;
    const linkFilter = host.querySelector(
      '.doc-assistant-keyinfo__filter[data-type="link"]'
    ) as HTMLButtonElement | null;
    const refFilter = host.querySelector(
      '.doc-assistant-keyinfo__filter[data-type="ref"]'
    ) as HTMLButtonElement | null;

    const rowTypes = () =>
      Array.from(host.querySelectorAll(".doc-assistant-keyinfo__row")).map(
        (row) => (row as HTMLDivElement).dataset.type
      );
    const filterOrder = () =>
      Array.from(host.querySelectorAll(".doc-assistant-keyinfo__filters > button")).map(
        (button) => {
          const element = button as HTMLButtonElement;
          return element.dataset.type || element.dataset.role || "";
        }
      );

    expect(moreFilter).not.toBeNull();
    expect(moreFilter?.getAttribute("aria-expanded")).toBe("false");
    expect(moreFilter?.classList.contains("is-active")).toBe(false);
    expect(moreFilter?.textContent?.replace(/\s+/g, "")).toBe("多更多");
    expect(filterOrder()).toEqual([
      "all",
      "title",
      "bold",
      "highlight",
      "remark",
      "italic",
      "underline",
      "more",
      "code",
      "link",
      "ref",
      "tag",
    ]);
    expect(tagFilter?.classList.contains("is-collapsed-filter")).toBe(true);
    expect(linkFilter?.classList.contains("is-collapsed-filter")).toBe(true);
    expect(refFilter?.classList.contains("is-collapsed-filter")).toBe(true);
    expect(tagFilter?.hidden).toBe(true);
    expect(linkFilter?.hidden).toBe(true);
    expect(refFilter?.hidden).toBe(true);
    expect(rowTypes()).toEqual(["tag", "link"]);

    moreFilter?.click();

    expect(moreFilter?.getAttribute("aria-expanded")).toBe("true");
    expect(moreFilter?.classList.contains("is-active")).toBe(true);
    expect(tagFilter?.classList.contains("is-collapsed-filter")).toBe(false);
    expect(linkFilter?.classList.contains("is-collapsed-filter")).toBe(false);
    expect(refFilter?.classList.contains("is-collapsed-filter")).toBe(false);
    expect(tagFilter?.hidden).toBe(false);
    expect(linkFilter?.hidden).toBe(false);
    expect(refFilter?.hidden).toBe(false);
    expect(tagFilter?.classList.contains("is-active")).toBe(true);
    expect(linkFilter?.classList.contains("is-active")).toBe(true);
    expect(refFilter?.classList.contains("is-active")).toBe(false);

    moreFilter?.click();

    expect(moreFilter?.getAttribute("aria-expanded")).toBe("false");
    expect(moreFilter?.classList.contains("is-active")).toBe(false);
    expect(tagFilter?.hidden).toBe(true);
    expect(linkFilter?.hidden).toBe(true);
    expect(refFilter?.hidden).toBe(true);
    expect(rowTypes()).toEqual(["tag", "link"]);

    moreFilter?.click();
    const allFilter = host.querySelector(
      '.doc-assistant-keyinfo__filter[data-type="all"]'
    ) as HTMLButtonElement | null;

    allFilter?.click();

    expect(tagFilter?.classList.contains("is-active")).toBe(true);
    expect(linkFilter?.classList.contains("is-active")).toBe(true);
    expect(refFilter?.classList.contains("is-active")).toBe(true);

    dock.destroy();
    host.remove();
  });

  test("shows loading spinner and blocks key info actions while loading a new document", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const onRefresh = vi.fn();
    const onExport = vi.fn();
    const onItemClick = vi.fn();
    const dock = createKeyInfoDock(host, { onRefresh, onExport, onItemClick });

    dock.setState({
      items: [buildItem("1", "bold"), buildItem("2", "title")],
      loading: false,
      isRefreshing: false,
      scrollContextKey: "doc-a",
    });

    const row = host.querySelector(".doc-assistant-keyinfo__row") as HTMLDivElement | null;
    const refreshBtn = host.querySelector(
      ".doc-assistant-keyinfo__footer-btn--refresh"
    ) as HTMLButtonElement | null;
    const exportBtn = host.querySelector(
      ".doc-assistant-keyinfo__footer-btn--export"
    ) as HTMLButtonElement | null;
    const boldFilter = host.querySelector(
      '.doc-assistant-keyinfo__filter[data-type="bold"]'
    ) as HTMLButtonElement | null;

    expect(row).toBeTruthy();
    expect(refreshBtn?.disabled).toBe(false);
    expect(exportBtn?.disabled).toBe(false);
    expect(boldFilter?.disabled).toBe(false);

    row!.click();
    refreshBtn!.click();
    exportBtn!.click();

    expect(onItemClick).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledTimes(1);

    dock.setState({
      loading: true,
      isRefreshing: true,
      scrollContextKey: "doc-b",
    });

    const loadingOverlay = host.querySelector(
      ".doc-assistant-keyinfo__loading-overlay"
    ) as HTMLDivElement | null;
    const loadingSpinner = host.querySelector(
      ".doc-assistant-keyinfo__loading-spinner"
    ) as HTMLSpanElement | null;
    const loadingRow = host.querySelector(".doc-assistant-keyinfo__row") as HTMLDivElement | null;

    expect(loadingOverlay?.classList.contains("is-visible")).toBe(true);
    expect(loadingSpinner).toBeTruthy();
    expect(refreshBtn?.disabled).toBe(true);
    expect(exportBtn?.disabled).toBe(true);
    expect(boldFilter?.disabled).toBe(true);
    expect(loadingRow?.classList.contains("is-clickable")).toBe(false);
    expect(loadingRow?.tabIndex).toBe(-1);

    loadingRow?.click();
    refreshBtn?.click();
    exportBtn?.click();

    expect(onItemClick).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledTimes(1);

    dock.setState({
      loading: false,
      isRefreshing: false,
      scrollContextKey: "doc-b",
    });

    expect(loadingOverlay?.classList.contains("is-visible")).toBe(false);
    expect(refreshBtn?.disabled).toBe(false);
    expect(exportBtn?.disabled).toBe(false);
    expect(boldFilter?.disabled).toBe(false);

    dock.destroy();
    host.remove();
  });

  test("does not render doc menu registration switches in dock doc-process tab", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const dock = createKeyInfoDock(host, { onExport: () => {} });
    dock.setState({
      activeTab: "doc-process",
      docActions: [
        {
          key: "insert-backlinks",
          label: "插入反链文档列表（去重）",
          icon: "iconList",
          group: "insert",
          groupLabel: "插入",
          disabled: false,
          menuRegistered: false,
          menuToggleDisabled: false,
        },
      ],
    });

    expect(host.querySelector(".doc-assistant-keyinfo__action-switch")).toBeNull();
    expect(host.querySelector(".doc-assistant-keyinfo__menu-toggle-input")).toBeNull();
    expect(host.querySelector(".doc-assistant-keyinfo__menu-toggle-row")).toBeNull();

    dock.destroy();
    host.remove();
  });
});
