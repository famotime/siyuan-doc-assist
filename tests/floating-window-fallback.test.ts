// @vitest-environment jsdom
import { beforeEach, describe, expect, vi, test } from "vitest";
import {
  closeActiveFallbackFloatingDialogs,
  openInAppFloatingFallback
} from "@/services/floating-text/floating-window-fallback";

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

  test("does not close on Escape and does not swallow it (Esc handled by SiYuan natively)", () => {
    openInAppFloatingFallback("标题", "正文", defaultConfig, false);

    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    document.dispatchEvent(event);
    // 插件不再自实现 Esc 关闭：思源全局 keydown 按「一次 Esc 关栈顶一个 Dialog」处理，
    // 插件侧只保证不吞事件、不叠加关闭
    expect(document.querySelectorAll(".b3-dialog")).toHaveLength(1);
    expect(event.defaultPrevented).toBe(false);
  });

  test("coexisting fallback dialogs are not closed by our own Esc handling (audit low-risk)", () => {
    openInAppFloatingFallback("旧窗", "正文", defaultConfig, false);
    openInAppFloatingFallback("新窗", "正文", defaultConfig, false);
    expect(dialogInstances).toHaveLength(2);

    const first = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    document.dispatchEvent(first);
    const second = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    document.dispatchEvent(second);

    // 两个窗都保留：真正的「一次 Esc 关一个」由思源全局 keydown 完成
    expect(document.querySelectorAll(".b3-dialog")).toHaveLength(2);
    expect(first.defaultPrevented).toBe(false);
    expect(second.defaultPrevented).toBe(false);
  });

  test("inner close button closes only its own dialog", () => {
    openInAppFloatingFallback("旧窗", "正文", defaultConfig, false);
    openInAppFloatingFallback("新窗", "正文", defaultConfig, false);

    // jsdom 怪癖：querySelector("#id") 对文档级重复 id 走全局 id-map 快路径，
    // 只有第一个（旧窗）的关闭按钮会被 fallback 代码实际绑定（真实浏览器无此问题）。
    const oldestDialogClose = document.querySelector("#ft-btn-close");
    expect(oldestDialogClose).not.toBeNull();
    oldestDialogClose!.dispatchEvent(new Event("click"));
    // 只关旧窗，新窗不受影响
    expect(document.querySelectorAll(".b3-dialog")).toHaveLength(1);
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

  test("closeActiveFallbackFloatingDialogs closes all open fallback dialogs on teardown", () => {
    openInAppFloatingFallback("窗1", "正文1", defaultConfig, false);
    openInAppFloatingFallback("窗2", "正文2", defaultConfig, false);
    expect(document.querySelectorAll(".b3-dialog")).toHaveLength(2);

    closeActiveFallbackFloatingDialogs();
    expectDialogClosed();
  });
});
