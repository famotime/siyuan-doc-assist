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
  exportDocAndChildKeyInfoAsZip: vi.fn(),
}));

vi.mock("@/services/kernel", () => ({
  appendBlock: vi.fn(),
  createDocWithMd: vi.fn(),
  deleteBlocksByIds: vi.fn(),
  deleteBlockById: vi.fn(),
  getBlockDOM: vi.fn(),
  getBlockDOMs: vi.fn(),
  getBlockAttrs: vi.fn(),
  getDocReadonlyState: vi.fn(),
  getChildBlockRefsByParentId: vi.fn(),
  getBlockKramdowns: vi.fn(),
  getChildBlocksByParentId: vi.fn(),
  getDocMetaByID: vi.fn(),
  insertBlockBefore: vi.fn(),
  updateBlockDom: vi.fn(),
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

vi.mock("@/services/image-webp", () => ({
  convertDocImagesToWebp: vi.fn(),
}));

vi.mock("@/services/image-png", () => ({
  convertDocImagesToPng: vi.fn(),
}));

vi.mock("@/services/image-display-size", () => ({
  resizeDocImagesToDisplay: vi.fn(),
}));

vi.mock("@/services/image-remove", () => ({
  removeDocImageLinks: vi.fn(),
}));

vi.mock("@/ui/dialogs", () => ({
  openDedupeDialog: vi.fn(),
}));

import { ActionRunner } from "@/plugin/action-runner";
import { ACTIONS } from "@/plugin/actions";
import {
  resetDocAssistantDebugSetting,
  setDocAssistantDebugEnabled,
} from "@/core/logger-core";
import {
  exportCurrentDocMarkdown,
  exportDocAndChildKeyInfoAsZip,
} from "@/services/exporter";
import { deleteDocsByIds, findDuplicateCandidates } from "@/services/dedupe";
import { resolveDocDirectChildBlockId } from "@/services/block-lineage";
import {
  filterDocRefsByExistingLinks,
  getBacklinkDocs,
  getChildDocs,
  getForwardLinkedDocIds,
  toBacklinkMarkdown,
  toChildDocMarkdown,
} from "@/services/link-resolver";
import { moveDocsAsChildren } from "@/services/mover";
import { convertDocImagesToWebp } from "@/services/image-webp";
import { convertDocImagesToPng } from "@/services/image-png";
import { resizeDocImagesToDisplay } from "@/services/image-display-size";
import { removeDocImageLinks } from "@/services/image-remove";
import {
  appendBlock,
  createDocWithMd,
  deleteBlocksByIds,
  deleteBlockById,
  getBlockDOM,
  getBlockDOMs,
  getBlockAttrs,
  getDocReadonlyState,
  getBlockKramdowns,
  getChildBlockRefsByParentId,
  getChildBlocksByParentId,
  getDocMetaByID,
  insertBlockBefore,
  updateBlockDom,
  updateBlockMarkdown,
} from "@/services/kernel";
import { openDedupeDialog } from "@/ui/dialogs";

const exportCurrentDocMarkdownMock = vi.mocked(exportCurrentDocMarkdown);
const exportDocAndChildKeyInfoAsZipMock = vi.mocked(exportDocAndChildKeyInfoAsZip);
const deleteDocsByIdsMock = vi.mocked(deleteDocsByIds);
const deleteBlockByIdMock = vi.mocked(deleteBlockById);
const deleteBlocksByIdsMock = vi.mocked(deleteBlocksByIds);
const appendBlockMock = vi.mocked(appendBlock);
const createDocWithMdMock = vi.mocked(createDocWithMd);
const getBlockDOMMock = vi.mocked(getBlockDOM);
const getBlockDOMsMock = vi.mocked(getBlockDOMs);
const getBlockAttrsMock = vi.mocked(getBlockAttrs);
const getDocReadonlyStateMock = vi.mocked(getDocReadonlyState);
const getBlockKramdownsMock = vi.mocked(getBlockKramdowns);
const getChildBlockRefsByParentIdMock = vi.mocked(getChildBlockRefsByParentId);
const getChildBlocksByParentIdMock = vi.mocked(getChildBlocksByParentId);
const getDocMetaByIDMock = vi.mocked(getDocMetaByID);
const getBacklinkDocsMock = vi.mocked(getBacklinkDocs);
const getChildDocsMock = vi.mocked(getChildDocs);
const getForwardLinkedDocIdsMock = vi.mocked(getForwardLinkedDocIds);
const filterDocRefsByExistingLinksMock = vi.mocked(filterDocRefsByExistingLinks);
const toBacklinkMarkdownMock = vi.mocked(toBacklinkMarkdown);
const toChildDocMarkdownMock = vi.mocked(toChildDocMarkdown);
const moveDocsAsChildrenMock = vi.mocked(moveDocsAsChildren);
const findDuplicateCandidatesMock = vi.mocked(findDuplicateCandidates);
const insertBlockBeforeMock = vi.mocked(insertBlockBefore);
const updateBlockDomMock = vi.mocked(updateBlockDom);
const updateBlockMarkdownMock = vi.mocked(updateBlockMarkdown);
const resolveDocDirectChildBlockIdMock = vi.mocked(resolveDocDirectChildBlockId);
const openDedupeDialogMock = vi.mocked(openDedupeDialog);
const convertDocImagesToWebpMock = vi.mocked(convertDocImagesToWebp);
const convertDocImagesToPngMock = vi.mocked(convertDocImagesToPng);
const resizeDocImagesToDisplayMock = vi.mocked(resizeDocImagesToDisplay);
const removeDocImageLinksMock = vi.mocked(removeDocImageLinks);

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
    getDocReadonlyStateMock.mockResolvedValue(false);
  });

  test("defines a handler for every registered action", () => {
    const runner = createRunner() as any;
    const handlerKeys = Object.keys(runner.actionHandlers).sort();

    expect(handlerKeys).toEqual(ACTIONS.map((item) => item.key).sort());
    expect(handlerKeys.every((key) => typeof runner.actionHandlers[key] === "function")).toBe(true);
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

  test("resets busy state after handler failure and allows a later rerun", async () => {
    exportCurrentDocMarkdownMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ mode: "md", fileName: "doc-1.md" });
    const setBusy = vi.fn();
    const runner = createRunner(setBusy);

    await runner.runAction("export-current");
    await runner.runAction("export-current");

    expect(exportCurrentDocMarkdownMock).toHaveBeenCalledTimes(2);
    expect(setBusy.mock.calls).toEqual([[true], [false], [true], [false]]);
    expect(showMessageMock).toHaveBeenCalledWith("boom", 7000, "error");
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

  test("blocks writable doc action when current doc is locked", async () => {
    getDocReadonlyStateMock.mockResolvedValue(true);
    const runner = createRunner();

    await runner.runAction("insert-backlinks");

    expect(appendBlockMock).not.toHaveBeenCalled();
    expect(getBacklinkDocsMock).not.toHaveBeenCalled();
    expect(showMessageMock).toHaveBeenCalledWith(
      "当前文档已锁定，无法执行“插入反链文档列表（去重）”。请先解除文档锁定后再试。",
      5000,
      "info"
    );
  });

  test("still allows readonly-safe action when current doc is locked", async () => {
    getDocReadonlyStateMock.mockResolvedValue(true);
    exportCurrentDocMarkdownMock.mockResolvedValue({
      mode: "md",
      fileName: "doc-1.md",
    } as any);
    const runner = createRunner();

    await runner.runAction("export-current");

    expect(exportCurrentDocMarkdownMock).toHaveBeenCalledTimes(1);
    expect(showMessageMock).toHaveBeenCalledWith("导出完成：doc-1.md", 5000, "info");
  });

  test("exports current and child docs key info zip with current key-info filter", async () => {
    exportDocAndChildKeyInfoAsZipMock.mockResolvedValue({
      name: "doc-1-key-info",
      zip: "temp/export/doc-1-key-info.zip",
      docCount: 3,
      itemCount: 8,
    } as any);
    const runner = new ActionRunner({
      isMobile: () => false,
      resolveDocId: () => "doc-1",
      askConfirm: async () => true,
      getKeyInfoFilter: () => ["bold", "highlight"],
    } as any);

    await runner.runAction("export-child-key-info-zip" as any);

    expect(exportDocAndChildKeyInfoAsZipMock).toHaveBeenCalledTimes(1);
    expect(exportDocAndChildKeyInfoAsZipMock).toHaveBeenCalledWith({
      docId: "doc-1",
      filter: ["bold", "highlight"],
      protyle: undefined,
    });
    expect(showMessageMock).toHaveBeenCalledWith(
      "导出完成：3 篇文档，8 条关键内容",
      6000,
      "info"
    );
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
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(askConfirm).toHaveBeenCalled();
    expect(setBusy).toHaveBeenNthCalledWith(1, true);
    expect(setBusy).toHaveBeenNthCalledWith(2, false);

    resolveConfirm(false);
    await pending;
    expect(setBusy).toHaveBeenLastCalledWith(false);
  });

  test("removes extra blank lines through batched delete helper", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "p", content: "", markdown: "", resolved: true } as any,
      { id: "b", type: "p", content: "正文", markdown: "正文", resolved: true } as any,
      { id: "c", type: "p", content: "", markdown: "", resolved: true } as any,
    ]);
    deleteBlocksByIdsMock.mockResolvedValue({
      deletedCount: 2,
      failedIds: [],
    });
    const runner = createRunner();

    await runner.runAction("remove-extra-blank-lines" as any);

    expect(deleteBlocksByIdsMock).toHaveBeenCalledWith(["a", "c"], { concurrency: 6 });
    expect(deleteBlockByIdMock).not.toHaveBeenCalled();
    expect(showMessageMock).toHaveBeenCalledWith("已去除 2 个空段落", 5000, "info");
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

  test("creates a summary page from opened unpinned docs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17T09:08:07+08:00"));
    getDocMetaByIDMock.mockResolvedValue({
      id: "doc-1",
      box: "notebook-1",
      hPath: "/项目/当前文档",
      title: "当前文档",
    } as any);
    createDocWithMdMock.mockResolvedValue("summary-doc");
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    (window as any).siyuan = {
      layout: {
        centerLayout: {
          children: [
            {
              children: [
                {
                  pin: false,
                  title: "当前文档",
                  model: {
                    notebookId: "notebook-1",
                    rootId: "doc-1",
                  },
                },
                {
                  pin: true,
                  title: "已钉住文档",
                  model: {
                    notebookId: "notebook-1",
                    rootId: "doc-pinned",
                  },
                },
                {
                  pin: false,
                  title: "资料页",
                  model: {
                    notebookId: "notebook-1",
                    rootId: "doc-2",
                  },
                },
              ],
            },
          ],
        },
      },
    };
    const runner = createRunner();

    await runner.runAction("create-open-docs-summary" as any);

    expect(createDocWithMdMock).toHaveBeenCalledWith(
      "notebook-1",
      "/项目/已打开文档汇总页-20260317-090807",
      "- [当前文档](siyuan://blocks/doc-1)\n- [资料页](siyuan://blocks/doc-2)"
    );
    expect(openSpy).toHaveBeenCalledWith("siyuan://blocks/summary-doc");
    expect(showMessageMock).toHaveBeenCalledWith("已生成汇总页，包含 2 篇已打开文档", 5000, "info");

    openSpy.mockRestore();
    vi.useRealTimers();
  });

  test("converts doc links to refs in current document by default", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      {
        id: "a",
        type: "p",
        markdown: "- [Doc A](siyuan://blocks/20260101101010-abcdef1)",
        resolved: true,
      } as any,
      {
        id: "b",
        type: "p",
        markdown: '- ((20260202121212-bcdefg2 "Doc B"))',
        resolved: true,
      } as any,
    ]);
    const runner = createRunner();

    await runner.runAction("toggle-links-refs" as any);

    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdownMock).toHaveBeenCalledWith(
      "a",
      '- ((20260101101010-abcdef1 "Doc A"))'
    );
    expect(showMessageMock).toHaveBeenCalledWith("已将 1 处文档链接转换为引用，共更新 1 个块", 5000, "info");
  });

  test("shows confirm summary before toggling links and refs", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      {
        id: "a",
        type: "p",
        markdown: "- [Doc A](siyuan://blocks/20260101101010-abcdef1)",
        resolved: true,
      } as any,
    ]);
    const askConfirm = vi.fn().mockResolvedValue(false);
    const runner = new ActionRunner({
      isMobile: () => false,
      resolveDocId: () => "doc-1",
      askConfirm,
    } as any);

    await runner.runAction("toggle-links-refs" as any);

    expect(askConfirm).toHaveBeenCalledTimes(1);
    expect(String(askConfirm.mock.calls[0]?.[1] || "")).toContain("预计转换 1 处");
    expect(updateBlockMarkdownMock).not.toHaveBeenCalled();
  });

  test("converts refs to doc links when current document only has refs", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      {
        id: "a",
        type: "p",
        markdown: '- ((20260101101010-abcdef1 "Doc A"))',
        resolved: true,
      } as any,
      {
        id: "b",
        type: "p",
        markdown: "- ((20260202121212-bcdefg2))",
        resolved: true,
      } as any,
    ]);
    const runner = createRunner();

    await runner.runAction("toggle-links-refs" as any);

    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(2);
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(
      1,
      "a",
      "- [Doc A](siyuan://blocks/20260101101010-abcdef1)"
    );
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(
      2,
      "b",
      "- [20260202121212-bcdefg2](siyuan://blocks/20260202121212-bcdefg2)"
    );
    expect(showMessageMock).toHaveBeenCalledWith("已将 2 处引用转换为文档链接，共更新 2 个块", 5000, "info");
  });

  test("cleans ai output artifacts in current doc", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      {
        id: "a",
        type: "p",
        markdown: "正文 <sup>1</sup> ^^ [外链](https://example.com/a)",
        resolved: true,
      } as any,
      {
        id: "b",
        type: "p",
        markdown: "| col1 | [官网](https://example.com) |",
        resolved: true,
      } as any,
      {
        id: "c",
        type: "p",
        markdown: "保留 [Doc](siyuan://blocks/20260101101010-abcdef1)",
        resolved: true,
      } as any,
    ]);
    const askConfirm = vi.fn().mockResolvedValue(true);
    updateBlockMarkdownMock.mockResolvedValue(undefined);
    const runner = new ActionRunner({
      isMobile: () => false,
      resolveDocId: () => "doc-1",
      askConfirm,
    } as any);

    await runner.runAction("clean-ai-output" as any);

    expect(askConfirm).toHaveBeenCalledTimes(1);
    expect(askConfirm).toHaveBeenCalledWith(
      "确认清理AI输出内容",
      expect.stringContaining("上标 1 处，^^ 1 处，互联网链接 2 处")
    );
    expect(askConfirm).toHaveBeenCalledWith(
      "确认清理AI输出内容",
      expect.stringContaining("预计将更新 2 个块")
    );
    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(2);
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(1, "a", "正文");
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(2, "b", "| col1 | |");
    expect(showMessageMock).toHaveBeenCalledWith(
      "已清理 AI 输出残留：上标 1 处，^^ 1 处，互联网链接 2 处，共更新 2 个块",
      5000,
      "info"
    );
  });

  test("does not clean ai output when confirmation is canceled", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      {
        id: "a",
        type: "p",
        markdown: "正文 <sup>1</sup> ^^ [外链](https://example.com/a)",
        resolved: true,
      } as any,
    ]);
    const askConfirm = vi.fn().mockResolvedValue(false);
    const runner = new ActionRunner({
      isMobile: () => false,
      resolveDocId: () => "doc-1",
      askConfirm,
    } as any);

    await runner.runAction("clean-ai-output" as any);

    expect(askConfirm).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdownMock).not.toHaveBeenCalled();
    expect(showMessageMock).not.toHaveBeenCalled();
  });

  test("marks invalid links and refs in current doc with strike and highlight", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      {
        id: "a",
        type: "p",
        markdown:
          "- [Invalid Link](siyuan://blocks/20260101101010-abcdef1)\n- [Valid Link](siyuan://blocks/20260202121212-bcdefg2)",
        resolved: true,
      } as any,
      {
        id: "b",
        type: "p",
        markdown:
          "- ((20260303131313-cdefgh3))\n- [[20260404141414-defghi4]]",
        resolved: true,
      } as any,
    ]);
    getDocMetaByIDMock.mockImplementation(async (id: string) => {
      if (id === "20260202121212-bcdefg2") {
        return {
          id,
          parentId: "parent",
          rootId: id,
          box: "notebook",
          path: "/x.sy",
          hPath: "/Valid",
          updated: "2026-01-01",
          title: "Valid",
        } as any;
      }
      return null;
    });
    const runner = createRunner();

    await runner.runAction("mark-invalid-links-refs" as any);

    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(2);
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(
      1,
      "a",
      "- [==~~Invalid Link~~==](siyuan://blocks/20260101101010-abcdef1)\n- [Valid Link](siyuan://blocks/20260202121212-bcdefg2)"
    );
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(
      2,
      "b",
      "- ==~~((20260303131313-cdefgh3))~~==\n- ==~~[[20260404141414-defghi4]]~~=="
    );
    expect(showMessageMock).toHaveBeenCalledWith(
      "已标示 3 处无效链接/引用，共更新 2 个块",
      5000,
      "info"
    );
  });

  test("converts local images to webp for current doc", async () => {
    convertDocImagesToWebpMock.mockResolvedValue({
      scannedImageCount: 3,
      convertedImageCount: 2,
      skippedImageCount: 1,
      skippedGifCount: 1,
      failedImageCount: 0,
      replacedLinkCount: 3,
      updatedBlockCount: 2,
      totalSavedBytes: 2048,
    });
    const runner = createRunner();

    await runner.runAction("convert-images-to-webp" as any);

    expect(convertDocImagesToWebpMock).toHaveBeenCalledWith("doc-1");
    expect(showMessageMock).toHaveBeenCalledWith(
      "图片转换完成：替换 3 处，更新 2 个块，转换 2 张，节省 2.0 KB（已忽略 GIF 1 张）",
      6000,
      "info"
    );
  });

  test("converts local images to png for current doc and ignores gif", async () => {
    convertDocImagesToPngMock.mockResolvedValue({
      scannedImageCount: 3,
      convertedImageCount: 2,
      skippedImageCount: 1,
      failedImageCount: 0,
      replacedLinkCount: 2,
      updatedBlockCount: 1,
      totalSavedBytes: 0,
    });
    const runner = createRunner();

    await runner.runAction("convert-images-to-png" as any);

    expect(convertDocImagesToPngMock).toHaveBeenCalledWith("doc-1");
    expect(showMessageMock).toHaveBeenCalledWith(
      "PNG 转换完成：替换 2 处，更新 1 个块，转换 2 张（已忽略 GIF）",
      6000,
      "info"
    );
  });

  test("resizes local images by current display size for current doc", async () => {
    resizeDocImagesToDisplayMock.mockResolvedValue({
      scannedImageCount: 2,
      resizedImageCount: 2,
      skippedImageCount: 0,
      failedImageCount: 0,
      replacedLinkCount: 3,
      updatedBlockCount: 2,
      totalSavedBytes: 1536,
    });
    const runner = createRunner();

    await runner.runAction("resize-images-to-display" as any);

    expect(resizeDocImagesToDisplayMock).toHaveBeenCalledWith("doc-1");
    expect(showMessageMock).toHaveBeenCalledWith(
      "图片尺寸调整完成：替换 3 处，更新 2 个块，缩减 2 张，节省 1.5 KB",
      6000,
      "info"
    );
  });

  test("removes image links in current doc", async () => {
    removeDocImageLinksMock.mockResolvedValue({
      scannedImageLinkCount: 3,
      removedLinkCount: 3,
      updatedBlockCount: 2,
      failedBlockCount: 0,
    });
    const runner = createRunner();

    await runner.runAction("remove-doc-images" as any);

    expect(removeDocImageLinksMock).toHaveBeenCalledWith("doc-1");
    expect(showMessageMock).toHaveBeenCalledWith(
      "图片链接删除完成：删除 3 处，更新 2 个块",
      6000,
      "info"
    );
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

  test("shows no-op when move-forward-links confirmation is canceled", async () => {
    getForwardLinkedDocIdsMock.mockResolvedValue(["doc-a"]);
    const askConfirm = vi.fn().mockResolvedValue(false);
    const setBusy = vi.fn();
    const runner = new ActionRunner({
      isMobile: () => false,
      resolveDocId: () => "doc-1",
      askConfirm,
      setBusy,
    } as any);

    await runner.runAction("move-forward-links");

    expect(moveDocsAsChildrenMock).not.toHaveBeenCalled();
    expect(askConfirm).toHaveBeenCalledTimes(1);
  });

  test("reports move-forward-links result with error severity when failures exist", async () => {
    getForwardLinkedDocIdsMock.mockResolvedValue(["doc-a", "doc-b", "doc-c"]);
    moveDocsAsChildrenMock.mockResolvedValue({
      successIds: ["doc-a"],
      skippedIds: ["doc-c"],
      renamed: [{ id: "doc-a", title: "A(1)" }],
      failed: [{ id: "doc-b", error: "locked" }],
    });
    const runner = createRunner();

    await runner.runAction("move-forward-links");

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

    await dialogArgs.onInsertLinks([
      { id: "doc-a", title: "A" },
      { id: "doc-a", title: "A (dup)" },
      { id: "doc-b", title: "B" },
    ]);
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

  test("uses dom update for inline-memo block to avoid markdown downgrade", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      {
        id: "a",
        type: "p",
        markdown: "原文<sup>（备注内容）</sup>   ",
        resolved: true,
      } as any,
    ]);
    getBlockKramdownsMock.mockResolvedValueOnce([
      {
        id: "a",
        kramdown: "原文<sup>（备注内容）</sup>   \n{: id=\"20260224194151-abc1234\"}",
      } as any,
    ]);
    getBlockDOMsMock.mockResolvedValueOnce([
      {
        id: "a",
        dom: '<div data-node-id="a" data-type="NodeParagraph" class="p"><div contenteditable="true" spellcheck="false">原文<span data-type="inline-memo" data-inline-memo-content="备注内容">内容</span>   </div><div class="protyle-attr" contenteditable="false"></div></div>',
      } as any,
    ]);
    const runner = createRunner();

    await runner.runAction("trim-trailing-whitespace" as any);

    expect(updateBlockDomMock).toHaveBeenCalledTimes(1);
    expect(updateBlockDomMock).toHaveBeenCalledWith(
      "a",
      '<div data-node-id="a" data-type="NodeParagraph" class="p"><div contenteditable="true" spellcheck="false">原文<span data-type="inline-memo" data-inline-memo-content="备注内容">内容</span></div><div class="protyle-attr" contenteditable="false"></div></div>'
    );
    expect(updateBlockMarkdownMock).not.toHaveBeenCalled();
    expect(getBlockDOMMock).not.toHaveBeenCalled();
    expect(showMessageMock).toHaveBeenCalledWith("已清理 1 个块、1 行行尾空格", 5000, "info");
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

  test("preserves block-level IAL (memo) when cleaning trailing whitespace", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "p", markdown: "hello", resolved: true } as any,
    ]);
    getBlockKramdownsMock
      .mockResolvedValueOnce([{ id: "a", kramdown: 'hello   \n{: id="20260224194151-abc1234" memo="my note"}' } as any])
      .mockResolvedValueOnce([{ id: "a", kramdown: 'hello\n{: id="20260224194151-abc1234" memo="my note"}' } as any]);
    const runner = createRunner();

    await runner.runAction("trim-trailing-whitespace" as any);

    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdownMock).toHaveBeenCalledWith(
      "a",
      'hello\n{: id="20260224194151-abc1234" memo="my note"}'
    );
    expect(showMessageMock).toHaveBeenCalledWith("已清理 1 个块、1 行行尾空格", 5000, "info");
  });

  test("skips block-ref inline IAL block even when sql markdown has trailing whitespace", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      {
        id: "a",
        type: "p",
        markdown: '((20260224194151-abc1234)){: style="white-space:pre"}text  ',
        resolved: true,
      } as any,
    ]);
    getBlockKramdownsMock.mockResolvedValueOnce([
      { id: "a", kramdown: '((20260224194151-abc1234)){: style="white-space:pre"}text  ' } as any,
    ]);
    const runner = createRunner();

    await runner.runAction("trim-trailing-whitespace" as any);

    expect(updateBlockMarkdownMock).not.toHaveBeenCalled();
    expect(showMessageMock).toHaveBeenCalledWith("未发现需要清理的行尾空格", 4000, "info");
  });

  test("deletes all blocks from current block to end", async () => {
    getChildBlockRefsByParentIdMock.mockResolvedValue([
      { id: "a", type: "p" } as any,
      { id: "b", type: "p" } as any,
      { id: "c", type: "h" } as any,
    ]);
    deleteBlocksByIdsMock.mockResolvedValue({ deletedCount: 2, failedIds: [] });
    const runner = createRunner();
    const protyle = { block: { rootID: "doc-1", id: "b" } } as any;

    await runner.runAction("delete-from-current-to-end" as any, undefined, protyle);

    expect(getChildBlocksByParentIdMock).not.toHaveBeenCalled();
    expect(getChildBlockRefsByParentIdMock).toHaveBeenCalledWith("doc-1");
    expect(deleteBlocksByIdsMock).toHaveBeenCalledWith(["b", "c"], { concurrency: 6 });
    expect(showMessageMock).toHaveBeenCalledWith("已删除 2 个段落", 5000, "info");
  });

  test("falls back to active editor block id when protyle is missing", async () => {
    getChildBlockRefsByParentIdMock.mockResolvedValue([
      { id: "a", type: "p" } as any,
      { id: "b", type: "p" } as any,
      { id: "c", type: "p" } as any,
    ]);
    deleteBlocksByIdsMock.mockResolvedValue({ deletedCount: 2, failedIds: [] });
    getActiveEditorMock.mockReturnValue({
      protyle: { block: { id: "b" } },
    });
    const runner = createRunner();

    await runner.runAction("delete-from-current-to-end" as any);

    expect(deleteBlocksByIdsMock).toHaveBeenCalledWith(["b", "c"], { concurrency: 6 });
  });

  test("maps nested current block to direct child block before deleting", async () => {
    getChildBlockRefsByParentIdMock.mockResolvedValue([
      { id: "a", type: "p" } as any,
      { id: "b", type: "l" } as any,
      { id: "c", type: "p" } as any,
    ]);
    deleteBlocksByIdsMock.mockResolvedValue({ deletedCount: 2, failedIds: [] });
    resolveDocDirectChildBlockIdMock.mockResolvedValue("b");
    const runner = createRunner();
    const protyle = { block: { rootID: "doc-1", id: "b-sub-1" } } as any;

    await runner.runAction("delete-from-current-to-end" as any, undefined, protyle);

    expect(resolveDocDirectChildBlockIdMock).toHaveBeenCalledWith("doc-1", "b-sub-1");
    expect(deleteBlocksByIdsMock).toHaveBeenCalledWith(["b", "c"], { concurrency: 6 });
  });

  test("ignores doc id as current block and falls back to active editor block", async () => {
    getChildBlockRefsByParentIdMock.mockResolvedValue([
      { id: "a", type: "p" } as any,
      { id: "b", type: "p" } as any,
      { id: "c", type: "p" } as any,
    ]);
    deleteBlocksByIdsMock.mockResolvedValue({ deletedCount: 2, failedIds: [] });
    getActiveEditorMock.mockReturnValue({
      protyle: { block: { id: "b" } },
    });
    const runner = createRunner();
    const protyle = { block: { rootID: "doc-1", id: "doc-1" } } as any;

    await runner.runAction("delete-from-current-to-end" as any, undefined, protyle);

    expect(deleteBlocksByIdsMock).toHaveBeenCalledWith(["b", "c"], { concurrency: 6 });
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

  test("shows confirm summary before styling selected blocks", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="a" class="protyle-wysiwyg--select">A</div>
    `;
    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    getBlockKramdownsMock.mockResolvedValue([
      { id: "a", kramdown: "Hello" } as any,
    ]);
    const askConfirm = vi.fn().mockResolvedValue(false);
    const runner = new ActionRunner({
      isMobile: () => false,
      resolveDocId: () => "doc-1",
      askConfirm,
    } as any);

    await runner.runAction("bold-selected-blocks" as any, undefined, protyle);

    expect(askConfirm).toHaveBeenCalledTimes(1);
    expect(String(askConfirm.mock.calls[0]?.[1] || "")).toContain("预计更新 1 个块");
    expect(updateBlockMarkdownMock).not.toHaveBeenCalled();
  });

  test("shows heading bold stats and removes bold from all heading blocks after confirmation", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "h1", type: "h", markdown: "# **标题一**", resolved: true } as any,
      { id: "p1", type: "p", markdown: "正文", resolved: true } as any,
      { id: "h2", type: "h", markdown: "## 普通 **标题二**", resolved: true } as any,
      { id: "h3", type: "h", markdown: "### 标题三", resolved: true } as any,
    ]);
    const askConfirm = vi.fn().mockResolvedValue(true);
    updateBlockMarkdownMock.mockResolvedValue(undefined);
    const runner = new ActionRunner({
      isMobile: () => false,
      resolveDocId: () => "doc-1",
      askConfirm,
    } as any);

    await runner.runAction("toggle-heading-bold" as any);

    expect(askConfirm).toHaveBeenCalledTimes(1);
    const confirmText = String(askConfirm.mock.calls[0]?.[1] || "");
    expect(confirmText).toContain("标题总数 3 个");
    expect(confirmText).toContain("含加粗 2 个");
    expect(confirmText).toContain("未加粗 1 个");
    expect(confirmText).toContain("操作：取消所有标题块加粗");
    expect(confirmText).toContain("预计更新 2 个块");
    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(2);
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(1, "h1", "# 标题一");
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(2, "h2", "## 普通 标题二");
  });

  test("adds bold to all heading blocks when none of them are bold", async () => {
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "h1", type: "h", markdown: "# 标题一", resolved: true } as any,
      { id: "h2", type: "h", markdown: "## 标题二 {: id=\"h2\"}", resolved: true } as any,
    ]);
    const askConfirm = vi.fn().mockResolvedValue(true);
    updateBlockMarkdownMock.mockResolvedValue(undefined);
    const runner = new ActionRunner({
      isMobile: () => false,
      resolveDocId: () => "doc-1",
      askConfirm,
    } as any);

    await runner.runAction("toggle-heading-bold" as any);

    expect(askConfirm).toHaveBeenCalledTimes(1);
    expect(String(askConfirm.mock.calls[0]?.[1] || "")).toContain("操作：加粗所有标题块");
    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(2);
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(1, "h1", "# **标题一**");
    expect(updateBlockMarkdownMock).toHaveBeenNthCalledWith(2, "h2", "## **标题二**");
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

  test("merges selected content into one list block while preserving existing list indentation", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="a" class="protyle-wysiwyg--select">A</div>
      <div data-node-id="b" class="protyle-wysiwyg--select">B</div>
      <div data-node-id="c" class="protyle-wysiwyg--select">C</div>
    `;
    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "p", content: "A", markdown: "第一段", resolved: true } as any,
      { id: "b", type: "i", content: "B", markdown: "1. 第二项", resolved: true } as any,
      {
        id: "c",
        type: "NodeList",
        content: "C",
        markdown: "- 第三项\n  1. 第四项\n    第四项说明",
        resolved: true,
      } as any,
    ]);
    const askConfirm = vi.fn().mockResolvedValue(true);
    updateBlockMarkdownMock.mockResolvedValue(undefined);
    const runner = new ActionRunner({
      isMobile: () => false,
      resolveDocId: () => "doc-1",
      askConfirm,
    } as any);

    await runner.runAction("merge-selected-list-blocks" as any, undefined, protyle);

    expect(askConfirm).toHaveBeenCalledTimes(1);
    const confirmText = String(askConfirm.mock.calls[0]?.[1] || "");
    expect(confirmText).toContain("范围：选中块 3 个");
    expect(confirmText).toContain("普通段落转列表项 1 个");
    expect(confirmText).toContain("预计更新 1 个块，删除 2 个块");
    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdownMock).toHaveBeenCalledWith(
      "a",
      "- 第一段\n- 第二项\n- 第三项\n  - 第四项\n    第四项说明"
    );
    expect(deleteBlocksByIdsMock).toHaveBeenCalledWith(["b", "c"], { concurrency: 6 });
    expect(deleteBlockByIdMock).not.toHaveBeenCalled();
  });

  test("does not merge selected list blocks when confirmation is canceled", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="a" class="protyle-wysiwyg--select">A</div>
      <div data-node-id="b" class="protyle-wysiwyg--select">B</div>
    `;
    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "p", content: "A", markdown: "第一段", resolved: true } as any,
      { id: "b", type: "p", content: "B", markdown: "第二段", resolved: true } as any,
    ]);
    const askConfirm = vi.fn().mockResolvedValue(false);
    const runner = new ActionRunner({
      isMobile: () => false,
      resolveDocId: () => "doc-1",
      askConfirm,
    } as any);

    await runner.runAction("merge-selected-list-blocks" as any, undefined, protyle);

    expect(askConfirm).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdownMock).not.toHaveBeenCalled();
    expect(deleteBlocksByIdsMock).not.toHaveBeenCalled();
    expect(deleteBlockByIdMock).not.toHaveBeenCalled();
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

  test("removes spaces-like chars only inside partial text selection within a single block", async () => {
    const root = document.createElement("div");
    root.innerHTML = `<div data-node-id="a">前缀A B\tC\u200BD后缀</div>`;
    document.body.appendChild(root);
    const textNode = root.querySelector("[data-node-id='a']")?.firstChild as Text | null;
    expect(textNode).toBeTruthy();

    const source = textNode?.nodeValue || "";
    const start = source.indexOf("A");
    const end = source.indexOf("D") + 1;
    const range = document.createRange();
    range.setStart(textNode as Text, start);
    range.setEnd(textNode as Text, end);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    const runner = createRunner();

    await runner.runAction("remove-selected-spacing" as any, undefined, protyle);

    const blockText = root.querySelector("[data-node-id='a']")?.textContent || "";
    expect(blockText).toBe("前缀ABCD后缀");
    expect(updateBlockMarkdownMock).not.toHaveBeenCalled();
    expect(getBlockKramdownsMock).not.toHaveBeenCalled();

    selection?.removeAllRanges();
    root.remove();
  });

  test("removes spaces-like chars from whole selected blocks", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="a" class="protyle-wysiwyg--select">甲 乙\t丙</div>
      <div data-node-id="b" class="protyle-wysiwyg--select">丁\u200B 戊</div>
    `;
    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    const runner = createRunner();

    await runner.runAction("remove-selected-spacing" as any, undefined, protyle);

    expect(root.querySelector("[data-node-id='a']")?.textContent).toBe("甲乙丙");
    expect(root.querySelector("[data-node-id='b']")?.textContent).toBe("丁戊");
    expect(updateBlockMarkdownMock).not.toHaveBeenCalled();
    expect(getBlockKramdownsMock).not.toHaveBeenCalled();
  });

  test("toggles punctuation only inside partial text selection within a single block", async () => {
    const root = document.createElement("div");
    root.innerHTML = `<div data-node-id="a">前缀Hello, world!后缀</div>`;
    document.body.appendChild(root);
    const textNode = root.querySelector("[data-node-id='a']")?.firstChild as Text | null;
    expect(textNode).toBeTruthy();

    const source = textNode?.nodeValue || "";
    const start = source.indexOf("Hello");
    const end = source.indexOf("!") + 1;
    const range = document.createRange();
    range.setStart(textNode as Text, start);
    range.setEnd(textNode as Text, end);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    const runner = createRunner();

    await runner.runAction("toggle-selected-punctuation" as any, undefined, protyle);

    const blockText = root.querySelector("[data-node-id='a']")?.textContent || "";
    expect(blockText).toBe("前缀Hello， world！后缀");
    expect(updateBlockMarkdownMock).not.toHaveBeenCalled();
    expect(getBlockKramdownsMock).not.toHaveBeenCalled();

    selection?.removeAllRanges();
    root.remove();
  });

  test("toggles punctuation for whole selected blocks with one shared mode", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="a" class="protyle-wysiwyg--select">你好，世界！</div>
      <div data-node-id="b" class="protyle-wysiwyg--select">继续；测试？</div>
    `;
    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    const runner = createRunner();

    await runner.runAction("toggle-selected-punctuation" as any, undefined, protyle);

    expect(root.querySelector("[data-node-id='a']")?.textContent).toBe("你好,世界!");
    expect(root.querySelector("[data-node-id='b']")?.textContent).toBe("继续;测试?");
    expect(updateBlockMarkdownMock).not.toHaveBeenCalled();
    expect(getBlockKramdownsMock).not.toHaveBeenCalled();
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

  test("splits selected block single line breaks into paragraph marks by default", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="a" class="protyle-wysiwyg--select">A</div>
      <div data-node-id="b">B</div>
    `;
    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "p", content: "A", markdown: "第一行\n第二行", resolved: true } as any,
      { id: "b", type: "p", content: "B", markdown: "保持不变", resolved: true } as any,
    ]);
    const askConfirm = vi.fn().mockResolvedValue(true);
    updateBlockMarkdownMock.mockResolvedValue(undefined);
    const runner = new ActionRunner({
      isMobile: () => false,
      resolveDocId: () => "doc-1",
      askConfirm,
    } as any);

    await runner.runAction("toggle-linebreaks-paragraphs" as any, undefined, protyle);

    expect(askConfirm).toHaveBeenCalledTimes(1);
    expect(String(askConfirm.mock.calls[0]?.[1] || "")).toContain("模式：换行转分段");
    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdownMock).toHaveBeenCalledWith("a", "第一行\n\n第二行");
    expect(deleteBlockByIdMock).not.toHaveBeenCalled();
  });

  test("prefers converting line breaks to paragraphs when selection has both line breaks and paragraphs", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="a" class="protyle-wysiwyg--select">A</div>
      <div data-node-id="b" class="protyle-wysiwyg--select">B</div>
    `;
    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "p", content: "A", markdown: "第一行\n第二行", resolved: true } as any,
      { id: "b", type: "p", content: "B", markdown: "第二段", resolved: true } as any,
    ]);
    const askConfirm = vi.fn().mockResolvedValue(true);
    const runner = new ActionRunner({
      isMobile: () => false,
      resolveDocId: () => "doc-1",
      askConfirm,
    } as any);

    await runner.runAction("toggle-linebreaks-paragraphs" as any, undefined, protyle);

    expect(askConfirm).toHaveBeenCalledTimes(1);
    expect(String(askConfirm.mock.calls[0]?.[1] || "")).toContain("模式：换行转分段");
    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdownMock).toHaveBeenCalledWith("a", "第一行\n\n第二行");
    expect(deleteBlockByIdMock).not.toHaveBeenCalled();
  });

  test("merges selected paragraph blocks into one block separated by line breaks", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="a" class="protyle-wysiwyg--select">A</div>
      <div data-node-id="b" class="protyle-wysiwyg--select">B</div>
      <div data-node-id="c">C</div>
    `;
    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "p", content: "A", markdown: "第一段", resolved: true } as any,
      { id: "b", type: "p", content: "B", markdown: "第二段", resolved: true } as any,
      { id: "c", type: "h", content: "C", markdown: "# 标题", resolved: true } as any,
    ]);
    const askConfirm = vi.fn().mockResolvedValue(true);
    const runner = new ActionRunner({
      isMobile: () => false,
      resolveDocId: () => "doc-1",
      askConfirm,
    } as any);

    await runner.runAction("toggle-linebreaks-paragraphs" as any, undefined, protyle);

    expect(askConfirm).toHaveBeenCalledTimes(1);
    expect(String(askConfirm.mock.calls[0]?.[1] || "")).toContain("模式：分段转换行");
    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdownMock).toHaveBeenCalledWith("a", "第一段\n第二段");
    expect(deleteBlocksByIdsMock).toHaveBeenCalledWith(["b"], { concurrency: 6 });
    expect(deleteBlockByIdMock).not.toHaveBeenCalled();
  });

  test("treats NodeParagraph blocks as mergeable paragraph blocks", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="a" class="protyle-wysiwyg--select">A</div>
      <div data-node-id="b" class="protyle-wysiwyg--select">B</div>
    `;
    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "NodeParagraph", content: "A", markdown: "第一段", resolved: false } as any,
      { id: "b", type: "NodeParagraph", content: "B", markdown: "第二段", resolved: false } as any,
    ]);
    const askConfirm = vi.fn().mockResolvedValue(true);
    const runner = new ActionRunner({
      isMobile: () => false,
      resolveDocId: () => "doc-1",
      askConfirm,
    } as any);

    await runner.runAction("toggle-linebreaks-paragraphs" as any, undefined, protyle);

    expect(askConfirm).toHaveBeenCalledTimes(1);
    expect(String(askConfirm.mock.calls[0]?.[1] || "")).toContain("模式：分段转换行");
    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdownMock).toHaveBeenCalledWith("a", "第一段\n第二段");
    expect(deleteBlocksByIdsMock).toHaveBeenCalledWith(["b"], { concurrency: 6 });
    expect(deleteBlockByIdMock).not.toHaveBeenCalled();
  });

  test("merges selected unordered list item blocks", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="a" class="protyle-wysiwyg--select">A</div>
      <div data-node-id="b" class="protyle-wysiwyg--select">B</div>
    `;
    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "i", content: "A", markdown: "- 第一项", resolved: true } as any,
      { id: "b", type: "i", content: "B", markdown: "- 第二项", resolved: true } as any,
    ]);
    const askConfirm = vi.fn().mockResolvedValue(true);
    const runner = new ActionRunner({
      isMobile: () => false,
      resolveDocId: () => "doc-1",
      askConfirm,
    } as any);

    await runner.runAction("toggle-linebreaks-paragraphs" as any, undefined, protyle);

    expect(askConfirm).toHaveBeenCalledTimes(1);
    expect(String(askConfirm.mock.calls[0]?.[1] || "")).toContain("模式：分段转换行");
    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdownMock).toHaveBeenCalledWith("a", "- 第一项\n- 第二项");
    expect(deleteBlocksByIdsMock).toHaveBeenCalledWith(["b"], { concurrency: 6 });
    expect(deleteBlockByIdMock).not.toHaveBeenCalled();
  });

  test("merges selected ordered list item blocks", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="a" class="protyle-wysiwyg--select">A</div>
      <div data-node-id="b" class="protyle-wysiwyg--select">B</div>
    `;
    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "NodeListItem", content: "A", markdown: "1. 第一项", resolved: false } as any,
      { id: "b", type: "NodeListItem", content: "B", markdown: "2. 第二项", resolved: false } as any,
    ]);
    const askConfirm = vi.fn().mockResolvedValue(true);
    const runner = new ActionRunner({
      isMobile: () => false,
      resolveDocId: () => "doc-1",
      askConfirm,
    } as any);

    await runner.runAction("toggle-linebreaks-paragraphs" as any, undefined, protyle);

    expect(askConfirm).toHaveBeenCalledTimes(1);
    expect(String(askConfirm.mock.calls[0]?.[1] || "")).toContain("模式：分段转换行");
    expect(updateBlockMarkdownMock).toHaveBeenCalledTimes(1);
    expect(updateBlockMarkdownMock).toHaveBeenCalledWith("a", "1. 第一项\n2. 第二项");
    expect(deleteBlocksByIdsMock).toHaveBeenCalledWith(["b"], { concurrency: 6 });
    expect(deleteBlockByIdMock).not.toHaveBeenCalled();
  });

  test("shows prompt only and does nothing when no block is selected", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="a">A</div>
      <div data-node-id="b">B</div>
    `;
    const protyle = { block: { rootID: "doc-1" }, wysiwyg: { element: root } } as any;
    getChildBlocksByParentIdMock.mockResolvedValue([
      { id: "a", type: "p", content: "A", markdown: "第一段", resolved: true } as any,
      { id: "b", type: "p", content: "B", markdown: "第二段", resolved: true } as any,
    ]);
    const askConfirm = vi.fn().mockResolvedValue(true);
    const runner = new ActionRunner({
      isMobile: () => false,
      resolveDocId: () => "doc-1",
      askConfirm,
    } as any);

    await runner.runAction("toggle-linebreaks-paragraphs" as any, undefined, protyle);

    expect(showMessageMock).toHaveBeenCalledWith("未选中任何内容，请先选中后再操作", 5000, "info");
    expect(askConfirm).not.toHaveBeenCalled();
    expect(updateBlockMarkdownMock).not.toHaveBeenCalled();
    expect(deleteBlockByIdMock).not.toHaveBeenCalled();
  });
});
