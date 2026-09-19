// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openLinkToDocDialog } from "@/ui/link-to-doc-dialog";
import { showMessage } from "siyuan";

vi.mock("siyuan", () => {
  class MockDialog {
    element: HTMLElement;
    destroy = vi.fn();
    constructor(options: { content: string }) {
      this.element = document.createElement("div");
      this.element.innerHTML = options.content;
    }
  }
  return {
    Dialog: MockDialog,
    showMessage: vi.fn(),
  };
});

describe("link-to-doc-dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockItems = [
    {
      url: "https://example.com/1",
      originalUrl: "https://example.com/1",
      title: "网页一",
      hasFetchedTitle: true,
    },
    {
      url: "https://example.com/2",
      originalUrl: "https://example.com/2",
      title: "网页二",
      hasFetchedTitle: true,
    },
    {
      url: "https://example.com/3",
      originalUrl: "https://example.com/3",
      title: "网页三",
      hasFetchedTitle: false,
    },
  ];

  it("renders candidates with all checked by default", () => {
    const confirmSpy = vi.fn();
    const dialog = openLinkToDocDialog({
      items: mockItems,
      onConfirm: confirmSpy,
    });

    const root = dialog.element;
    const checkboxes = root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checkboxes.length).toBe(3);
    checkboxes.forEach((cb) => {
      expect(cb.checked).toBe(true);
    });

    const countEl = root.querySelector(".link-to-doc-dialog__count");
    expect(countEl?.textContent).toContain("共检测到 3 个网页链接，已勾选 3 项");
  });

  it("handles clear all and select all buttons", () => {
    const confirmSpy = vi.fn();
    const dialog = openLinkToDocDialog({
      items: mockItems,
      onConfirm: confirmSpy,
    });

    const root = dialog.element;
    const clearBtn = Array.from(root.querySelectorAll("button")).find(
      (b) => b.textContent === "清空"
    );
    const selectAllBtn = Array.from(root.querySelectorAll("button")).find(
      (b) => b.textContent === "全选"
    );

    // 点击清空
    clearBtn?.click();
    let checkboxes = root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    checkboxes.forEach((cb) => {
      expect(cb.checked).toBe(false);
    });
    let countEl = root.querySelector(".link-to-doc-dialog__count");
    expect(countEl?.textContent).toContain("已勾选 0 项");

    // 点击全选
    selectAllBtn?.click();
    checkboxes = root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    checkboxes.forEach((cb) => {
      expect(cb.checked).toBe(true);
    });
    countEl = root.querySelector(".link-to-doc-dialog__count");
    expect(countEl?.textContent).toContain("已勾选 3 项");
  });

  it("confirms selected items when confirm button clicked", async () => {
    const confirmSpy = vi.fn();
    const dialog = openLinkToDocDialog({
      items: mockItems,
      onConfirm: confirmSpy,
    });

    const root = dialog.element;
    const checkboxes = root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    // 取消第2项的勾选
    checkboxes[1].checked = false;
    checkboxes[1].dispatchEvent(new Event("change"));

    const confirmBtn = Array.from(root.querySelectorAll("button")).find(
      (b) => b.textContent === "确定剪藏"
    );
    await confirmBtn?.click();

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith([mockItems[0], mockItems[2]]);
    expect(dialog.destroy).toHaveBeenCalled();
  });

  it("prevents confirm if no items are selected", async () => {
    const confirmSpy = vi.fn();
    const dialog = openLinkToDocDialog({
      items: mockItems,
      onConfirm: confirmSpy,
    });

    const root = dialog.element;
    const clearBtn = Array.from(root.querySelectorAll("button")).find(
      (b) => b.textContent === "清空"
    );
    clearBtn?.click();

    const confirmBtn = Array.from(root.querySelectorAll("button")).find(
      (b) => b.textContent === "确定剪藏"
    );
    await confirmBtn?.click();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(showMessage).toHaveBeenCalledWith("请至少勾选一个要剪藏的链接", 4000, "info");
  });
});
