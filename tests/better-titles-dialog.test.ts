/** @vitest-environment jsdom */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { openBetterTitlesDialog } from "@/ui/better-titles-dialog";

const { DialogClass, showMessageMock } = vi.hoisted(() => ({
  DialogClass: class MockDialog {
    public element: HTMLDivElement;
    public destroy = vi.fn();

    constructor(options: { content: string }) {
      this.element = document.createElement("div");
      this.element.innerHTML = options.content;
    }
  },
  showMessageMock: vi.fn()
}));

vi.mock("siyuan", () => ({
  Dialog: DialogClass,
  showMessage: showMessageMock
}));

describe("openBetterTitlesDialog concurrency guard (SM-10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("disables all replace and regenerate buttons while replacing a title", async () => {
    let releaseReplace!: () => void;
    const onReplace = vi.fn(
      () => new Promise<void>((resolve) => {
        releaseReplace = resolve;
      })
    );
    const onRegenerate = vi.fn();

    const controller = openBetterTitlesDialog({
      originalTitle: "原标题",
      initialResult: {
        catchy: ["标题A", "标题B"],
        summary: ["平实标题"]
      },
      onReplace,
      onRegenerate
    });

    const root = controller.dialog.element;
    const replaceBtns = Array.from(
      root.querySelectorAll<HTMLButtonElement>(".doc-assistant-better-titles__replace-btn")
    );
    const regenBtn = root.querySelector<HTMLButtonElement>(".doc-assistant-better-titles__regen-btn")!;

    replaceBtns[0].click();

    expect(onReplace).toHaveBeenCalledTimes(1);
    expect(replaceBtns.every((btn) => btn.disabled)).toBe(true);
    expect(regenBtn.disabled).toBe(true);

    replaceBtns[1].click();
    regenBtn.click();
    expect(onReplace).toHaveBeenCalledTimes(1);
    expect(onRegenerate).not.toHaveBeenCalled();

    releaseReplace();
    await vi.waitFor(() => expect(controller.dialog.destroy).toHaveBeenCalledTimes(1));
  });

  test("setLoading(true) locks replace buttons as well", () => {
    const controller = openBetterTitlesDialog({
      originalTitle: "原标题",
      initialResult: { catchy: ["标题A"], summary: ["标题B"] },
      onReplace: vi.fn(),
      onRegenerate: vi.fn()
    });

    controller.setLoading(true);
    const replaceBtns = Array.from(
      controller.dialog.element.querySelectorAll<HTMLButtonElement>(".doc-assistant-better-titles__replace-btn")
    );
    expect(replaceBtns.every((btn) => btn.disabled)).toBe(true);

    controller.setLoading(false);
    expect(replaceBtns.every((btn) => !btn.disabled)).toBe(true);
  });
});
