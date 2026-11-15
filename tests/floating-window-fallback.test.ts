// @vitest-environment jsdom
import { beforeEach, describe, expect, vi, test } from "vitest";
import { openInAppFloatingFallback } from "@/services/floating-text/floating-window-fallback";

type DialogOptions = {
  title: string;
  content: string;
  width: string;
  height: string;
  transparent?: boolean;
};

const dialogInstances: Array<{
  options: DialogOptions;
  element: HTMLElement | null;
}> = [];

vi.mock("siyuan", () => {
  class Dialog {
    public options: DialogOptions;
    public element: HTMLElement | null;
    public destroy: () => void;
    constructor(options: DialogOptions) {
      this.options = options;
      const root = document.createElement("div");
      root.className = "b3-dialog";
      root.innerHTML = `<div class="b3-dialog__container"><div class="b3-dialog__body">${options.content}</div></div>`;
      document.body.appendChild(root);
      this.element = root;
      // 模拟真实 Dialog.destroy：从 DOM 移除元素
      this.destroy = () => {
        root.remove();
      };
      dialogInstances.push(this);
    }
  }
  return { Dialog, showMessage: vi.fn() };
});

const defaultConfig = {
  width: 420,
  height: 320,
  fontSize: 15,
  opacity: 88,
  viewMode: "text",
  themeMode: "auto",
  autoPasteOnSelect: false,
  rememberSize: false
} as any;

function expectDialogClosed(): void {
  expect(document.querySelector(".b3-dialog")).toBeNull();
}

beforeEach(() => {
  dialogInstances.length = 0;
  document.body.innerHTML = "";
});

describe("openInAppFloatingFallback", () => {
  test("creates a transparent SiYuan dialog with cleaned container styles", () => {
    openInAppFloatingFallback("标题", "正文内容", defaultConfig, true);

    expect(dialogInstances).toHaveLength(1);
    const dialog = dialogInstances[0];
    expect(dialog.options.transparent).toBe(true);
    expect(dialog.options.width).toBe("420px");
    expect(dialog.options.height).toBe("320px");
    expect(dialog.options.title).toBe("");
    expect(dialog.options.content).toContain("doc-assistant-floating-dialog-wrapper");
    expect(dialog.options.content).toContain("ft-btn-close");

    const container = dialog.element!.querySelector(".b3-dialog__container") as HTMLElement;
    expect(container.style.background).toBe("transparent");
    expect(container.style.boxShadow).toBe("none");
    const body = container.querySelector(".b3-dialog__body") as HTMLElement;
    expect(body.style.padding).toBe("0px");
    expect(body.style.height).toBe("100%");
  });

  test("forces markdown view mode when content contains images", () => {
    openInAppFloatingFallback("标题", "![图片](https://example.com/a.png)", defaultConfig, false);
    expect(dialogInstances[0].options.content).toContain("ft-markdown-view");
  });

  test("closes the dialog via the inner close button", () => {
    openInAppFloatingFallback("标题", "正文", defaultConfig, false);

    const innerClose = document.querySelector("#ft-btn-close");
    expect(innerClose).not.toBeNull();
    innerClose!.dispatchEvent(new Event("click"));
    expectDialogClosed();
  });

  test("closes the dialog on Escape keydown", () => {
    openInAppFloatingFallback("标题", "正文", defaultConfig, false);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expectDialogClosed();
  });

  test("responds to the floating close custom event once and ignores repeated cleanup", () => {
    openInAppFloatingFallback("标题", "正文", defaultConfig, false);

    document.dispatchEvent(new Event("doc-assistant-floating-close"));
    expectDialogClosed();

    // 重复派发不应抛错（cleanup 幂等）
    expect(() =>
      document.dispatchEvent(new Event("doc-assistant-floating-close"))
    ).not.toThrow();
  });
});
