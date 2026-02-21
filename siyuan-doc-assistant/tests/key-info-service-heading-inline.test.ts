import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/services/kernel", () => ({
  getBlockKramdowns: vi.fn(),
  getDocMetaByID: vi.fn(),
  getRootDocRawMarkdown: vi.fn(),
  sql: vi.fn(),
}));

import { getDocKeyInfo } from "@/services/key-info";
import {
  getBlockKramdowns,
  getDocMetaByID,
  getRootDocRawMarkdown,
  sql,
} from "@/services/kernel";

const sqlMock = vi.mocked(sql);
const getDocMetaByIDMock = vi.mocked(getDocMetaByID);
const getBlockKramdownsMock = vi.mocked(getBlockKramdowns);
const getRootDocRawMarkdownMock = vi.mocked(getRootDocRawMarkdown);

type SqlRow = {
  id: string;
  parent_id?: string;
  sort: number;
  type: string;
  subtype: string;
  content: string;
  markdown: string;
  memo: string;
  tag: string;
};

type SpanRow = {
  id: string;
  block_id: string;
  root_id: string;
  content: string;
  markdown: string;
  type: string;
  block_sort?: number;
};

function mockKernelSql(rows: SqlRow[], spans: SpanRow[] = []) {
  sqlMock.mockImplementation(async (stmt: string) => {
    const normalized = stmt.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.includes("select root_id from blocks where id='doc-1'")) {
      return [{ root_id: "doc-1" }];
    }
    if (
      normalized.includes("from blocks") &&
      normalized.includes("where root_id='doc-1'")
    ) {
      return rows;
    }
    if (normalized.includes("pragma table_info(spans)")) {
      return [];
    }
    if (normalized.includes("from spans")) {
      return spans;
    }
    return [];
  });
}

describe("key-info service heading inline merge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDocMetaByIDMock.mockResolvedValue({ id: "doc-1", title: "文档标题" } as any);
    getBlockKramdownsMock.mockResolvedValue([]);
    getRootDocRawMarkdownMock.mockResolvedValue("");
  });

  test("keeps heading as title and ignores heading markdown inline key info", async () => {
    mockKernelSql([
      {
        id: "h1",
        sort: 1,
        type: "h",
        subtype: "h1",
        content: "标题一",
        markdown: "# **标题一**",
        memo: "",
        tag: "",
      },
      {
        id: "p1",
        sort: 2,
        type: "p",
        subtype: "",
        content: "正文",
        markdown: "正文 **正文加粗** 与 #正文标签",
        memo: "",
        tag: "",
      },
    ]);

    const result = await getDocKeyInfo("doc-1");
    const headingInlineItems = result.items.filter(
      (item) => item.blockId === "h1" && item.type !== "title"
    );
    const bodyBold = result.items.find(
      (item) => item.blockId === "p1" && item.type === "bold" && item.text === "正文加粗"
    );
    const bodyTag = result.items.find(
      (item) => item.blockId === "p1" && item.type === "tag" && item.text === "正文标签"
    );

    expect(result.items.some((item) => item.blockId === "h1" && item.type === "title")).toBe(true);
    expect(headingInlineItems).toHaveLength(0);
    expect(bodyBold).toBeTruthy();
    expect(bodyTag).toBeTruthy();
  });

  test("filters out spans extracted from heading blocks", async () => {
    mockKernelSql(
      [
        {
          id: "h1",
          sort: 1,
          type: "h",
          subtype: "h1",
          content: "标题一",
          markdown: "# 标题一",
          memo: "",
          tag: "",
        },
        {
          id: "p1",
          sort: 2,
          type: "p",
          subtype: "",
          content: "正文",
          markdown: "正文",
          memo: "",
          tag: "",
        },
      ],
      [
        {
          id: "s-h",
          block_id: "h1",
          root_id: "doc-1",
          content: "标题加粗",
          markdown: "**标题加粗**",
          type: "strong",
          block_sort: 1,
        },
        {
          id: "s-p",
          block_id: "p1",
          root_id: "doc-1",
          content: "正文加粗",
          markdown: "**正文加粗**",
          type: "strong",
          block_sort: 2,
        },
      ]
    );

    const result = await getDocKeyInfo("doc-1");

    expect(
      result.items.some(
        (item) => item.blockId === "h1" && item.type === "bold" && item.text === "标题加粗"
      )
    ).toBe(false);
    expect(
      result.items.some(
        (item) => item.blockId === "p1" && item.type === "bold" && item.text === "正文加粗"
      )
    ).toBe(true);
  });

  test("keeps DB block order when protyle DOM only has partial blocks", async () => {
    mockKernelSql([
      {
        id: "h-1",
        sort: 10,
        type: "h",
        subtype: "h1",
        content: "1 第一节",
        markdown: "# 1 第一节",
        memo: "",
        tag: "",
      },
      {
        id: "h-10",
        sort: 20,
        type: "h",
        subtype: "h1",
        content: "10 第十节",
        markdown: "# 10 第十节",
        memo: "",
        tag: "",
      },
    ]);

    const fakeProtyle = {
      wysiwyg: {
        element: {
          querySelectorAll: (selector: string) => {
            if (selector === "[data-node-id]") {
              return [
                {
                  dataset: { nodeId: "h-10" },
                  getAttribute: (name: string) =>
                    name === "data-node-id" ? "h-10" : null,
                },
              ];
            }
            return [];
          },
        },
      },
    };

    const result = await getDocKeyInfo("doc-1", fakeProtyle as any);
    const titleTexts = result.items
      .filter((item) => item.type === "title")
      .map((item) => item.text);

    expect(titleTexts).toEqual(["文档标题", "1 第一节", "10 第十节"]);
  });

  test("interleaves heading and content by structural block order", async () => {
    mockKernelSql([
      {
        id: "h-1",
        parent_id: "doc-1",
        sort: 1,
        type: "h",
        subtype: "h1",
        content: "第一节",
        markdown: "# 第一节",
        memo: "",
        tag: "",
      },
      {
        id: "h-2",
        parent_id: "doc-1",
        sort: 2,
        type: "h",
        subtype: "h1",
        content: "第二节",
        markdown: "# 第二节",
        memo: "",
        tag: "",
      },
      {
        id: "p-1",
        parent_id: "h-1",
        sort: 100,
        type: "p",
        subtype: "",
        content: "A",
        markdown: "**A**",
        memo: "",
        tag: "",
      },
      {
        id: "p-2",
        parent_id: "h-2",
        sort: 100,
        type: "p",
        subtype: "",
        content: "B",
        markdown: "**B**",
        memo: "",
        tag: "",
      },
    ]);

    const result = await getDocKeyInfo("doc-1");
    const sequence = result.items
      .filter((item) => item.blockId !== "doc-1")
      .map((item) => `${item.type}:${item.text}`);

    expect(sequence).toEqual([
      "title:第一节",
      "bold:A",
      "title:第二节",
      "bold:B",
    ]);
  });
});
