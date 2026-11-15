import { describe, expect, vi, test } from "vitest";

vi.mock("siyuan", () => ({
  showMessage: vi.fn()
}));

const readonlyStateMock = vi.fn(async () => false);
vi.mock("@/services/kernel", () => ({
  getDocReadonlyState: (...args: unknown[]) => readonlyStateMock(...args)
}));

// Foreground handler without writable requirement: captures runner-provided deps.
let cleanupDeps: {
  askConfirmWithVisibleDialog: (title: string, text: string) => Promise<boolean>;
  setBusy?: (busy: boolean) => void;
};
let cleanupHandlerImpl: () => Promise<unknown> = async () => ({});
vi.mock("@/plugin/action-runner-cleanup-handlers", () => ({
  createCleanupActionHandlers: (deps: {
    askConfirmWithVisibleDialog: (title: string, text: string) => Promise<boolean>;
    setBusy?: (busy: boolean) => void;
  }) => {
    cleanupDeps = deps;
    return {
      "remove-extra-blank-lines": () => cleanupHandlerImpl()
    };
  }
}));

// Foreground handler with writable requirement (split-doc-by-headings).
let organizeDeps: {
  askConfirmWithVisibleDialog: (title: string, text: string) => Promise<boolean>;
};
let organizeHandlerImpl: () => Promise<unknown> = async () => ({});
vi.mock("@/plugin/action-runner-organize-handlers", () => ({
  createOrganizeActionHandlers: (deps: {
    askConfirmWithVisibleDialog: (title: string, text: string) => Promise<boolean>;
  }) => {
    organizeDeps = deps;
    return {
      "split-doc-by-headings": () => organizeHandlerImpl()
    };
  }
}));

// Background handler factory: the handler itself mimics a busy-driving background task.
let aiDeps: { setBusy?: (busy: boolean) => void } | undefined;
vi.mock("@/plugin/action-runner-ai-handlers", () => ({
  createAiActionHandlers: (deps: { setBusy?: (busy: boolean) => void }) => {
    aiDeps = deps;
    return {
      "generate-better-titles": async () => {
        aiDeps?.setBusy?.(true);
        aiDeps?.setBusy?.(false);
        return {};
      }
    };
  }
}));

vi.mock("@/plugin/action-runner-export-handlers", () => ({
  createExportActionHandlers: () => ({})
}));
vi.mock("@/plugin/action-runner-insert-handlers", () => ({
  createInsertActionHandlers: () => ({})
}));
vi.mock("@/plugin/action-runner-media-handlers", () => ({
  createMediaActionHandlers: () => ({})
}));
vi.mock("@/plugin/action-runner-selection-handlers", () => ({
  createSelectionActionHandlers: () => ({})
}));
vi.mock("@/plugin/action-runner-delete-range-handlers", () => ({
  createDeleteRangeActionHandlers: () => ({})
}));
vi.mock("@/plugin/action-runner-select-range-handlers", () => ({
  createSelectRangeActionHandlers: () => ({})
}));
vi.mock("@/plugin/action-runner-trim-handlers", () => ({
  handleTrimTrailingWhitespace: async () => ({})
}));

function createRunner(extraDeps: Record<string, unknown> = {}) {
  return import("@/plugin/action-runner").then(({ ActionRunner }) => new ActionRunner({
    isMobile: () => false,
    resolveDocId: (explicitId?: string) => explicitId || "doc-1",
    askConfirm: async () => true,
    ...extraDeps
  }) as InstanceType<typeof ActionRunner>);
}

describe("actionRunner foreground mutex", () => {
  test("rejects concurrent invocation during the writable-doc round trip", async () => {
    const runner = await createRunner();
    let releaseWritable: (writable: boolean) => void = () => undefined;
    readonlyStateMock.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => {
        releaseWritable = resolve;
      })
    );
    organizeHandlerImpl = async () => ({});

    const first = runner.runAction("split-doc-by-headings");
    const second = await runner.runAction("split-doc-by-headings");

    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.errorCode).toBe("not-supported");
      expect(second.message).toContain("正在处理中");
    }

    releaseWritable(false);
    expect((await first).ok).toBe(true);
  });

  test("a rejected concurrent call cannot leak its skipConfirm context into the running action", async () => {
    const askConfirm = vi.fn(async () => false);
    const runner = await createRunner({ askConfirm });
    let releaseHandler: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });
    let capturedAskConfirm: ((title: string, text: string) => Promise<boolean>) | undefined;
    organizeHandlerImpl = async () => {
      capturedAskConfirm = organizeDeps.askConfirmWithVisibleDialog;
      await gate;
      return { ok: await capturedAskConfirm("t", "t") };
    };

    const first = runner.runAction("split-doc-by-headings");
    await vi.waitFor(() => expect(capturedAskConfirm).toBeDefined());

    const second = await runner.runAction("split-doc-by-headings", {
      trigger: "power-buttons",
      skipConfirm: true,
      docId: "doc-1"
    });
    expect(second.ok).toBe(false);

    releaseHandler();
    await first;
    // The confirm dialog must actually be shown for the first action: the rejected
    // call's skipConfirm context must not auto-confirm it.
    expect(askConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("actionRunner busy overlay counter", () => {
  test("overlay never hides while a nested busy phase is still active", async () => {
    const setBusy = vi.fn();
    const runner = await createRunner({ setBusy });
    cleanupHandlerImpl = async () => {
      cleanupDeps.setBusy?.(true);
      await cleanupDeps.askConfirmWithVisibleDialog("confirm", "continue");
      cleanupDeps.setBusy?.(false);
      return {};
    };

    await runner.runAction("remove-extra-blank-lines");

    expect(setBusy.mock.calls.map((call) => call[0])).toEqual([true, false]);
  });

  test("outer finally heals unbalanced nested busy calls", async () => {
    const setBusy = vi.fn();
    const runner = await createRunner({ setBusy });
    cleanupHandlerImpl = async () => {
      cleanupDeps.setBusy?.(true);
      return {};
    };

    await runner.runAction("remove-extra-blank-lines");

    expect(setBusy.mock.calls.map((call) => call[0])).toEqual([true, false]);
  });

  test("confirm dance hides then restores the overlay for a plain busy phase", async () => {
    const setBusy = vi.fn();
    const runner = await createRunner({ setBusy });
    cleanupHandlerImpl = async () => {
      await cleanupDeps.askConfirmWithVisibleDialog("confirm", "continue");
      return {};
    };

    await runner.runAction("remove-extra-blank-lines");

    expect(setBusy.mock.calls.map((call) => call[0])).toEqual([true, false, true, false]);
  });

  test("background tasks never drive the global overlay", async () => {
    const setBusy = vi.fn();
    const runner = await createRunner({ setBusy });

    const result = await runner.runAction("generate-better-titles");
    expect(result.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(setBusy.mock.calls.map((call) => call[0])).toEqual([]);
  });
});
