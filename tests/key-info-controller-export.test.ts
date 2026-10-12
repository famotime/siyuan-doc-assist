/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { buildDefaultDocMenuRegistration } from "@/core/doc-menu-registration-core";
import { KeyInfoController } from "@/plugin/key-info-controller";
import type { KeyInfoItem } from "@/core/key-info-core";

const { getActiveEditorMock, showMessageMock } = vi.hoisted(() => ({
  getActiveEditorMock: vi.fn(),
  showMessageMock: vi.fn(),
}));

const { getDocKeyInfoMock } = vi.hoisted(() => ({
  getDocKeyInfoMock: vi.fn(),
}));

const { getDocReadonlyStateMock } = vi.hoisted(() => ({
  getDocReadonlyStateMock: vi.fn(),
}));

vi.mock("siyuan", () => ({
  getActiveEditor: getActiveEditorMock,
  showMessage: showMessageMock,
}));

vi.mock("@/services/key-info", () => ({
  getDocKeyInfo: getDocKeyInfoMock,
}));

vi.mock("@/services/kernel", () => ({
  getDocReadonlyState: getDocReadonlyStateMock,
}));

function buildItem(id: string, text: string): KeyInfoItem {
  return {
    id,
    type: "highlight",
    text,
    raw: `==${text}==`,
    offset: 0,
    blockId: `block-${id}`,
    blockSort: 0,
    order: 0,
  };
}

describe("key-info-controller export", () => {
  let writeTextMock: ReturnType<typeof vi.fn>;
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    getDocReadonlyStateMock.mockResolvedValue(false);

    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    createObjectURLMock = vi.fn().mockReturnValue("blob:mock-url");
    revokeObjectURLMock = vi.fn();
    (window.URL as unknown as Record<string, unknown>).createObjectURL = createObjectURLMock;
    (window.URL as unknown as Record<string, unknown>).revokeObjectURL = revokeObjectURLMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("shows notice when there are no visible items to export", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const controller = new KeyInfoController({
      isMobile: () => false,
      getCurrentDocId: () => "doc-1",
      getCurrentProtyle: () => undefined,
      resolveDocId: () => "doc-1",
      runAction: vi.fn().mockResolvedValue(undefined),
      actions: () => [],
      getDocMenuRegistrationState: () => buildDefaultDocMenuRegistration([]),
      setAllDocMenuRegistration: vi.fn(),
      setSingleDocMenuRegistration: vi.fn(),
      setDocActionOrder: vi.fn(),
      resetDocActionOrder: vi.fn(),
      getDocFavoriteActionKeys: () => [],
      setDocActionFavorite: vi.fn(),
      setDocFavoriteActionOrder: vi.fn(),
    });

    controller.registerDock({
      addDock: (config: any) => {
        config.init({ element: host });
      },
    });

    getDocKeyInfoMock.mockResolvedValue({
      docTitle: "测试文档",
      items: [],
    });

    const exportBtn = host.querySelector(
      ".doc-assistant-keyinfo__footer-btn--export"
    ) as HTMLButtonElement;
    expect(exportBtn).not.toBeNull();

    await controller.refresh();
    exportBtn.click();
    await Promise.resolve();

    expect(showMessageMock).toHaveBeenCalledWith("没有可导出的关键内容", 4000, "info");
    expect(writeTextMock).not.toHaveBeenCalled();

    controller.destroy();
    host.remove();
  });

  test("downloads markdown, copies to clipboard, and shows success message", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    getDocKeyInfoMock.mockResolvedValue({
      docTitle: "测试文档",
      items: [buildItem("1", "重点一"), buildItem("2", "重点二")],
    });

    const controller = new KeyInfoController({
      isMobile: () => false,
      getCurrentDocId: () => "doc-1",
      getCurrentProtyle: () => undefined,
      resolveDocId: () => "doc-1",
      runAction: vi.fn().mockResolvedValue(undefined),
      actions: () => [],
      getDocMenuRegistrationState: () => buildDefaultDocMenuRegistration([]),
      setAllDocMenuRegistration: vi.fn(),
      setSingleDocMenuRegistration: vi.fn(),
      setDocActionOrder: vi.fn(),
      resetDocActionOrder: vi.fn(),
      getDocFavoriteActionKeys: () => [],
      setDocActionFavorite: vi.fn(),
      setDocFavoriteActionOrder: vi.fn(),
    });

    controller.registerDock({
      addDock: (config: any) => {
        config.init({ element: host });
      },
    });

    await controller.refresh();

    const exportBtn = host.querySelector(
      ".doc-assistant-keyinfo__footer-btn--export"
    ) as HTMLButtonElement;
    expect(exportBtn).not.toBeNull();

    exportBtn.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(writeTextMock).toHaveBeenCalledWith("==重点一==\n==重点二==");
    expect(showMessageMock).toHaveBeenCalledWith(
      "已导出 2 条关键内容并已复制到剪贴板",
      5000,
      "info"
    );

    controller.destroy();
    host.remove();
  });

  test("falls back to standard message when clipboard writeText fails", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    writeTextMock.mockRejectedValue(new Error("Clipboard permission denied"));

    getDocKeyInfoMock.mockResolvedValue({
      docTitle: "测试文档",
      items: [buildItem("1", "重点一")],
    });

    const controller = new KeyInfoController({
      isMobile: () => false,
      getCurrentDocId: () => "doc-1",
      getCurrentProtyle: () => undefined,
      resolveDocId: () => "doc-1",
      runAction: vi.fn().mockResolvedValue(undefined),
      actions: () => [],
      getDocMenuRegistrationState: () => buildDefaultDocMenuRegistration([]),
      setAllDocMenuRegistration: vi.fn(),
      setSingleDocMenuRegistration: vi.fn(),
      setDocActionOrder: vi.fn(),
      resetDocActionOrder: vi.fn(),
      getDocFavoriteActionKeys: () => [],
      setDocActionFavorite: vi.fn(),
      setDocFavoriteActionOrder: vi.fn(),
    });

    controller.registerDock({
      addDock: (config: any) => {
        config.init({ element: host });
      },
    });

    await controller.refresh();

    const exportBtn = host.querySelector(
      ".doc-assistant-keyinfo__footer-btn--export"
    ) as HTMLButtonElement;

    exportBtn.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(showMessageMock).toHaveBeenCalledWith(
      "已导出 1 条关键内容",
      5000,
      "info"
    );

    controller.destroy();
    host.remove();
  });
});
