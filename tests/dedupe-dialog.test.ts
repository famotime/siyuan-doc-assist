/** @vitest-environment jsdom */
import { beforeEach, describe, expect, test, vi } from "vitest";

const { DialogClass, confirmMock, showMessageMock } = vi.hoisted(() => ({
  DialogClass: class MockDialog {
    public element: HTMLDivElement;
    public destroy = vi.fn();

    constructor(options: { content: string }) {
      this.element = document.createElement("div");
      this.element.innerHTML = options.content;
    }
  },
  confirmMock: vi.fn(),
  showMessageMock: vi.fn(),
}));

vi.mock("siyuan", () => ({
  Dialog: DialogClass,
  confirm: confirmMock,
  showMessage: showMessageMock,
}));

import { openDedupeDialog } from "@/ui/dialogs";

function createDialog() {
  return openDedupeDialog({
    candidates: [
      {
        groupId: "group-1",
        score: 0.95,
        docs: [
          { id: "doc-oldest", title: "A", updated: "20250101101010", hPath: "/A" },
          { id: "doc-middle", title: "A", updated: "20260101101010", hPath: "/A-2" },
          { id: "doc-latest", title: "A", updated: "20260201101010", hPath: "/A-3" },
        ],
      },
    ],
    onDelete: vi.fn().mockResolvedValue({ successIds: [], failed: [] }),
    onInsertLinks: vi.fn(),
    onOpenAll: vi.fn(),
  });
}

describe("openDedupeDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("keeps latest updated doc unchecked by default", () => {
    const dialog = createDialog();
    const root = (dialog as any).element as HTMLDivElement;

    const oldest = root.querySelector<HTMLInputElement>('input[data-id="doc-oldest"]');
    const middle = root.querySelector<HTMLInputElement>('input[data-id="doc-middle"]');
    const latest = root.querySelector<HTMLInputElement>('input[data-id="doc-latest"]');

    expect(oldest?.checked).toBe(true);
    expect(middle?.checked).toBe(true);
    expect(latest?.checked).toBe(false);
    expect(root.textContent).toContain("保留最后更新");
  });

  test("supports switching to keep earliest updated doc", () => {
    const dialog = createDialog();
    const root = (dialog as any).element as HTMLDivElement;

    const keepEarliestSwitch = root.querySelector<HTMLInputElement>(
      'input[data-role="keep-earliest-switch"]'
    );
    expect(keepEarliestSwitch).toBeTruthy();

    keepEarliestSwitch!.checked = true;
    keepEarliestSwitch!.dispatchEvent(new Event("change", { bubbles: true }));

    const oldest = root.querySelector<HTMLInputElement>('input[data-id="doc-oldest"]');
    const middle = root.querySelector<HTMLInputElement>('input[data-id="doc-middle"]');
    const latest = root.querySelector<HTMLInputElement>('input[data-id="doc-latest"]');

    expect(oldest?.checked).toBe(false);
    expect(middle?.checked).toBe(true);
    expect(latest?.checked).toBe(true);
    expect(root.textContent).toContain("保留最早更新");
  });
});
