// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";

const { getActiveEditorMock, showMessageMock } = vi.hoisted(() => ({
  getActiveEditorMock: vi.fn(),
  showMessageMock: vi.fn(),
}));
vi.mock(
  "siyuan",
  () => ({
    getActiveEditor: getActiveEditorMock,
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
  getBlockKramdowns: vi.fn(),
  getChildBlocksByParentId: vi.fn(),
  getDocMetaByID: vi.fn(),
  insertBlockBefore: vi.fn(),
  updateBlockMarkdown: vi.fn(),
}));

vi.mock("@/services/block-lineage", () => ({
  resolveDocDirectChildBlockId: vi.fn(),
}));

vi.mock("@/services/link-resolver", () => ({
  filterDocRefsByExistingLinks: vi.fn(),
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
import {
  resetDocAssistantDebugSetting,
  setDocAssistantDebugEnabled,
} from "@/core/logger-core";
import { exportCurrentDocMarkdown } from "@/services/exporter";
import { deleteDocsByIds, findDuplicateCandidates } from "@/services/dedupe";
import { resolveDocDirectChildBlockId } from "@/services/block-lineage";
import {
  filterDocRefsByExistingLinks,
  getBacklinkDocs,
  getChildDocs,
  toBacklinkMarkdown,
  toChildDocMarkdown,
} from "@/services/link-resolver";
import { moveDocsAsChildren } from "@/services/mover";
import {
  appendBlock,
  deleteBlockById,
  getBlockKramdowns,
  getChildBlocksByParentId,
  insertBlockBefore,
  updateBlockMarkdown,
} from "@/services/kernel";
import { openDedupeDialog } from "@/ui/dialogs";

const exportCurrentDocMarkdownMock = vi.mocked(exportCurrentDocMarkdown);
const deleteDocsByIdsMock = vi.mocked(deleteDocsByIds);
const deleteBlockByIdMock = vi.mocked(deleteBlockById);
const appendBlockMock = vi.mocked(appendBlock);
const getBlockKramdownsMock = vi.mocked(getBlockKramdowns);
const getChildBlocksByParentIdMock = vi.mocked(getChildBlocksByParentId);
const getBacklinkDocsMock = vi.mocked(getBacklinkDocs);
const getChildDocsMock = vi.mocked(getChildDocs);
const filterDocRefsByExistingLinksMock = vi.mocked(filterDocRefsByExistingLinks);
const toBacklinkMarkdownMock = vi.mocked(toBacklinkMarkdown);
const toChildDocMarkdownMock = vi.mocked(toChildDocMarkdown);
const moveDocsAsChildrenMock = vi.mocked(moveDocsAsChildren);
const findDuplicateCandidatesMock = vi.mocked(findDuplicateCandidates);
const insertBlockBeforeMock = vi.mocked(insertBlockBefore);
const updateBlockMarkdownMock = vi.mocked(updateBlockMarkdown);
const resolveDocDirectChildBlockIdMock = vi.mocked(resolveDocDirectChildBlockId);
const openDedupeDialogMock = vi.mocked(openDedupeDialog);

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
    resetDocAssistantDebugSetting();
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

  test("inserts filtered backlinks and reports skipped existing links", async () => {
    getBacklinkDocsMock.mockResolvedValue([
      { id: "doc-a", title: "A" } as any,
      { id: "doc-b", title: "B" } as any,
    ]);
    filterDocRefsByExistingLinksMock.mockResolvedValue({
      items: [{ id: "doc-a", title: "A" } as any],
      skipped: [{ id: "doc-b", title: "B" } as any],
      existingIds: ["doc-b"],
    });
    toBacklinkMarkdownMock.mockReturnValue("- [A](siyuan://blocks/doc-a)");
    const runner = createRunner();

    await runner.runAction("insert-backlinks");

    expect(appendBlockMock).toHaveBeenCalledWith("- [A](siyuan://blocks/doc-a)", "doc-1");
    expect(showMessageMock).toHaveBeenCalledWith("已插入 1 个反链文档链接，跳过已存在 1 个", 5000, "info");
  });

  test("shows no-op message when all backlinks already exist in current doc", async () => {
    getBacklinkDocsMock.mockResolvedValue([{ id: "doc-a", title: "A" } as any]);
    filterDocRefsByExistingLinksMock.mockResolvedValue({
      items: [],
      skipped: [{ id: "doc-a", title: "A" } as any],
      existingIds: ["doc-a"],
    });
    const runner = createRunner();

    await runner.runAction("insert-backlinks");

    expect(appendBlockMock).not.toHaveBeenCalled();
    expect(showMessageMock).toHaveBeenCalledWith("当前文档已包含所有反向链接文档", 5000, "info");
  });

  test("inserts child doc links after filtering existing links", async () => {
    getChildDocsMock.mockResolvedValue([
      { id: "child-a", title: "Child A" } as any,
      { id: "child-b", title: "Child B" } as any,
    ]);
    filterDocRefsByExistingLinksMock.mockResolvedValue({
      items: [{ id: "child-b", title: "Child B" } as any],
      skipped: [{ id: "child-a", title: "Child A" } as any],
      existingIds: ["child-a"],
    });
    toChildDocMarkdownMock.mockReturnValue("- [Child B](siyuan://blocks/child-b)");
    const runner = createRunner();

    await runner.runAction("insert-child-docs");

    expect(appendBlockMock).toHaveBeenCalledWith("- [Child B](siyuan://blocks/child-b)", "doc-1");
    expect(showMessageMock).toHaveBeenCalledWith("已插入 1 个子文档链接，跳过已存在 1 个", 5000, "info");
  });

  test("shows no-op when move-backlinks confirmation is canceled", async () => {
    getBacklinkDocsMock.mockResolvedValue([{ id: "doc-a", title: "A" } as any]);
    const askConfirm = vi.fn().mockResolvedValue(false);
    const setBusy = vi.fn();
    const runner = new ActionRunner({
      isMobile: () => false,
      resolveDocId: () => "doc-1",
      askConfirm,
      setBusy,
    } as any);

    await runner.runAction("move-backlinks");

    expect(moveDocsAsChildrenMock).not.toHaveBeenCalled();
    expect(askConfirm).toHaveBeenCalledTimes(1);
  });

  test("reports move-backlinks result with error severity when failures exist", async () => {
    getBacklinkDocsMock.mockResolvedValue([
      { id: "doc-a", title: "A" } as any,
      { id: "doc-b", title: "B" } as any,
      { id: "doc-c", title: "C" } as any,
    ]);
    moveDocsAsChildrenMock.mockResolvedValue({
      successIds: ["doc-a"],
      skippedIds: ["doc-c"],
      renamed: [{ id: "doc-a", title: "A(1)" }],
      failed: [{ id: "doc-b", error: "locked" }],
    });
    const runner = createRunner();

    await runner.runAction("move-backlinks");

    expect(moveDocsAsChildrenMock).toHaveBeenCalledWith("doc-1", ["doc-a", "doc-b", "doc-c"]);
    expect(showMessageMock).toHaveBeenCalledWith("移动完成：成功 1，跳过 1，重命名 1，失败 1", 9000, "error");
  });

  test("wires dedupe dialog callbacks for delete, open-all and insert-links", async () => {
    vi.useFakeTimers();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null as any);
    findDuplicateCandidatesMock.mockResolvedValue([
      {
        groupId: "group-1",
        score: 0.95,
        docs: [
          { id: "doc-a", title: "A", updated: "2026-02-25", hPath: "/A" },
          { id: "doc-b", title: "B", updated: "2026-02-24", hPath: "/B" },
        ],
      } as any,
    ]);
    const runner = createRunner();

    await runner.runAction("dedupe");

    expect(openDedupeDialogMock).toHaveBeenCalledTimes(1);
    const dialogArgs = openDedupeDialogMock.mock.calls[0]?.[0] as any;
    await dialogArgs.onDelete(["doc-a"]);
    expect(deleteDocsByIdsMock).toHaveBeenCalledWith(["doc-a"]);

    dialogArgs.onOpenAll([
      { id: "doc-a", title: "A" },
      { id: "doc-a", title: "A (dup)" },
      { id: "doc-b", title: "B" },
    ]);
    vi.runAllTimers();
    expect(openSpy).toHaveBeenCalledTimes(2);
    expect(showMessageMock).toHaveBeenCalledWith("已尝试打开 2 篇文档", 5000, "info");

    dialogArgs.onInsertLinks([
      { id: "doc-a", title: "A" },
      { id: "doc-a", title: "A (dup)" },
      { id: "doc-b", title: "B" },
    ]);
    await Promise.resolve();
    await Promise.resolve();
    expect(appendBlockMock).toHaveBeenCalledWith(
      "## 重复候选文档\n\n- [A](siyuan://blocks/doc-a)\n- [B](siyuan://blocks/doc-b)",
      "doc-1"
    );
    expect(showMessageMock).toHaveBeenCalledWith("已插入 2 个文档链接", 5000, "info");
    expect(showMessageMock).toHaveBeenCalledWith("识别到 1 组重复候选", 5000, "info");

    openSpy.mockRestore();
    vi.useRealTimers();
  });

  test("trims trailing whitespace and updates only affected blocks", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "p", markdown: "hello  \nworld\t", resolved: true } as any,
      { id: "b", type: "p", markdown: "clean", resolved: true } as any,
      { id: "c", type: "p", markdown: "skip", resolved: false } as any,
    ]);
    const runner = createRunner();

    await runner.runAction("trim-trailing-whitespace" as any);

    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdownMock).toHaveBeenCalledWith("a", "hello\nworld");
    expect(showMessageMock).toHaveBeenCalledWith("已清理 1 个块、2 行行尾空格", 5000, "info");
  });

  test("shows no-op message when no trailing whitespace exists", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "p", markdown: "hello\nworld", resolved: true } as any,
      { id: "b", type: "h", markdown: "## title", resolved: true } as any,
    ]);
    const runner = createRunner();

    await runner.runAction("trim-trailing-whitespace" as any);

    expect(getBlockKramdownsMock).toHaveBeenCalledWith(["a"]);
    expect(updateBlockMarkdownMock).not.toHaveBeenCalled();
    expect(showMessageMock).toHaveBeenCalledWith("未发现需要清理的行尾空格", 4000, "info");
  });

  test("trims trailing whitespace from kramdown when sql markdown is normalized", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "p", markdown: "hello\nworld", resolved: true } as any,
    ]);
    getBlockKramdownsMock
      .mockResolvedValueOnce([{ id: "a", kramdown: "hello  \nworld\t" } as any])
      .mockResolvedValueOnce([{ id: "a", kramdown: "hello\nworld" } as any]);
    const runner = createRunner();

    await runner.runAction("trim-trailing-whitespace" as any);

    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdownMock).toHaveBeenCalledWith("a", "hello\nworld");
    expect(showMessageMock).toHaveBeenCalledWith("已清理 1 个块、2 行行尾空格", 5000, "info");
  });

  test("keeps leading spaces from sql markdown when kramdown is normalized", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "p", markdown: "  hello  \n    world\t", resolved: true } as any,
    ]);
    getBlockKramdownsMock
      .mockResolvedValueOnce([{ id: "a", kramdown: "hello  \nworld\t" } as any])
      .mockResolvedValueOnce([{ id: "a", kramdown: "hello\nworld" } as any]);
    const runner = createRunner();

    await runner.runAction("trim-trailing-whitespace" as any);

    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdownMock).toHaveBeenCalledWith("a", "  hello\n    world");
    expect(showMessageMock).toHaveBeenCalledWith("已清理 1 个块、2 行行尾空格", 5000, "info");
  });

  test("does not trigger verification reads when batch source has no trailing whitespace", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "p", markdown: "hello\nworld", resolved: true } as any,
    ]);
    getBlockKramdownsMock.mockResolvedValue([
      { id: "a", kramdown: "hello\nworld" } as any,
    ]);
    const runner = createRunner();

    await runner.runAction("trim-trailing-whitespace" as any);

    expect(getBlockKramdownsMock).toHaveBeenCalledTimes(1);
    expect(getBlockKramdownsMock).toHaveBeenCalledWith(["a"]);
    expect(updateBlockMarkdownMock).not.toHaveBeenCalled();
    expect(showMessageMock).toHaveBeenCalledWith("未发现需要清理的行尾空格", 4000, "info");
  });

  test("retries update when batch verification still finds trailing whitespace", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "p", markdown: "text", resolved: true } as any,
    ]);
    getBlockKramdownsMock
      .mockResolvedValueOnce([{ id: "a", kramdown: "text\\t{: style=\"white-space:pre\"}" } as any])
      .mockResolvedValueOnce([{ id: "a", kramdown: "text\\t{: style=\"white-space:pre\"}" } as any])
      .mockResolvedValueOnce([{ id: "a", kramdown: "text" } as any]);
    const runner = createRunner();

    await runner.runAction("trim-trailing-whitespace" as any);

    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(1, "a", "text");
    expect(showMessageMock).toHaveBeenCalledWith("已清理 1 个块、1 行行尾空格", 5000, "info");
  });

  test("logs readable failure summary when verification remains dirty after retries", async () => {
    setDocAssistantDebugEnabled(true);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "p", markdown: "text", resolved: true } as any,
    ]);
    getBlockKramdownsMock.mockResolvedValue([
      { id: "a", kramdown: "text\\t{: style=\"white-space:pre\"}" } as any,
    ]);
    const runner = createRunner();

    await runner.runAction("trim-trailing-whitespace" as any);

    expect(showMessageMock).toHaveBeenCalledWith("已清理 0 个块、0 行，失败 1 个块", 7000, "error");
    const applyLog = infoSpy.mock.calls.find(
      (args) => args[0] === "[DocAssistant][TrailingWhitespace] apply result"
    );
    expect(applyLog).toBeTruthy();
    const payload = applyLog?.[1] as any;
    expect(payload.failedBlockCount).toBe(1);
    expect(payload.failedSummary?.[0]).toContain("a|");
    infoSpy.mockRestore();
  });

  test("deletes all blocks from current block to end", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "p", content: "A", markdown: "A", resolved: true } as any,
      { id: "b", type: "p", content: "B", markdown: "B", resolved: true } as any,
      { id: "c", type: "h", content: "C", markdown: "## C", resolved: true } as any,
    ]);
    const runner = createRunner();
    const protyle = { block: { rootID: "doc-1", id: "b" } } as any;

    await runner.runAction("delete-from-current-to-end" as any, undefined, protyle);

    expect(deleteBlockByIdMock).toHaveBeenCalledTimes(2);
    expect(deleteBlockByIdMock).toHaveBeenNthCalledWith(1, "b");
    expect(deleteBlockByIdMock).toHaveBeenNthCalledWith(2, "c");
    expect(showMessageMock).toHaveBeenCalledWith("已删除 2 个段落", 5000, "info");
  });

  test("falls back to active editor block id when protyle is missing", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "p", content: "A", markdown: "A", resolved: true } as any,
      { id: "b", type: "p", content: "B", markdown: "B", resolved: true } as any,
      { id: "c", type: "p", content: "C", markdown: "C", resolved: true } as any,
    ]);
    getActiveEditorMock.mockReturnValue({
      protyle: { block: { id: "b" } },
    });
    const runner = createRunner();

    await runner.runAction("delete-from-current-to-end" as any);

    expect(deleteBlockByIdMock).toHaveBeenCalledTimes(2);
    expect(deleteBlockByIdMock).toHaveBeenNthCalledWith(1, "b");
    expect(deleteBlockByIdMock).toHaveBeenNthCalledWith(2, "c");
  });

  test("maps nested current block to direct child block before deleting", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "p", content: "A", markdown: "A", resolved: true } as any,
      { id: "b", type: "l", content: "", markdown: "", resolved: true } as any,
      { id: "c", type: "p", content: "C", markdown: "C", resolved: true } as any,
    ]);
    resolveDocDirectChildBlockIdMock.mockResolvedValue("b");
    const runner = createRunner();
    const protyle = { block: { rootID: "doc-1", id: "b-sub-1" } } as any;

    await runner.runAction("delete-from-current-to-end" as any, undefined, protyle);

    expect(resolveDocDirectChildBlockIdMock).toHaveBeenCalledWith("doc-1", "b-sub-1");
    expect(deleteBlockByIdMock).toHaveBeenCalledTimes(2);
    expect(deleteBlockByIdMock).toHaveBeenNthCalledWith(1, "b");
    expect(deleteBlockByIdMock).toHaveBeenNthCalledWith(2, "c");
  });

  test("ignores doc id as current block and falls back to active editor block", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "p", content: "A", markdown: "A", resolved: true } as any,
      { id: "b", type: "p", content: "B", markdown: "B", resolved: true } as any,
      { id: "c", type: "p", content: "C", markdown: "C", resolved: true } as any,
    ]);
    getActiveEditorMock.mockReturnValue({
      protyle: { block: { id: "b" } },
    });
    const runner = createRunner();
    const protyle = { block: { rootID: "doc-1", id: "doc-1" } } as any;

    await runner.runAction("delete-from-current-to-end" as any, undefined, protyle);

    expect(deleteBlockByIdMock).toHaveBeenCalledTimes(2);
    expect(deleteBlockByIdMock).toHaveBeenNthCalledWith(1, "b");
    expect(deleteBlockByIdMock).toHaveBeenNthCalledWith(2, "c");
  });

  test("shows locate error when both provided and active ids are doc id", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "p", content: "A", markdown: "A", resolved: true } as any,
      { id: "b", type: "p", content: "B", markdown: "B", resolved: true } as any,
    ]);
    getActiveEditorMock.mockReturnValue({
      protyle: { block: { id: "doc-1" } },
    });
    const runner = createRunner();
    const protyle = { block: { rootID: "doc-1", id: "doc-1" } } as any;

    await runner.runAction("delete-from-current-to-end" as any, undefined, protyle);

    expect(deleteBlockByIdMock).not.toHaveBeenCalled();
    expect(showMessageMock).toHaveBeenCalledWith("未定位到当前段落，请将光标置于正文后重试", 5000, "error");
  });

  test("bolds all selected blocks", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="a" class="protyle-wysiwyg--select">A</div>
      <div data-node-id="b" class="protyle-wysiwyg--select">B</div>
    `;
    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    getBlockKramdownsMock.mockResolvedValue([
      { id: "a", kramdown: "Hello" } as any,
      { id: "b", kramdown: "# Title {: id=\"b\"}" } as any,
    ]);
    const runner = createRunner();

    await runner.runAction("bold-selected-blocks" as any, undefined, protyle);

    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(2);
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(1, "a", "**Hello**");
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(2, "b", "# **Title**");
  });

  test("normalizes partial bold content before applying full bold", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="a" class="protyle-wysiwyg--select">A</div>
    `;
    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    getBlockKramdownsMock.mockResolvedValue([
      { id: "a", kramdown: "Hello **World**" } as any,
    ]);
    const runner = createRunner();

    await runner.runAction("bold-selected-blocks" as any, undefined, protyle);

    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdownMock).toHaveBeenCalledWith("a", "**Hello World**");
  });

  test("toggles fully bold selected blocks back to plain text", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="a" class="protyle-wysiwyg--select">A</div>
      <div data-node-id="b" class="protyle-wysiwyg--select">B</div>
    `;
    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    getBlockKramdownsMock.mockResolvedValue([
      { id: "a", kramdown: "**Hello**" } as any,
      { id: "b", kramdown: "# **Title** {: id=\"b\"}" } as any,
    ]);
    const runner = createRunner();

    await runner.runAction("bold-selected-blocks" as any, undefined, protyle);

    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(2);
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(1, "a", "Hello");
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(2, "b", "# Title");
  });

  test("strips trailing kramdown attributes from selected text block when bolding", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="g" class="protyle-wysiwyg--select">G</div>
    `;
    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    getBlockKramdownsMock.mockResolvedValue([
      {
        id: "g",
        kramdown: '补充对应测试。 {: id="20260225233926-3sosz6b" updated="20260225233926"}',
      } as any,
    ]);
    const runner = createRunner();

    await runner.runAction("bold-selected-blocks" as any, undefined, protyle);

    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdownMock).toHaveBeenCalledWith("g", "**补充对应测试。**");
  });

  test("highlights all selected blocks", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="c" class="protyle-wysiwyg--select">C</div>
    `;
    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    getBlockKramdownsMock.mockResolvedValue([
      { id: "c", kramdown: "- item" } as any,
    ]);
    const runner = createRunner();

    await runner.runAction("highlight-selected-blocks" as any, undefined, protyle);

    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(1, "c", "- ==item==");
  });

  test("toggles fully highlighted block back to plain text", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="c" class="protyle-wysiwyg--select">C</div>
    `;
    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    getBlockKramdownsMock.mockResolvedValue([
      { id: "c", kramdown: "==item==" } as any,
    ]);
    const runner = createRunner();

    await runner.runAction("highlight-selected-blocks" as any, undefined, protyle);

    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(1, "c", "item");
  });

  test("shows message when no blocks are selected for styling", async () => {
    const root = document.createElement("div");
    root.innerHTML = `<div data-node-id="a">A</div>`;
    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    const runner = createRunner();

    await runner.runAction("bold-selected-blocks" as any, undefined, protyle);

    expect(updateBlockMarkdownMock).not.toHaveBeenCalled();
    expect(showMessageMock).toHaveBeenCalledWith("未选中任何块，请先选中块", 5000, "info");
  });

  test("treats data-node-selected attribute as selected block marker", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="d" data-node-selected="1">D</div>
    `;
    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    getBlockKramdownsMock.mockResolvedValue([
      { id: "d", kramdown: "Text" } as any,
    ]);
    const runner = createRunner();

    await runner.runAction("bold-selected-blocks" as any, undefined, protyle);

    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdownMock).toHaveBeenCalledWith("d", "**Text**");
  });

  test("shows source-missing reason when selected blocks cannot load kramdown", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="e" class="protyle-wysiwyg--select">E</div>
    `;
    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    getBlockKramdownsMock.mockResolvedValue([]);
    const runner = createRunner();

    await runner.runAction("bold-selected-blocks" as any, undefined, protyle);

    const messages = showMessageMock.mock.calls.map((call) => String(call[0] || ""));
    expect(messages.some((item) => item.includes("读取块源码失败"))).toBe(true);
    expect(updateBlockMarkdownMock).not.toHaveBeenCalled();
  });

  test("shows update failure reason when block update throws", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="f" class="protyle-wysiwyg--select">F</div>
    `;
    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    getBlockKramdownsMock.mockResolvedValue([
      { id: "f", kramdown: "hello" } as any,
    ]);
    updateBlockMarkdownMock.mockRejectedValue(new Error("readonly mode"));
    const runner = createRunner();

    await runner.runAction("bold-selected-blocks" as any, undefined, protyle);

    const messages = showMessageMock.mock.calls.map((call) => String(call[0] || ""));
    expect(messages.some((item) => item.includes("readonly mode"))).toBe(true);
  });
});
