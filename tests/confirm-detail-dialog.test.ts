// @vitest-environment jsdom
import { describe, expect, vi, test } from "vitest";

const dialogState = vi.hoisted(() => {
  class MockDialog {
    static instances: MockDialog[] = [];

    element: HTMLElement;
    destroyCallback?: () => void;

    constructor(options: { destroyCallback?: () => void }) {
      this.destroyCallback = options.destroyCallback;
      this.element = document.createElement("div");
      const root = document.createElement("div");
      root.className = "doc-assistant-confirm-detail";
      this.element.appendChild(root);
      MockDialog.instances.push(this);
    }

    destroy(): void {
      this.destroyCallback?.();
    }
  }
  return { MockDialog };
});

const siyuanMocks = vi.hoisted(() => ({
  confirm: vi.fn()
}));

vi.mock("siyuan", () => ({
  confirm: siyuanMocks.confirm,
  Dialog: dialogState.MockDialog
}));

function lastDialog() {
  const instances = dialogState.MockDialog.instances;
  return instances[instances.length - 1];
}

function dialogButtons(root: Element): [HTMLButtonElement, HTMLButtonElement] {
  const buttons = root.querySelectorAll("button");
  // The dialog appends cancel first, confirm second.
  return [buttons[0] as HTMLButtonElement, buttons[1] as HTMLButtonElement];
}

describe("askConfirmWithDetail dialog lifecycle", () => {
  test("destroying the dialog via ESC/X resolves false instead of hanging", async () => {
    const { askConfirmWithDetail } = await import("@/ui/confirm-detail-dialog");

    const promise = askConfirmWithDetail("标题", "正文", [{ label: "项目一" }]);
    const dialog = lastDialog();
    const root = dialog.element.querySelector(".doc-assistant-confirm-detail")!;
    expect(dialogButtons(root).length).toBe(2);

    // SiYuan Dialog: ESC and the title-bar X call destroy() directly.
    dialog.destroy();

    await expect(promise).resolves.toBe(false);
  });

  test("confirm button settles true and a later destroy cannot flip it", async () => {
    const { askConfirmWithDetail } = await import("@/ui/confirm-detail-dialog");

    const promise = askConfirmWithDetail("标题", "正文", [{ label: "可选项", selectable: true }]);
    const dialog = lastDialog();
    const root = dialog.element.querySelector(".doc-assistant-confirm-detail")!;
    const [, confirmBtn] = dialogButtons(root);

    confirmBtn.click();
    dialog.destroy();

    await expect(promise).resolves.toBe(true);
  });

  test("cancel button resolves false", async () => {
    const { askConfirmWithDetail } = await import("@/ui/confirm-detail-dialog");

    const promise = askConfirmWithDetail("标题", "正文", [{ label: "项目一" }]);
    const dialog = lastDialog();
    const root = dialog.element.querySelector(".doc-assistant-confirm-detail")!;
    const [cancelBtn] = dialogButtons(root);

    cancelBtn.click();
    dialog.destroy();

    await expect(promise).resolves.toBe(false);
  });

  test("simple confirm delegates to siyuan confirm and resolves its answer", async () => {
    const { askConfirmWithDetail } = await import("@/ui/confirm-detail-dialog");

    let onConfirm: (() => void) | undefined;
    siyuanMocks.confirm.mockImplementationOnce(
      (_title: string, _text: string, confirmCb?: () => void) => {
        onConfirm = confirmCb;
      }
    );

    const promise = askConfirmWithDetail("标题", "正文");
    onConfirm?.();

    await expect(promise).resolves.toBe(true);
  });
});
