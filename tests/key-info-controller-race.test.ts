import { describe, expect, vi, test } from "vitest";

vi.mock("siyuan", () => ({
  showMessage: vi.fn(),
  getActiveEditor: () => undefined
}));

const readonlyStateMock = vi.fn(async () => false);
vi.mock("@/services/kernel", () => ({
  getDocReadonlyState: (...args: unknown[]) => readonlyStateMock(...args)
}));

const keyInfoMock = vi.fn(async () => ({ docTitle: "", items: [] }));
vi.mock("@/services/key-info", () => ({
  getDocKeyInfo: (...args: unknown[]) => keyInfoMock(...args)
}));

vi.mock("@/services/canvas-generator", () => ({
  buildCanvasFromKeyInfoItems: vi.fn(),
  preprocessItemsForCanvas: vi.fn()
}));

type RecordedState = {
  docTitle?: string;
  items?: unknown[];
  docActions?: Array<{ key: string; disabled: boolean; disabledReason?: string }>;
};

// Minimal KeyInfoDockHandle stand-in that records every setState payload.
const dockRecorders: Array<RecordedState[]> = [];
vi.mock("@/ui/key-info-dock", () => ({
  createKeyInfoDock: () => {
    const record: RecordedState[] = [];
    dockRecorders.push(record);
    return {
      setState: (next: RecordedState) => {
        record.push(next);
      },
      getState: () => ({ activeTab: "key-info", filter: [], items: [], loading: false }),
      getVisibleItems: () => [],
      destroy: () => undefined
    };
  }
}));

function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function buildControllerDeps(overrides: Record<string, unknown> = {}) {
  return {
    isMobile: () => false,
    getCurrentDocId: () => "doc-a",
    getCurrentProtyle: () => undefined,
    resolveDocId: (explicitId?: string) => explicitId ?? "doc-a",
    runAction: async () => undefined,
    actions: () => [
      {
        key: "split-doc-by-headings",
        commandText: "按标题拆分文档",
        group: "organize",
        requiresWritableDoc: true,
        tooltip: ""
      }
    ] as any,
    getDocMenuRegistrationState: () => ({}) as any,
    setAllDocMenuRegistration: async () => undefined,
    setSingleDocMenuRegistration: async () => undefined,
    setDocActionOrder: async () => undefined,
    resetDocActionOrder: async () => undefined,
    getDocFavoriteActionKeys: () => [] as any[],
    setDocActionFavorite: async () => undefined,
    setDocFavoriteActionOrder: async () => undefined,
    ...overrides
  };
}

async function createInitializedController() {
  const { KeyInfoController } = await import("@/plugin/key-info-controller");
  const controller = new KeyInfoController(buildControllerDeps() as any);
  controller.registerDock({
    addDock: (config: { init: (dock: { element: HTMLElement }) => void }) => {
      config.init({ element: {} as HTMLElement });
    }
  });
  await flushAsync();
  return controller;
}

function latestDocActionsState(record: RecordedState[]) {
  for (let i = record.length - 1; i >= 0; i -= 1) {
    if (record[i].docActions) {
      return record[i];
    }
  }
  return undefined;
}

describe("keyInfoController cross-token races", () => {
  test("a stale readonly sync from the previous document cannot overwrite the new document's state", async () => {
    const controller = await createInitializedController();
    // 1. A slow readonly sync starts for doc-a (e.g. pointerenter on the panel).
    let releaseDocAReadonly: (readonly: boolean) => void = () => undefined;
    readonlyStateMock.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => {
        releaseDocAReadonly = resolve;
      })
    );
    controller.setActiveTab("doc-process");
    await flushAsync();
    // One readonly call from the init refresh plus the pending sync call.
    expect(readonlyStateMock).toHaveBeenCalledTimes(2);

    // 2. The user switches to doc-b and refresh completes (doc-b is writable).
    const record = dockRecorders[dockRecorders.length - 1];
    await controller.refresh("doc-b");
    const statesAfterRefresh = record.length;
    expect(latestDocActionsState(record)?.docActions?.[0]?.disabled).toBe(false);

    // 3. The stale doc-a sync resolves AFTER the refresh: it must be dropped.
    releaseDocAReadonly(true);
    await flushAsync();

    expect(record.length).toBe(statesAfterRefresh);
    const afterStaleSync = latestDocActionsState(record);
    expect(afterStaleSync?.docActions?.[0]?.disabled).toBe(false);
    expect(afterStaleSync?.docActions?.[0]?.disabledReason).toBeUndefined();
  });

  test("unavailable state clears the previous document's readonly-derived action states", async () => {
    readonlyStateMock.mockImplementation(async () => true);
    const controller = await createInitializedController();
    const record = dockRecorders[dockRecorders.length - 1];

    await controller.refresh("doc-b");
    expect(latestDocActionsState(record)?.docActions?.[0]?.disabled).toBe(true);

    // Losing the document context must not keep the old doc's readonly states.
    await controller.refresh("");
    expect(latestDocActionsState(record)?.docActions?.[0]?.disabled).toBe(false);
  });

  test("destroy invalidates an in-flight refresh so it cannot write into a re-initialized dock", async () => {
    let releaseKeyInfo: (value: { docTitle: string; items: unknown[] }) => void =
      () => undefined;
    keyInfoMock.mockImplementationOnce(
      () => new Promise((resolve) => {
        releaseKeyInfo = resolve;
      })
    );
    const controller = await createInitializedController();
    const firstRecord = dockRecorders[dockRecorders.length - 1];
    const pendingRefresh = controller.refresh("doc-b");
    await flushAsync();

    controller.destroy();
    // Simulate the dock being re-initialized on the same controller instance.
    controller.registerDock({
      addDock: (config: { init: (dock: { element: HTMLElement }) => void }) => {
        config.init({ element: {} as HTMLElement });
      }
    });
    await flushAsync();
    const secondRecord = dockRecorders[dockRecorders.length - 1];

    releaseKeyInfo({ docTitle: "旧文档标题", items: [{ id: "stale" }] });
    await pendingRefresh;
    await flushAsync();

    const polluted = secondRecord.some(
      (state) => state.docTitle === "旧文档标题"
    );
    expect(polluted).toBe(false);
    expect(firstRecord.some((state) => state.docTitle === "旧文档标题")).toBe(false);
  });

  test("setDocActionRunning reference-counts concurrent background tasks across docs", async () => {
    const controller = await createInitializedController();
    const record = dockRecorders[dockRecorders.length - 1] as Array<{
      runningDocActionKeys?: string[];
    }>;

    controller.setDocActionRunning("generate-better-titles", true);
    controller.setDocActionRunning("generate-better-titles", true);
    expect(record[record.length - 1]?.runningDocActionKeys).toEqual(["generate-better-titles"]);

    // First document finishes: the action must remain marked running for the second doc.
    controller.setDocActionRunning("generate-better-titles", false);
    expect(record[record.length - 1]?.runningDocActionKeys).toEqual(["generate-better-titles"]);

    // Second document finishes: now the running key clears.
    controller.setDocActionRunning("generate-better-titles", false);
    expect(record[record.length - 1]?.runningDocActionKeys).toEqual([]);
  });
});
