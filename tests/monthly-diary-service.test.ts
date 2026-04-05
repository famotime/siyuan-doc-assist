import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/services/kernel", () => ({
  createDocWithMd: vi.fn(),
  getDocMetaByID: vi.fn(),
  getNotebookConf: vi.fn(),
  renderSprigTemplate: vi.fn(),
}));

import {
  createDocWithMd,
  getDocMetaByID,
  getNotebookConf,
  renderSprigTemplate,
} from "@/services/kernel";
import { createMonthlyDiaryDoc } from "@/services/monthly-diary";

const createDocWithMdMock = vi.mocked(createDocWithMd);
const getDocMetaByIDMock = vi.mocked(getDocMetaByID);
const getNotebookConfMock = vi.mocked(getNotebookConf);
const renderSprigTemplateMock = vi.mocked(renderSprigTemplate);

describe("monthly diary service", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("creates a monthly diary under current notebook daily note directory", async () => {
    getDocMetaByIDMock.mockResolvedValue({
      id: "doc-1",
      box: "nb-1",
      hPath: "/项目/当前文档",
      title: "当前文档",
    } as any);
    getNotebookConfMock.mockResolvedValue({
      box: "nb-1",
      conf: {
        dailyNoteSavePath: "/daily note/{{now | date \"2006/01\"}}/{{now | date \"2006-01-02\"}}",
      },
    } as any);
    renderSprigTemplateMock.mockResolvedValue("/daily note/2026/04/2026-04-05");
    createDocWithMdMock.mockResolvedValue("monthly-doc");

    const result = await createMonthlyDiaryDoc({
      currentDocId: "doc-1",
      template: "## {{date}} {{weekday}}\n\n- 记录",
      now: new Date("2026-04-05T10:00:00+08:00"),
    });

    expect(renderSprigTemplateMock).toHaveBeenCalledWith(
      "/daily note/{{now | date \"2006/01\"}}/{{now | date \"2006-01-02\"}}"
    );
    expect(createDocWithMdMock).toHaveBeenCalledWith(
      "nb-1",
      "/daily note/2026/04/2026-04 月记",
      expect.stringContaining("## 2026-04-01 周三")
    );
    expect(result).toEqual({
      dayCount: 30,
      id: "monthly-doc",
      path: "/daily note/2026/04/2026-04 月记",
      title: "2026-04 月记",
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
      createMonthlyDiaryDoc({
        currentDocId: "doc-1",
        now: new Date("2026-04-05T10:00:00+08:00"),
      })
    ).rejects.toThrow("当前笔记本未配置 Daily Note 保存路径");
  });
});
