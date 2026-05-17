// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";

const { dialogInstances, confirmMock, MockDialog } = vi.hoisted(() => {
  const dialogInstances: HTMLElement[] = [];
  class MockDialog {
    element: HTMLElement;
    constructor(options: { content?: string }) {
      this.element = document.createElement("div");
      this.element.innerHTML = options.content || "";
      dialogInstances.push(this.element);
    }
    destroy() {}
  }

  return {
    dialogInstances,
    confirmMock: vi.fn(),
    MockDialog,
  };
});

vi.mock("siyuan", async () => {
  const actual = await vi.importActual<any>("siyuan");
  return {
    ...actual,
    Dialog: MockDialog,
    confirm: confirmMock,
  };
});

import DocAssistPlugin from "@/plugin/plugin-lifecycle";

describe("plugin confirm detail dialog", () => {
  test("renders detail list behind an open-detail button label", async () => {
    const plugin = new DocAssistPlugin({} as any);
    const promise = (plugin as any).askConfirm("确认标记口水内容", "AI 判定可标记 2 段。", [
      { label: "栏目说明：以下内容整理自公开资料，仅供快速浏览。" },
      { label: "关注公众号“示例”，回复关键词领取资料。" },
    ]);

    const dialogElement = dialogInstances[0];
    expect(dialogElement?.textContent || "").toContain("打开详情（2 项）");
    expect(dialogElement?.textContent || "").toContain("栏目说明：以下内容整理自公开资料，仅供快速浏览。");
    expect(dialogElement?.textContent || "").toContain("关注公众号“示例”，回复关键词领取资料。");

    dialogElement?.querySelector<HTMLButtonElement>(".doc-assistant-confirm-detail__actions .b3-button--outline")?.click();
    await expect(promise).resolves.toBe(false);
  });
});
