import { beforeEach, describe, expect, test, vi } from "vitest";

const { showMessageMock } = vi.hoisted(() => ({
  showMessageMock: vi.fn(),
}));
vi.mock(
  "siyuan",
  () => ({
    showMessage: showMessageMock,
  })
);

vi.mock("@/services/exporter", () => ({
  exportCurrentDocMarkdown: vi.fn(),
  exportDocIdsAsMarkdownZip: vi.fn(),
}));

vi.mock("@/services/kernel", () => ({
  appendBlock: vi.fn(),
  deleteBlockById: vi.fn(),
  getChildBlocksByParentId: vi.fn(),
  getDocMetaByID: vi.fn(),
  insertBlockBefore: vi.fn(),
}));

vi.mock("@/services/link-resolver", () => ({
  getBacklinkDocs: vi.fn(),
  getChildDocs: vi.fn(),
  getForwardLinkedDocIds: vi.fn(),
  toBacklinkMarkdown: vi.fn(),
  toChildDocMarkdown: vi.fn(),
}));

vi.mock("@/services/dedupe", () => ({
  deleteDocsByIds: vi.fn(),
  findDuplicateCandidates: vi.fn(),
}));

vi.mock("@/services/mover", () => ({
  moveDocsAsChildren: vi.fn(),
}));

vi.mock("@/ui/dialogs", () => ({
  openDedupeDialog: vi.fn(),
}));

import { ActionRunner } from "@/plugin/action-runner";
import { exportCurrentDocMarkdown } from "@/services/exporter";
import { getChildBlocksByParentId, insertBlockBefore } from "@/services/kernel";

const exportCurrentDocMarkdownMock = vi.mocked(exportCurrentDocMarkdown);
const getChildBlocksByParentIdMock = vi.mocked(getChildBlocksByParentId);
const insertBlockBeforeMock = vi.mocked(insertBlockBefore);

function createRunner(setBusy?: (busy: boolean) => void) {
  return new ActionRunner({
    isMobile: () => false,
    resolveDocId: () => "doc-1",
    askConfirm: async () => true,
    setBusy,
  } as any);
}

describe("action-runner loading guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("toggles busy flag around action execution", async () => {
    let resolveExport!: (value: { mode: "md"; fileName: string }) => void;
    exportCurrentDocMarkdownMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExport = resolve;
        })
    );
    const setBusy = vi.fn();
    const runner = createRunner(setBusy);

    const pending = runner.runAction("export-current");
    expect(setBusy).toHaveBeenCalledWith(true);

    resolveExport({ mode: "md", fileName: "doc-1.md" });
    await pending;
    expect(setBusy).toHaveBeenLastCalledWith(false);
  });

  test("blocks duplicate trigger while action is still running", async () => {
    let resolveExport!: (value: { mode: "md"; fileName: string }) => void;
    exportCurrentDocMarkdownMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExport = resolve;
        })
    );
    const runner = createRunner();

    const first = runner.runAction("export-current");
    const second = runner.runAction("export-current");

    expect(exportCurrentDocMarkdownMock).toHaveBeenCalledTimes(1);
    expect(showMessageMock).toHaveBeenCalledWith("正在处理中，请等待当前任务完成", 4000, "info");

    resolveExport({ mode: "md", fileName: "doc-1.md" });
    await Promise.all([first, second]);
  });

  test("hides busy overlay while waiting for confirmation", async () => {
    let resolveConfirm!: (value: boolean) => void;
    const askConfirm = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveConfirm = resolve;
        })
    );
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "p", content: "", markdown: "", resolved: true } as any,
    ]);
    const setBusy = vi.fn();
    const runner = new ActionRunner({
      isMobile: () => false,
      resolveDocId: () => "doc-1",
      askConfirm,
      setBusy,
    });

    const pending = runner.runAction("remove-extra-blank-lines");
    await Promise.resolve();
    expect(askConfirm).toHaveBeenCalled();
    expect(setBusy).toHaveBeenNthCalledWith(1, true);
    expect(setBusy).toHaveBeenNthCalledWith(2, false);

    resolveConfirm(false);
    await pending;
    expect(setBusy).toHaveBeenLastCalledWith(false);
  });

  test("inserts blank paragraphs before headings that are missing one", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "h1", type: "h", content: "标题1", markdown: "# 标题1", resolved: true } as any,
      { id: "p1", type: "p", content: "正文1", markdown: "正文1", resolved: true } as any,
      { id: "h2", type: "h", content: "标题2", markdown: "## 标题2", resolved: true } as any,
    ]);
    const runner = createRunner();

    await runner.runAction("insert-blank-before-headings" as any);

    expect(insertBlockBeforeMock).toHaveBeenCalledTimes(1);
    expect(insertBlockBeforeMock).toHaveBeenCalledWith("<br />", "h2", "doc-1");
    expect(showMessageMock).toHaveBeenCalledWith("已为 1 个标题补充空段落", 5000, "info");
  });
});
