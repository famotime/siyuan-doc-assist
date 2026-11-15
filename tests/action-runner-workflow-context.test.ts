import { describe, expect, vi, test } from "vitest";

vi.mock("siyuan", () => ({
  showMessage: vi.fn()
}));

vi.mock("@/services/kernel", () => ({
  getDocReadonlyState: vi.fn(async () => false)
}));

vi.mock("@/plugin/action-runner-export-handlers", () => ({
  createExportActionHandlers: () => ({
    "export-current": vi.fn(async () => {})
  })
}));

vi.mock("@/plugin/action-runner-ai-handlers", () => ({
  createAiActionHandlers: () => ({})
}));

vi.mock("@/plugin/action-runner-insert-handlers", () => ({
  createInsertActionHandlers: () => ({})
}));

vi.mock("@/plugin/action-runner-organize-handlers", () => ({
  createOrganizeActionHandlers: () => ({})
}));

vi.mock("@/plugin/action-runner-media-handlers", () => ({
  createMediaActionHandlers: () => ({})
}));

vi.mock("@/plugin/action-runner-selection-handlers", () => ({
  createSelectionActionHandlers: () => ({})
}));

vi.mock("@/plugin/action-runner-cleanup-handlers", () => ({
  createCleanupActionHandlers: () => ({
    "remove-extra-blank-lines": vi.fn(async () => {})
  })
}));

describe("actionRunner workflow context", () => {
  test("uses explicit docId from workflow context when invoking actions", async () => {
    const { ActionRunner } = await import("@/plugin/action-runner");

    const resolveDocId = vi.fn((explicitId?: string) => explicitId || "current-doc");
    const runner = new ActionRunner({
      isMobile: () => false,
      resolveDocId,
      askConfirm: async () => true
    } as any);

    await runner.runAction("export-current", {
      trigger: "workflow-step",
      sourcePlugin: "siyuan-power-automate",
      docId: "doc-from-context"
    } as any);

    expect(resolveDocId).toHaveBeenCalledWith("doc-from-context", undefined);
  });

  test("skips confirmation dialogs for workflow-step actions by default", async () => {
    const { ActionRunner } = await import("@/plugin/action-runner");

    const askConfirm = vi.fn(async () => false);
    const runner = new ActionRunner({
      isMobile: () => false,
      resolveDocId: (explicitId?: string) => explicitId || "current-doc",
      askConfirm
    } as any);

    const result = await runner.runAction("remove-extra-blank-lines", {
      trigger: "workflow-step",
      sourcePlugin: "siyuan-power-automate",
      docId: "doc-from-context"
    } as any);

    expect(askConfirm).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, alreadyNotified: true });
  });
});
