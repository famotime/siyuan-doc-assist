import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/services/kernel", () => ({
  getBlockKramdowns: vi.fn(),
  getDocMetaByID: vi.fn(),
  getDocTreeOrderFromSy: vi.fn(),
  getRootDocRawMarkdown: vi.fn(),
  sql: vi.fn(),
}));

import { getDocKeyInfo } from "@/services/key-info";
import {
  getBlockKramdowns,
  getDocMetaByID,
  getDocTreeOrderFromSy,
  getRootDocRawMarkdown,
  sql,
} from "@/services/kernel";

const sqlMock = vi.mocked(sql);
const getDocMetaByIDMock = vi.mocked(getDocMetaByID);
const getDocTreeOrderFromSyMock = vi.mocked(getDocTreeOrderFromSy);
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
  ial?: string;
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
    getDocTreeOrderFromSyMock.mockResolvedValue(new Map());
    getBlockKramdownsMock.mockResolvedValue([]);
    getRootDocRawMarkdownMock.mockResolvedValue("");
  });

  test("passes loaded doc meta into sy-order query to avoid duplicate SQL lookup", async () => {
    mockKernelSql([
      {
        id: "doc-1",
        sort: 1,
        type: "p",
        subtype: "",
        content: "正文",
        markdown: "正文",
        memo: "",
        tag: "",
      },
    ]);

    await getDocKeyInfo("doc-1");

    expect(getDocMetaByIDMock).toHaveBeenCalledWith("doc-1");
    expect(getDocTreeOrderFromSyMock).toHaveBeenCalledWith(
      "doc-1",
      expect.objectContaining({ id: "doc-1", title: "文档标题" })
    );
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

  test("prefers .sy structural order over DB sort when they conflict", async () => {
    mockKernelSql([
      {
        id: "h-1",
        parent_id: "doc-1",
        sort: 200,
        type: "h",
        subtype: "h1",
        content: "第一节",
        markdown: "# 第一节",
        memo: "",
        tag: "",
      },
      {
        id: "p-1",
        parent_id: "h-1",
        sort: 210,
        type: "p",
        subtype: "",
        content: "A",
        markdown: "**A**",
        memo: "",
        tag: "",
      },
      {
        id: "h-2",
        parent_id: "doc-1",
        sort: 10,
        type: "h",
        subtype: "h1",
        content: "第二节",
        markdown: "# 第二节",
        memo: "",
        tag: "",
      },
      {
        id: "p-2",
        parent_id: "h-2",
        sort: 20,
        type: "p",
        subtype: "",
        content: "B",
        markdown: "**B**",
        memo: "",
        tag: "",
      },
    ]);
    getDocTreeOrderFromSyMock.mockResolvedValue(
      new Map([
        ["h-1", 0],
        ["p-1", 1],
        ["h-2", 2],
        ["p-2", 3],
      ])
    );

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

  test("keeps early block tags before later section headings by .sy order", async () => {
    mockKernelSql([
      {
        id: "p-1",
        parent_id: "doc-1",
        sort: 900,
        type: "p",
        subtype: "",
        content: "前文段落",
        markdown: "前文内容",
        memo: "",
        tag: "前文标签",
      },
      {
        id: "h-2",
        parent_id: "doc-1",
        sort: 1,
        type: "h",
        subtype: "h2",
        content: "后文标题",
        markdown: "## 后文标题",
        memo: "",
        tag: "",
      },
    ]);
    getDocTreeOrderFromSyMock.mockResolvedValue(
      new Map([
        ["p-1", 0],
        ["h-2", 1],
      ])
    );

    const result = await getDocKeyInfo("doc-1");
    const sequence = result.items
      .filter((item) => item.blockId !== "doc-1")
      .map((item) => `${item.type}:${item.text}`);

    expect(sequence).toEqual([
      "tag:前文标签",
      "title:后文标题",
    ]);
  });

  test("falls back to structural order when .sy coverage is too low", async () => {
    mockKernelSql([
      {
        id: "h-1",
        parent_id: "doc-1",
        sort: 200,
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
        sort: 10,
        type: "h",
        subtype: "h1",
        content: "第二节",
        markdown: "# 第二节",
        memo: "",
        tag: "",
      },
      {
        id: "h-3",
        parent_id: "doc-1",
        sort: 20,
        type: "h",
        subtype: "h1",
        content: "第三节",
        markdown: "# 第三节",
        memo: "",
        tag: "",
      },
    ]);
    // only 1/3 blocks hit, below 0.85 threshold
    getDocTreeOrderFromSyMock.mockResolvedValue(
      new Map([["h-1", 0]])
    );

    const result = await getDocKeyInfo("doc-1");
    const titles = result.items
      .filter((item) => item.type === "title" && item.blockId !== "doc-1")
      .map((item) => item.text);

    expect(titles).toEqual([
      "第二节",
      "第三节",
      "第一节",
    ]);
  });

  test("ignores root document markdown extraction when child blocks exist", async () => {
    mockKernelSql([
      {
        id: "doc-1",
        parent_id: "",
        sort: 0,
        type: "d",
        subtype: "",
        content: "文档标题",
        markdown: "## 译者后记\n==末尾高亮==\n#末尾标签",
        memo: "",
        tag: "",
      },
      {
        id: "h-1",
        parent_id: "doc-1",
        sort: 1,
        type: "h",
        subtype: "h2",
        content: "推荐序",
        markdown: "## 推荐序",
        memo: "",
        tag: "",
      },
      {
        id: "h-2",
        parent_id: "doc-1",
        sort: 2,
        type: "h",
        subtype: "h2",
        content: "译者后记",
        markdown: "## 译者后记",
        memo: "",
        tag: "",
      },
    ]);
    getDocTreeOrderFromSyMock.mockResolvedValue(
      new Map([
        ["doc-1", 0],
        ["h-1", 1],
        ["h-2", 2],
      ])
    );

    const result = await getDocKeyInfo("doc-1");

    expect(
      result.items.some(
        (item) => item.blockId === "doc-1" && item.text === "译者后记"
      )
    ).toBe(false);
    expect(
      result.items.some(
        (item) => item.blockId === "doc-1" && item.type === "highlight" && item.text === "末尾高亮"
      )
    ).toBe(false);
    expect(
      result.items.some(
        (item) => item.blockId === "doc-1" && item.type === "tag" && item.text === "末尾标签"
      )
    ).toBe(false);
  });

  test("removes links from highlight and splits inline code into code type", async () => {
    mockKernelSql([
      {
        id: "p-1",
        parent_id: "doc-1",
        sort: 1,
        type: "p",
        subtype: "",
        content: "正文",
        markdown: "==[官网](https://example.com)==\n==示例 `pnpm test` [文档](https://example.com/doc)==",
        memo: "",
        tag: "",
      },
    ]);

    const result = await getDocKeyInfo("doc-1");
    const paragraphItems = result.items.filter((item) => item.blockId === "p-1");

    expect(
      paragraphItems.some((item) => item.type === "highlight" && item.text === "官网")
    ).toBe(false);
    expect(
      paragraphItems.some((item) => item.type === "highlight" && item.text === "示例")
    ).toBe(true);
    expect(
      paragraphItems.some((item) => item.type === "code" && item.text === "pnpm test")
    ).toBe(true);
  });

  test("keeps only one remark item and formats as 原文（备注）", async () => {
    mockKernelSql(
      [
        {
          id: "i-1",
          parent_id: "doc-1",
          sort: 1,
          type: "p",
          subtype: "",
          content: "原文标注内容",
          markdown: "原文标注内容",
          memo: "备注内容",
          tag: "",
        },
      ],
      [
        {
          id: "s-memo-1",
          block_id: "p-1",
          root_id: "doc-1",
          content: "原文标注内容",
          markdown: "原文标注内容",
          type: "inline-memo",
          ial: `inline-memo="备注内容"`,
          block_sort: 1,
        },
      ]
    );

    const result = await getDocKeyInfo("doc-1");
    const remarks = result.items.filter((item) => item.type === "remark");

    expect(remarks).toHaveLength(1);
    expect(remarks[0]?.text).toBe("原文标注内容（备注内容）");
  });

  test("keeps bold complete when block has both bold and highlight", async () => {
    mockKernelSql(
      [
        {
          id: "p-1",
          parent_id: "doc-1",
          sort: 1,
          type: "p",
          subtype: "",
          content: "123456789",
          markdown: "**123****==456==****789**",
          memo: "",
          tag: "",
        },
      ],
      [
        {
          id: "s-b-1",
          block_id: "p-1",
          root_id: "doc-1",
          content: "123",
          markdown: "**123**",
          type: "strong",
          block_sort: 1,
        },
        {
          id: "s-h-1",
          block_id: "p-1",
          root_id: "doc-1",
          content: "456",
          markdown: "==456==",
          type: "mark",
          block_sort: 1,
        },
        {
          id: "s-b-2",
          block_id: "p-1",
          root_id: "doc-1",
          content: "456",
          markdown: "**==456==**",
          type: "strong",
          block_sort: 1,
        },
        {
          id: "s-b-3",
          block_id: "p-1",
          root_id: "doc-1",
          content: "789",
          markdown: "**789**",
          type: "strong",
          block_sort: 1,
        },
      ]
    );

    const result = await getDocKeyInfo("doc-1");
    const blockItems = result.items.filter((item) => item.blockId === "p-1");
    const boldItems = blockItems.filter((item) => item.type === "bold");
    const highlightItems = blockItems.filter((item) => item.type === "highlight");

    expect(boldItems).toHaveLength(1);
    expect(boldItems[0]?.text).toBe("123456789");
    expect(highlightItems).toHaveLength(1);
    expect(highlightItems[0]?.text).toBe("456");
  });

  test("prefers 原文（备注） and removes weaker 原文 备注 duplicate", async () => {
    mockKernelSql(
      [
        {
          id: "p-1",
          parent_id: "doc-1",
          sort: 1,
          type: "p",
          subtype: "",
          content: "原文内容",
          markdown: "原文内容",
          memo: "",
          tag: "",
        },
      ],
      [
        {
          id: "s-memo-weak",
          block_id: "p-1",
          root_id: "doc-1",
          content: "原文内容 备注",
          markdown: "原文内容 备注",
          type: "inline-memo",
          block_sort: 1,
        },
        {
          id: "s-memo-strong",
          block_id: "p-1",
          root_id: "doc-1",
          content: "原文内容",
          markdown: "原文内容",
          type: "inline-memo",
          ial: `inline-memo="备注"`,
          block_sort: 1,
        },
      ]
    );

    const result = await getDocKeyInfo("doc-1");
    const remarks = result.items.filter((item) => item.blockId === "p-1" && item.type === "remark");

    expect(remarks).toHaveLength(1);
    expect(remarks[0]?.text).toBe("原文内容（备注）");
  });
});
