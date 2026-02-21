import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/services/kernel", () => ({
  exportMdContent: vi.fn(),
  getForwardRefTargetBlockIds: vi.fn(),
  getBacklink2: vi.fn(),
  getDocMetasByIDs: vi.fn(),
  getRootDocRawMarkdown: vi.fn(),
  mapBlockIdsToRootDocIds: vi.fn(),
}));

import { getForwardLinkedDocIds } from "@/services/link-resolver";
import {
  exportMdContent,
  getForwardRefTargetBlockIds,
  getDocMetasByIDs,
  getRootDocRawMarkdown,
  mapBlockIdsToRootDocIds,
} from "@/services/kernel";

describe("link-resolver forward links", () => {
  const exportMdContentMock = vi.mocked(exportMdContent);
  const getForwardRefTargetBlockIdsMock = vi.mocked(getForwardRefTargetBlockIds);
  const getDocMetasByIDsMock = vi.mocked(getDocMetasByIDs);
  const getRootDocRawMarkdownMock = vi.mocked(getRootDocRawMarkdown);
  const mapBlockIdsToRootDocIdsMock = vi.mocked(mapBlockIdsToRootDocIds);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("extracts both ((id)) and siyuan:// links for forward export", async () => {
    exportMdContentMock.mockResolvedValue({
      hPath: "/demo/current",
      content: [
        "((20260101101010-abcdeF1))",
        "(( 20260404141414-DEFGH45 \"alias\" ))",
        "[[20260505151515-efghi56]]",
        "[ref](siyuan://blocks/20260202121212-bcdefg2)",
        "[ref2](SiYuan://blocks/20260303131313-cdefgh3?focus=1#L2)",
      ].join("\n"),
    });

    getForwardRefTargetBlockIdsMock.mockResolvedValue([]);
    mapBlockIdsToRootDocIdsMock.mockResolvedValue([
      "current-doc",
      "doc-a",
      "doc-b",
      "doc-a",
      "doc-c",
      "doc-d",
    ]);
    getRootDocRawMarkdownMock.mockResolvedValue("");
    getDocMetasByIDsMock.mockResolvedValue([]);

    const ids = await getForwardLinkedDocIds("current-doc");

    expect(exportMdContentMock).toHaveBeenCalledWith("current-doc", {
      refMode: 3,
      embedMode: 0,
      addTitle: false,
      yfm: false,
    });

    expect(mapBlockIdsToRootDocIdsMock).toHaveBeenCalledWith([
      "20260101101010-abcdeF1",
      "20260404141414-DEFGH45",
      "20260202121212-bcdefg2",
      "20260303131313-cdefgh3",
      "20260505151515-efghi56",
    ]);

    expect(ids).toEqual(["doc-a", "doc-b", "doc-c", "doc-d"]);
  });

  test("falls back to direct doc ids when root mapping returns empty", async () => {
    exportMdContentMock.mockResolvedValue({
      hPath: "/demo/current",
      content: [
        "[a](siyuan://blocks/20260220075025-ue88wkc)",
        "[b](siyuan://blocks/20260220220208-esrmvws)",
        "((20260221114249-31dbi9g 'OpenClaw 安装 Skills'))",
      ].join("\n"),
    });

    getForwardRefTargetBlockIdsMock.mockResolvedValue([]);
    mapBlockIdsToRootDocIdsMock.mockResolvedValue([]);
    getRootDocRawMarkdownMock.mockResolvedValue("");
    getDocMetasByIDsMock.mockResolvedValue([
      {
        id: "20260220075025-ue88wkc",
      } as any,
      {
        id: "20260220220208-esrmvws",
      } as any,
      {
        id: "20260221114249-31dbi9g",
      } as any,
    ]);

    const ids = await getForwardLinkedDocIds("current-doc");

    expect(getDocMetasByIDsMock).toHaveBeenCalledTimes(1);
    expect(
      [...(getDocMetasByIDsMock.mock.calls[0][0] as string[])].sort()
    ).toEqual([
      "20260220075025-ue88wkc",
      "20260220220208-esrmvws",
      "20260221114249-31dbi9g",
    ]);

    expect(ids).toEqual([
      "20260220075025-ue88wkc",
      "20260220220208-esrmvws",
      "20260221114249-31dbi9g",
    ]);
  });

  test("falls back to extracted block ids when mapping and doc lookup both empty", async () => {
    exportMdContentMock.mockResolvedValue({
      hPath: "/demo/current",
      content: [
        "[a](siyuan://blocks/20260220075025-ue88wkc)",
        "((20260221114249-31dbi9g 'OpenClaw 安装 Skills'))",
      ].join("\n"),
    });

    getForwardRefTargetBlockIdsMock.mockResolvedValue([]);
    mapBlockIdsToRootDocIdsMock.mockResolvedValue([]);
    getRootDocRawMarkdownMock.mockResolvedValue("");
    getDocMetasByIDsMock.mockResolvedValue([]);

    const ids = await getForwardLinkedDocIds("current-doc");

    expect([...ids].sort()).toEqual([
      "20260220075025-ue88wkc",
      "20260221114249-31dbi9g",
    ]);
  });

  test("uses raw root markdown fallback when export markdown loses ids", async () => {
    exportMdContentMock.mockResolvedValue({
      hPath: "/demo/current",
      content: "- OpenClaw 日常操作 2026-02-20\n- 鹿导：OpenClaw",
    });
    getRootDocRawMarkdownMock.mockResolvedValue([
      "[a](siyuan://blocks/20260220075025-ue88wkc)",
      "((20260221114249-31dbi9g 'OpenClaw 安装 Skills'))",
    ].join("\n"));
    getForwardRefTargetBlockIdsMock.mockResolvedValue([]);
    mapBlockIdsToRootDocIdsMock.mockResolvedValue([]);
    getDocMetasByIDsMock.mockResolvedValue([]);

    const ids = await getForwardLinkedDocIds("current-doc");

    expect([...ids].sort()).toEqual([
      "20260220075025-ue88wkc",
      "20260221114249-31dbi9g",
    ]);
  });

  test("prefers refs table targets when available", async () => {
    exportMdContentMock.mockResolvedValue({
      hPath: "/demo/current",
      content: "- visible list without ids",
    });
    getRootDocRawMarkdownMock.mockResolvedValue("raw may contain noisy links");
    getForwardRefTargetBlockIdsMock.mockResolvedValue([
      "20260220075025-ue88wkc",
      "20260220220208-esrmvws",
      "20260221114249-31dbi9g",
    ]);
    mapBlockIdsToRootDocIdsMock.mockResolvedValue([
      "20260220075025-ue88wkc",
      "20260220220208-esrmvws",
      "20260221114249-31dbi9g",
    ]);
    getDocMetasByIDsMock.mockResolvedValue([]);

    const ids = await getForwardLinkedDocIds("current-doc");

    expect(getForwardRefTargetBlockIdsMock).toHaveBeenCalledWith("current-doc");
    expect(ids).toEqual([
      "20260220075025-ue88wkc",
      "20260220220208-esrmvws",
      "20260221114249-31dbi9g",
    ]);
  });

  test("merges refs results with markdown results when refs are partial", async () => {
    exportMdContentMock.mockResolvedValue({
      hPath: "/demo/current",
      content: [
        "[a](siyuan://blocks/20260220075025-ue88wkc)",
        "[b](siyuan://blocks/20260220220208-esrmvws)",
        "((20260221114249-31dbi9g 'OpenClaw 安装 Skills'))",
        "((20260218190049-71xqxuy))",
        "((20260215060020-fivungd))",
      ].join("\n"),
    });
    getRootDocRawMarkdownMock.mockResolvedValue("");
    getForwardRefTargetBlockIdsMock.mockResolvedValue([
      "20260215060020-fivungd",
      "20260221114249-31dbi9g",
    ]);
    mapBlockIdsToRootDocIdsMock.mockImplementation(async (ids: string[]) => ids);
    getDocMetasByIDsMock.mockResolvedValue([]);

    const ids = await getForwardLinkedDocIds("current-doc");

    expect([...ids].sort()).toEqual([
      "20260215060020-fivungd",
      "20260218190049-71xqxuy",
      "20260220075025-ue88wkc",
      "20260220220208-esrmvws",
      "20260221114249-31dbi9g",
    ]);
  });
});
