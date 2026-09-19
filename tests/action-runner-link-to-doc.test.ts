// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOrganizeActionHandlers } from "@/plugin/action-runner-organize-handlers";
import { exportMdContent } from "@/services/kernel";
import { clipWebLinksToDocs, fetchLinkTitles } from "@/services/link-to-doc-service";
import { openLinkToDocDialog } from "@/ui/link-to-doc-dialog";
import { showMessage } from "siyuan";

vi.mock("@/services/kernel", () => ({
  appendBlock: vi.fn(),
  getChildBlocksByParentId: vi.fn(),
  exportMdContent: vi.fn(),
}));

vi.mock("@/services/link-resolver", () => ({
  getBacklinkDocs: vi.fn(),
  getForwardLinkedDocIds: vi.fn(),
}));

vi.mock("@/services/large-documents-report", () => ({
  createTop100LargeDocumentsReport: vi.fn(),
}));

vi.mock("@/services/mover", () => ({
  moveDocsAsChildren: vi.fn(),
}));

vi.mock("@/services/open-doc-summary", () => ({
  createOpenedDocsSummaryDoc: vi.fn(),
}));

vi.mock("@/services/dedupe", () => ({
  deleteDocsByIds: vi.fn(),
  findDuplicateCandidates: vi.fn(),
}));

vi.mock("@/ui/dialogs", () => ({
  openDedupeDialog: vi.fn(),
}));

vi.mock("@/services/split-doc-by-headings", () => ({
  splitDocByHeadings: vi.fn(),
}));

vi.mock("@/services/floating-text/floating-text-service", () => ({
  floatingTextService: {
    openFloatingText: vi.fn(),
    openFloatingDoc: vi.fn(),
  },
}));

vi.mock("@/services/floating-text/floating-selection-helper", () => ({
  extractFloatingMarkdownFromSelection: vi.fn(),
}));

vi.mock("@/services/link-to-doc-service", () => ({
  clipWebLinksToDocs: vi.fn(),
  fetchLinkTitles: vi.fn(),
}));

vi.mock("@/ui/link-to-doc-dialog", () => ({
  openLinkToDocDialog: vi.fn(),
}));

vi.mock("siyuan", () => ({
  showMessage: vi.fn(),
}));

const mockExportMdContent = vi.mocked(exportMdContent);
const mockClipWebLinksToDocs = vi.mocked(clipWebLinksToDocs);
const mockFetchLinkTitles = vi.mocked(fetchLinkTitles);
const mockOpenLinkToDocDialog = vi.mocked(openLinkToDocDialog);
const mockShowMessage = vi.mocked(showMessage);

describe("action-runner-organize link-to-doc", () => {
  const askConfirmMock = vi.fn();
  const ensureDocWritableMock = vi.fn().mockResolvedValue(true);
  const setBusyMock = vi.fn();

  const handlers = createOrganizeActionHandlers({
    askConfirmWithVisibleDialog: askConfirmMock,
    ensureDocWritable: ensureDocWritableMock,
    setBusy: setBusyMock,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("notifies when document contains no valid web links", async () => {
    mockExportMdContent.mockResolvedValueOnce({
      hPath: "/测试",
      content: "这是一篇没有任何外部链接的普通文档。",
    });

    await handlers["link-to-doc"]("doc-1");
    expect(mockShowMessage).toHaveBeenCalledWith(
      "当前文档未找到可转化的外部网页链接",
      4000,
      "info"
    );
    expect(mockClipWebLinksToDocs).not.toHaveBeenCalled();
    expect(mockOpenLinkToDocDialog).not.toHaveBeenCalled();
  });

  it("directly executes clipping without dialog when only one link is found", async () => {
    mockExportMdContent.mockResolvedValueOnce({
      hPath: "/测试",
      content: "这是一个参考链接：[教程](https://example.com/single-post)",
    });

    mockClipWebLinksToDocs.mockResolvedValueOnce({
      total: 1,
      successCount: 1,
      failedCount: 0,
      createdDocIds: ["new-id"],
      errors: [],
    });

    await handlers["link-to-doc"]("doc-1");

    expect(mockOpenLinkToDocDialog).not.toHaveBeenCalled();
    expect(mockClipWebLinksToDocs).toHaveBeenCalledWith("doc-1", [
      {
        url: "https://example.com/single-post",
        originalUrl: "https://example.com/single-post",
        fallbackTitle: "教程",
      },
    ]);
    expect(mockShowMessage).toHaveBeenCalledWith("成功剪藏 1 篇网页文档", 4000, "info");
  });

  it("fetches titles and opens dialog for multiple links, then clips selected items", async () => {
    mockExportMdContent.mockResolvedValueOnce({
      hPath: "/测试",
      content: `
        [文章一](https://example.com/1)
        [文章二](https://example.com/2)
      `,
    });

    mockFetchLinkTitles.mockResolvedValueOnce([
      {
        url: "https://example.com/1",
        originalUrl: "https://example.com/1",
        fallbackTitle: "文章一",
        title: "真实标题一",
        hasFetchedTitle: true,
      },
      {
        url: "https://example.com/2",
        originalUrl: "https://example.com/2",
        fallbackTitle: "文章二",
        title: "真实标题二",
        hasFetchedTitle: true,
      },
    ]);

    mockClipWebLinksToDocs.mockResolvedValueOnce({
      total: 1,
      successCount: 1,
      failedCount: 0,
      createdDocIds: ["id-1"],
      errors: [],
    });

    await handlers["link-to-doc"]("doc-1");

    expect(mockFetchLinkTitles).toHaveBeenCalledTimes(1);
    expect(mockOpenLinkToDocDialog).toHaveBeenCalledTimes(1);

    // 模拟用户在弹窗中只勾选了第一项并点击确认
    const dialogArgs = mockOpenLinkToDocDialog.mock.calls[0][0];
    expect(dialogArgs.items).toHaveLength(2);

    await dialogArgs.onConfirm([dialogArgs.items[0]]);

    expect(mockClipWebLinksToDocs).toHaveBeenCalledWith(
      "doc-1",
      [dialogArgs.items[0]],
      expect.any(Function)
    );
    expect(mockShowMessage).toHaveBeenCalledWith(
      "链接转文档完成：成功剪藏 1 篇文档",
      5000,
      "info"
    );
  });
});
