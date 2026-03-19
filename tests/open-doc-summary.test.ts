// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/services/kernel", () => ({
  createDocWithMd: vi.fn(),
  getDocMetaByID: vi.fn(),
}));

vi.mock("@/services/request", () => ({
  requestApi: vi.fn(),
}));

import { createDocWithMd, getDocMetaByID } from "@/services/kernel";
import { requestApi } from "@/services/request";
import {
  collectOpenedUnpinnedDocs,
  createOpenedDocsSummaryDoc,
} from "@/services/open-doc-summary";

const createDocWithMdMock = vi.mocked(createDocWithMd);
const getDocMetaByIDMock = vi.mocked(getDocMetaByID);
const requestApiMock = vi.mocked(requestApi);

describe("open-doc-summary service", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete (window as any).siyuan;
    vi.useRealTimers();
  });

  test("collects unique editor docs from opened unpinned tabs", async () => {
    const pinHead = document.createElement("div");
    pinHead.className = "item item--pin";
    (window as any).siyuan = {
      layout: {
        centerLayout: {
          children: [
            {
              children: [
                {
                  pin: false,
                  title: "文档 A",
                  model: { notebookId: "nb", rootId: "doc-a" },
                },
                {
                  pin: false,
                  title: "文档 A 副本",
                  model: { notebookId: "nb", rootId: "doc-a" },
                },
                {
                  title: "文档 B",
                  headElement: pinHead,
                  model: { notebookId: "nb", rootId: "doc-b" },
                },
                {
                  pin: false,
                  title: "非编辑器页签",
                  model: { notebookId: "nb" },
                },
                {
                  children: [
                    {
                      pin: false,
                      title: "文档 C",
                      model: { notebookId: "nb", rootId: "doc-c" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    };

    await expect(collectOpenedUnpinnedDocs()).resolves.toEqual([
      { id: "doc-a", notebookId: "nb", title: "文档 A" },
      { id: "doc-c", notebookId: "nb", title: "文档 C" },
    ]);
  });

  test("collects docs nested under container nodes that also expose tab-like fields", async () => {
    const containerHead = document.createElement("div");
    (window as any).siyuan = {
      layout: {
        centerLayout: {
          children: [
            {
              title: "编辑区容器",
              headElement: containerHead,
              children: [
                {
                  pin: false,
                  title: "文档 A",
                  model: { notebookId: "nb", rootId: "doc-a" },
                },
                {
                  pin: false,
                  title: "文档 B",
                  model: { notebookId: "nb", rootId: "doc-b" },
                },
              ],
            },
          ],
        },
      },
    };

    await expect(collectOpenedUnpinnedDocs()).resolves.toEqual([
      { id: "doc-a", notebookId: "nb", title: "文档 A" },
      { id: "doc-b", notebookId: "nb", title: "文档 B" },
    ]);
  });

  test("collects docs from system uiLayout tabs returned by getConf", async () => {
    requestApiMock.mockResolvedValue({
      conf: {
        uiLayout: {
          layout: {
            children: [
              {
                children: [
                  {
                    children: [
                      {
                        instance: "Tab",
                        pin: true,
                        title: "~Skills",
                        children: {
                          instance: "Editor",
                          notebookId: "nb",
                          rootId: "doc-pinned",
                        },
                      },
                      {
                        instance: "Tab",
                        pin: false,
                        title: "反链测试",
                        children: {
                          instance: "Editor",
                          notebookId: "nb",
                          rootId: "doc-a",
                        },
                      },
                      {
                        instance: "Tab",
                        pin: false,
                        title: "README",
                        children: {
                          instance: "Editor",
                          notebookId: "nb",
                          rootId: "doc-b",
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    } as any);

    await expect(collectOpenedUnpinnedDocs()).resolves.toEqual([
      { id: "doc-a", notebookId: "nb", title: "反链测试" },
      { id: "doc-b", notebookId: "nb", title: "README" },
    ]);
    expect(requestApiMock).toHaveBeenCalledWith("/api/system/getConf");
  });

  test("creates summary doc beside current doc with opened doc links", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17T09:08:07+08:00"));
    (window as any).siyuan = {
      layout: {
        centerLayout: {
          children: [
            {
              children: [
                {
                  pin: false,
                  title: "当前文档",
                  model: { notebookId: "nb", rootId: "doc-1" },
                },
                {
                  pin: false,
                  title: "参考文档",
                  model: { notebookId: "nb", rootId: "doc-2" },
                },
              ],
            },
          ],
        },
      },
    };
    getDocMetaByIDMock.mockResolvedValue({
      id: "doc-1",
      box: "nb",
      hPath: "/项目/当前文档",
      title: "当前文档",
    } as any);
    createDocWithMdMock.mockResolvedValue("summary-doc");

    const result = await createOpenedDocsSummaryDoc("doc-1");

    expect(createDocWithMdMock).toHaveBeenCalledWith(
      "nb",
      "/项目/已打开文档汇总页-20260317-090807",
      "- [当前文档](siyuan://blocks/doc-1)\n- [参考文档](siyuan://blocks/doc-2)"
    );
    expect(result).toEqual({
      docCount: 2,
      id: "summary-doc",
      title: "已打开文档汇总页-20260317-090807",
    });
  });
});
