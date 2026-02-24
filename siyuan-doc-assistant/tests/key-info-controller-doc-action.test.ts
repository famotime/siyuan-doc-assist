/** @vitest-environment jsdom */

import { describe, expect, test, vi } from "vitest";
import { buildDefaultDocMenuRegistration } from "@/core/doc-menu-registration-core";
import { ActionConfig } from "@/plugin/actions";
import { KeyInfoController } from "@/plugin/key-info-controller";

const { getActiveEditorMock, showMessageMock } = vi.hoisted(() => ({
  getActiveEditorMock: vi.fn(),
  showMessageMock: vi.fn(),
}));

vi.mock("siyuan", () => ({
  getActiveEditor: getActiveEditorMock,
  showMessage: showMessageMock,
}));

vi.mock("@/services/key-info", () => ({
  getDocKeyInfo: vi.fn().mockResolvedValue({
    docTitle: "Doc 1",
    items: [],
  }),
}));

describe("key-info-controller doc actions", () => {
  test("passes current doc context to runAction when clicking dock doc action button", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const runAction = vi.fn().mockResolvedValue(undefined);
    const action: ActionConfig = {
      key: "bold-selected-blocks",
      commandText: "选中块全部加粗",
      menuText: "选中块全部加粗",
      group: "edit",
      icon: "iconBold",
    };
    const protyle = {
      block: { id: "block-1", rootID: "doc-1" },
      wysiwyg: { element: document.createElement("div") },
    };
    const controller = new KeyInfoController({
      isMobile: () => false,
      getCurrentDocId: () => "doc-1",
      getCurrentProtyle: () => protyle as any,
      resolveDocId: (explicitId?: string) => explicitId || "doc-1",
      runAction,
      actions: () => [action],
      getDocMenuRegistrationState: () => buildDefaultDocMenuRegistration([action]),
      setAllDocMenuRegistration: () => {},
      setSingleDocMenuRegistration: () => {},
      setDocActionOrder: () => {},
    });

    let dockConfig: any;
    controller.registerDock({
      addDock: (config: unknown) => {
        dockConfig = config;
      },
    });
    dockConfig.init({ element: host });

    const button = host.querySelector(".doc-assistant-keyinfo__action-btn") as HTMLButtonElement | null;
    expect(button).toBeTruthy();

    button!.click();

    expect(runAction).toHaveBeenCalledTimes(1);
    expect(runAction).toHaveBeenCalledWith("bold-selected-blocks", "doc-1", protyle);

    await Promise.resolve();

    controller.destroy();
    host.remove();
  });
});
