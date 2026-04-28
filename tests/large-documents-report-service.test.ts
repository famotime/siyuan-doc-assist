import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/services/kernel", () => ({
  createDocWithMd: vi.fn(),
  getDocAssets: vi.fn(),
  getDocMetaByID: vi.fn(),
  getFileBlob: vi.fn(),
  getNotebookConf: vi.fn(),
  listNotebookDocs: vi.fn(),
  renderSprigTemplate: vi.fn(),
  statAsset: vi.fn(),
}));

import {
  createDocWithMd,
  getDocAssets,
  getDocMetaByID,
  getFileBlob,
  getNotebookConf,
  listNotebookDocs,
  renderSprigTemplate,
  statAsset,
} from "@/services/kernel";
import { createTop100LargeDocumentsReport } from "@/services/large-documents-report";

const createDocWithMdMock = vi.mocked(createDocWithMd);
const getDocAssetsMock = vi.mocked(getDocAssets);
const getDocMetaByIDMock = vi.mocked(getDocMetaByID);
const getFileBlobMock = vi.mocked(getFileBlob);
const getNotebookConfMock = vi.mocked(getNotebookConf);
const listNotebookDocsMock = vi.mocked(listNotebookDocs);
const renderSprigTemplateMock = vi.mocked(renderSprigTemplate);
const statAssetMock = vi.mocked(statAsset);

describe("large documents report service", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("creates the report under the Daily Note parent path and sums doc plus asset bytes", async () => {
    getDocMetaByIDMock.mockResolvedValue({
      id: "doc-1",
      box: "nb-1",
      hPath: "/项目/当前文档",
      title: "当前文档",
    } as any);
    getNotebookConfMock.mockResolvedValue({
      box: "nb-1",
      conf: {
        dailyNoteSavePath: "/daily/{{now}}",
      },
    } as any);
    renderSprigTemplateMock.mockResolvedValue("/daily/2026/04/2026-04-27");
    listNotebookDocsMock.mockResolvedValue([
      {
        id: "20260426112233-doca",
        box: "nb-1",
        path: "/a.sy",
        hPath: "/资料/A 文档",
        updated: "20260427100000",
        title: "A 文档",
      },
    ] as any);
    getFileBlobMock.mockResolvedValue(new Blob(["1234"]));
    getDocAssetsMock.mockResolvedValue(["assets/shared.png", "assets/shared.png"]);
    statAssetMock.mockResolvedValue({ size: 20 } as any);
    createDocWithMdMock.mockResolvedValue("report-doc");

    const result = await createTop100LargeDocumentsReport({
      currentDocId: "doc-1",
      now: new Date("2026-04-27T15:30:15+08:00"),
    });

    expect(createDocWithMdMock).toHaveBeenCalledWith(
      "nb-1",
      "/daily/2026/04/Top100大文件清单-20260427-153015",
      expect.stringContaining("| 1 | [A 文档](siyuan://blocks/20260426112233-doca) | 24 B | 4 B | 20 B | 1 | 2026-04-26 | 2026-04-27 |")
    );
    expect(statAssetMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      id: "report-doc",
      title: "Top100大文件清单-20260427-153015",
      path: "/daily/2026/04/Top100大文件清单-20260427-153015",
      docCount: 1,
    });
  });

  test("throws readable error when notebook daily note path is not configured", async () => {
    getDocMetaByIDMock.mockResolvedValue({
      id: "doc-1",
      box: "nb-1",
      hPath: "/项目/当前文档",
      title: "当前文档",
    } as any);
    getNotebookConfMock.mockResolvedValue({
      box: "nb-1",
      conf: {
        dailyNoteSavePath: "",
      },
    } as any);

    await expect(
      createTop100LargeDocumentsReport({
        currentDocId: "doc-1",
        now: new Date("2026-04-27T15:30:15+08:00"),
      })
    ).rejects.toThrow("当前笔记本未配置 Daily Note 保存路径");
  });

  test("continues building report when doc asset lookup fails", async () => {
    getDocMetaByIDMock.mockResolvedValue({
      id: "doc-1",
      box: "nb-1",
      hPath: "/项目/当前文档",
      title: "当前文档",
    } as any);
    getNotebookConfMock.mockResolvedValue({
      box: "nb-1",
      conf: {
        dailyNoteSavePath: "/daily/{{now}}",
      },
    } as any);
    renderSprigTemplateMock.mockResolvedValue("/daily/2026/04/2026-04-27");
    listNotebookDocsMock.mockResolvedValue([
      {
        id: "20260426112233-doca",
        box: "nb-1",
        path: "/a.sy",
        hPath: "/资料/A 文档",
        updated: "20260427100000",
        title: "A 文档",
      },
    ] as any);
    getFileBlobMock.mockResolvedValue(new Blob(["1234"]));
    getDocAssetsMock.mockRejectedValue(new Error("asset lookup failed"));
    createDocWithMdMock.mockResolvedValue("report-doc");

    await createTop100LargeDocumentsReport({
      currentDocId: "doc-1",
      now: new Date("2026-04-27T15:30:15+08:00"),
    });

    expect(createDocWithMdMock).toHaveBeenCalledWith(
      "nb-1",
      "/daily/2026/04/Top100大文件清单-20260427-153015",
      expect.stringContaining("| 1 | [A 文档](siyuan://blocks/20260426112233-doca) | 4 B | 4 B | 0 B | 0 | 2026-04-26 | 2026-04-27 |")
    );
  });
});
