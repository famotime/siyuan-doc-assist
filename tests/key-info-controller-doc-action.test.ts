/** @vitest-environment jsdom */

import { beforeEach, describe, expect, test, vi } from "vitest";
import { buildDefaultDocMenuRegistration } from "@/core/doc-menu-registration-core";
import { ActionConfig } from "@/plugin/actions";
import { KeyInfoController } from "@/plugin/key-info-controller";

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

describe("key-info-controller doc actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDocReadonlyStateMock.mockResolvedValue(false);
  });

  test("does not reject when refresh fails after dock is destroyed", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    getDocKeyInfoMock.mockResolvedValueOnce({
      docTitle: "Doc 1",
      items: [],
    });

    let rejectRefresh!: (reason?: unknown) => void;
    const pendingRefresh = new Promise<never>((_, reject) => {
      rejectRefresh = reject;
    });
    getDocKeyInfoMock.mockReturnValueOnce(pendingRefresh);

    const controller = new KeyInfoController({
      isMobile: () => false,
      getCurrentDocId: () => "doc-1",
      getCurrentProtyle: () => undefined,
      resolveDocId: (explicitId?: string) => explicitId || "doc-1",
      runAction: vi.fn().mockResolvedValue(undefined),
      actions: () => [],
      getDocMenuRegistrationState: () => ({}),
      setAllDocMenuRegistration: () => {},
      setSingleDocMenuRegistration: () => {},
      setDocActionOrder: () => {},
      resetDocActionOrder: () => {},
      getDocFavoriteActionKeys: () => [],
      setDocActionFavorite: () => {},
      setDocFavoriteActionOrder: () => {},
    } as any);

    let dockConfig: any;
    controller.registerDock({
      addDock: (config: unknown) => {
        dockConfig = config;
      },
    });
    dockConfig.init({ element: host });
    await Promise.resolve();
    await Promise.resolve();

    const refreshPromise = controller.refresh();
    controller.destroy();
    rejectRefresh(new Error("boom"));

    await expect(refreshPromise).resolves.toBeUndefined();

    host.remove();
  });

  test("restores persisted key info filter and reports later filter changes", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    getDocKeyInfoMock.mockResolvedValue({
      docTitle: "Doc 1",
      items: [
        {
          id: "item-bold",
          type: "bold",
          text: "Bold content",
          raw: "**Bold content**",
          blockId: "block-bold",
          blockSort: 0,
          order: 0,
        },
        {
          id: "item-title",
          type: "title",
          text: "Title content",
          raw: "# Title content",
          blockId: "block-title",
          blockSort: 1,
          order: 1,
        },
      ],
    });

    const setKeyInfoFilter = vi.fn();
    const controller = new KeyInfoController({
      isMobile: () => false,
      getCurrentDocId: () => "doc-1",
      getCurrentProtyle: () => undefined,
      resolveDocId: (explicitId?: string) => explicitId || "doc-1",
      runAction: vi.fn().mockResolvedValue(undefined),
      actions: () => [],
      getDocMenuRegistrationState: () => ({}),
      setAllDocMenuRegistration: () => {},
      setSingleDocMenuRegistration: () => {},
      setDocActionOrder: () => {},
      resetDocActionOrder: () => {},
      getDocFavoriteActionKeys: () => [],
      setDocActionFavorite: () => {},
      setDocFavoriteActionOrder: () => {},
      getKeyInfoFilter: () => ["bold"],
      setKeyInfoFilter,
    } as any);

    let dockConfig: any;
    controller.registerDock({
      addDock: (config: unknown) => {
        dockConfig = config;
      },
    });
    dockConfig.init({ element: host });
    await Promise.resolve();
    await Promise.resolve();

    const boldFilter = host.querySelector(
      '.doc-assistant-keyinfo__filter[data-type="bold"]'
    ) as HTMLButtonElement | null;
    const titleFilter = host.querySelector(
      '.doc-assistant-keyinfo__filter[data-type="title"]'
    ) as HTMLButtonElement | null;

    expect(boldFilter?.classList.contains("is-active")).toBe(true);
    expect(titleFilter?.classList.contains("is-active")).toBe(false);

    const rowTypes = Array.from(host.querySelectorAll(".doc-assistant-keyinfo__row")).map(
      (row) => (row as HTMLDivElement).dataset.type
    );
    expect(rowTypes).toEqual(["bold"]);

    titleFilter?.click();

    expect(setKeyInfoFilter).toHaveBeenCalledWith(["bold", "title"]);

    controller.destroy();
    host.remove();
  });

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
      resetDocActionOrder: () => {},
      getDocFavoriteActionKeys: () => [],
      setDocActionFavorite: () => {},
      setDocFavoriteActionOrder: () => {},
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

  test("re-enables writable doc actions after readonly state is cleared", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    getDocKeyInfoMock.mockResolvedValue({
      docTitle: "Doc 1",
      items: [],
    });
    getDocReadonlyStateMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const action: ActionConfig = {
      key: "bold-selected-blocks",
      commandText: "选中块全部加粗",
      menuText: "选中块全部加粗",
      group: "edit",
      icon: "iconBold",
      dockIconText: "粗",
      requiresWritableDoc: true,
    };
    const controller = new KeyInfoController({
      isMobile: () => false,
      getCurrentDocId: () => "doc-1",
      getCurrentProtyle: () => undefined,
      resolveDocId: (explicitId?: string) => explicitId || "doc-1",
      runAction: vi.fn().mockResolvedValue(undefined),
      actions: () => [action],
      getDocMenuRegistrationState: () => buildDefaultDocMenuRegistration([action]),
      setAllDocMenuRegistration: () => {},
      setSingleDocMenuRegistration: () => {},
      setDocActionOrder: () => {},
      resetDocActionOrder: () => {},
      getDocFavoriteActionKeys: () => [],
      setDocActionFavorite: () => {},
      setDocFavoriteActionOrder: () => {},
    });

    let dockConfig: any;
    controller.registerDock({
      addDock: (config: unknown) => {
        dockConfig = config;
      },
    });
    dockConfig.init({ element: host });
    await Promise.resolve();
    await Promise.resolve();

    const docProcessTab = host.querySelector(
      '.doc-assistant-keyinfo__tab[data-tab="doc-process"]'
    ) as HTMLButtonElement | null;
    const actionButton = () =>
      host.querySelector(
        '.doc-assistant-keyinfo__action-row[data-action-key="bold-selected-blocks"] .doc-assistant-keyinfo__action-btn'
      ) as HTMLButtonElement | null;

    expect(actionButton()?.disabled).toBe(true);

    docProcessTab?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(actionButton()?.disabled).toBe(false);

    controller.destroy();
    host.remove();
  });

  test("calls resetDocActionOrder when clicking reset order button", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const resetDocActionOrder = vi.fn().mockResolvedValue(undefined);
    const action: ActionConfig = {
      key: "insert-backlinks",
      commandText: "插入反链文档列表（去重）",
      menuText: "插入反链文档列表（去重）",
      group: "edit",
      icon: "iconList",
    };
    const controller = new KeyInfoController({
      isMobile: () => false,
      getCurrentDocId: () => "doc-1",
      getCurrentProtyle: () => undefined,
      resolveDocId: (explicitId?: string) => explicitId || "doc-1",
      runAction: vi.fn().mockResolvedValue(undefined),
      actions: () => [action],
      getDocMenuRegistrationState: () => buildDefaultDocMenuRegistration([action]),
      setAllDocMenuRegistration: () => {},
      setSingleDocMenuRegistration: () => {},
      setDocActionOrder: () => {},
      resetDocActionOrder,
      getDocFavoriteActionKeys: () => [],
      setDocActionFavorite: () => {},
      setDocFavoriteActionOrder: () => {},
    });

    let dockConfig: any;
    controller.registerDock({
      addDock: (config: unknown) => {
        dockConfig = config;
      },
    });
    dockConfig.init({ element: host });

    const resetButton = host.querySelector(
      ".doc-assistant-keyinfo__action-reset-btn"
    ) as HTMLButtonElement | null;
    expect(resetButton).toBeTruthy();

    resetButton!.click();
    expect(resetDocActionOrder).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    controller.destroy();
    host.remove();
  });

  test("calls setDocActionFavorite when clicking favorite button", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const setDocActionFavorite = vi.fn().mockResolvedValue(undefined);
    const action: ActionConfig = {
      key: "insert-backlinks",
      commandText: "插入反链文档列表（去重）",
      menuText: "插入反链文档列表（去重）",
      group: "insert",
      icon: "iconList",
    };
    const controller = new KeyInfoController({
      isMobile: () => false,
      getCurrentDocId: () => "doc-1",
      getCurrentProtyle: () => undefined,
      resolveDocId: (explicitId?: string) => explicitId || "doc-1",
      runAction: vi.fn().mockResolvedValue(undefined),
      actions: () => [action],
      getDocMenuRegistrationState: () => buildDefaultDocMenuRegistration([action]),
      setAllDocMenuRegistration: () => {},
      setSingleDocMenuRegistration: () => {},
      setDocActionOrder: () => {},
      resetDocActionOrder: () => {},
      getDocFavoriteActionKeys: () => [],
      setDocActionFavorite,
      setDocFavoriteActionOrder: () => {},
    });

    let dockConfig: any;
    controller.registerDock({
      addDock: (config: unknown) => {
        dockConfig = config;
      },
    });
    dockConfig.init({ element: host });

    const favoriteButton = host.querySelector(
      '.doc-assistant-keyinfo__action-row[data-action-key="insert-backlinks"] .doc-assistant-keyinfo__action-favorite-btn'
    ) as HTMLButtonElement | null;
    expect(favoriteButton).toBeTruthy();

    favoriteButton!.click();
    expect(setDocActionFavorite).toHaveBeenCalledTimes(1);
    expect(setDocActionFavorite).toHaveBeenCalledWith("insert-backlinks", true);

    await Promise.resolve();
    controller.destroy();
    host.remove();
  });

  test("calls setDocFavoriteActionOrder when reordering favorite actions", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const setDocFavoriteActionOrder = vi.fn().mockResolvedValue(undefined);
    const actions: ActionConfig[] = [
      {
        key: "export-current",
        commandText: "仅导出当前文档",
        menuText: "仅导出当前文档",
        group: "export",
        icon: "iconDownload",
      },
      {
        key: "insert-backlinks",
        commandText: "插入反链文档列表（去重）",
        menuText: "插入反链文档列表（去重）",
        group: "insert",
        icon: "iconList",
      },
    ];
    const controller = new KeyInfoController({
      isMobile: () => false,
      getCurrentDocId: () => "doc-1",
      getCurrentProtyle: () => undefined,
      resolveDocId: (explicitId?: string) => explicitId || "doc-1",
      runAction: vi.fn().mockResolvedValue(undefined),
      actions: () => actions,
      getDocMenuRegistrationState: () => buildDefaultDocMenuRegistration(actions),
      setAllDocMenuRegistration: () => {},
      setSingleDocMenuRegistration: () => {},
      setDocActionOrder: () => {},
      resetDocActionOrder: () => {},
      getDocFavoriteActionKeys: () => ["export-current", "insert-backlinks"],
      setDocActionFavorite: () => {},
      setDocFavoriteActionOrder,
    });

    let dockConfig: any;
    controller.registerDock({
      addDock: (config: unknown) => {
        dockConfig = config;
      },
    });
    dockConfig.init({ element: host });

    const favoriteRows = host.querySelectorAll(
      '.doc-assistant-keyinfo__action-row[data-favorite-copy="true"]'
    );
    expect(favoriteRows.length).toBe(2);
    favoriteRows[0].dispatchEvent(
      new Event("dragstart", { bubbles: true, cancelable: true })
    );
    favoriteRows[1].dispatchEvent(
      new Event("drop", { bubbles: true, cancelable: true })
    );

    expect(setDocFavoriteActionOrder).toHaveBeenCalledWith([
      "insert-backlinks",
      "export-current",
    ]);

    await Promise.resolve();
    controller.destroy();
    host.remove();
  });
});
