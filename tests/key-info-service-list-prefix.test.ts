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
  getDocMetaByID,
  getDocTreeOrderFromSy,
  getRootDocRawMarkdown,
  sql,
} from "@/services/kernel";

const sqlMock = vi.mocked(sql);
const getDocMetaByIDMock = vi.mocked(getDocMetaByID);
const getDocTreeOrderFromSyMock = vi.mocked(getDocTreeOrderFromSy);
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

describe("key-info service list prefix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDocMetaByIDMock.mockResolvedValue({ id: "doc-1", title: "文档标题" } as any);
    getDocTreeOrderFromSyMock.mockResolvedValue(new Map());
    getRootDocRawMarkdownMock.mockResolvedValue("");
  });

  test("dedupes list item inline items when one source has decorated text", async () => {
    mockKernelSql(
      [
        {
          id: "i-1",
          parent_id: "doc-1",
          sort: 1,
          type: "i",
          subtype: "",
          content: "测试",
          markdown: "- **测试**",
          memo: "",
          tag: "",
        },
      ],
      [
        {
          id: "s-1",
          block_id: "i-1",
          root_id: "doc-1",
          content: "-测试",
          markdown: "- **测试**",
          type: "strong",
          block_sort: 1,
        },
      ]
    );

    const result = await getDocKeyInfo("doc-1");
    const listBold = result.items.filter((item) => item.blockId === "i-1" && item.type === "bold");

    expect(listBold).toHaveLength(1);
    expect(listBold[0]?.text).toBe("测试");
    expect((listBold[0] as any)?.listPrefix).toBe("- ");
  });

  test("does not add list prefix for paragraph content inside list item", async () => {
    mockKernelSql([
      {
        id: "i-1",
        parent_id: "doc-1",
        sort: 1,
        type: "i",
        subtype: "",
        content: "普通项目",
        markdown: "- 普通项目",
        memo: "",
        tag: "",
      },
      {
        id: "p-1",
        parent_id: "i-1",
        sort: 2,
        type: "p",
        subtype: "",
        content: "段落",
        markdown: "**段落测试**",
        memo: "",
        tag: "",
      },
    ]);

    const result = await getDocKeyInfo("doc-1");
    const paragraphBold = result.items.find((item) => item.blockId === "p-1" && item.type === "bold");

    expect(paragraphBold?.text).toBe("段落测试");
    expect((paragraphBold as any)?.listPrefix).toBeUndefined();
  });

  test("adds list prefix for first list-line paragraph child content", async () => {
    mockKernelSql(
      [
        {
          id: "i-1",
          parent_id: "doc-1",
          sort: 1,
          type: "i",
          subtype: "",
          content: "Skills 基本概念",
          markdown: "- **Skills 基本概念**",
          memo: "",
          tag: "",
        },
        {
          id: "p-1",
          parent_id: "i-1",
          sort: 2,
          type: "p",
          subtype: "",
          content: "Skills 基本概念",
          markdown: "**Skills 基本概念**",
          memo: "",
          tag: "",
        },
      ],
      [
        {
          id: "s-1",
          block_id: "p-1",
          root_id: "doc-1",
          content: "Skills 基本概念",
          markdown: "**Skills 基本概念**",
          type: "strong",
          block_sort: 2,
        },
      ]
    );

    const result = await getDocKeyInfo("doc-1");
    const listBoldOnParagraph = result.items.find(
      (item) => item.blockId === "p-1" && item.type === "bold"
    );

    expect(listBoldOnParagraph?.text).toBe("Skills 基本概念");
    expect((listBoldOnParagraph as any)?.listPrefix).toBe("- ");
  });

  test("adds list prefix when list item content includes first paragraph text", async () => {
    mockKernelSql(
      [
        {
          id: "i-1",
          parent_id: "doc-1",
          sort: 1,
          type: "i",
          subtype: "",
          content: "Skills 基本概念 概念定义 Claude Skills 被比喻为...",
          markdown: "- **Skills 基本概念**",
          memo: "",
          tag: "",
        },
        {
          id: "p-1",
          parent_id: "i-1",
          sort: 2,
          type: "p",
          subtype: "",
          content: "Skills 基本概念",
          markdown: "**Skills 基本概念**",
          memo: "",
          tag: "",
        },
      ],
      [
        {
          id: "s-1",
          block_id: "p-1",
          root_id: "doc-1",
          content: "Skills 基本概念",
          markdown: "**Skills 基本概念**",
          type: "strong",
          block_sort: 2,
        },
      ]
    );

    const result = await getDocKeyInfo("doc-1");
    const listBoldOnParagraph = result.items.find(
      (item) => item.blockId === "p-1" && item.type === "bold"
    );

    expect(listBoldOnParagraph?.text).toBe("Skills 基本概念");
    expect((listBoldOnParagraph as any)?.listPrefix).toBe("- ");
  });

  test("skips list container and mapped list-item markdown inline extraction", async () => {
    mockKernelSql([
      {
        id: "l-1",
        parent_id: "doc-1",
        sort: 1,
        type: "l",
        subtype: "",
        content: "",
        markdown: "- **Skills 基**",
        memo: "",
        tag: "",
      },
      {
        id: "i-1",
        parent_id: "l-1",
        sort: 2,
        type: "i",
        subtype: "",
        content: "Skills 基",
        markdown: "- **Skills 基**",
        memo: "",
        tag: "",
      },
      {
        id: "p-1",
        parent_id: "i-1",
        sort: 3,
        type: "p",
        subtype: "",
        content: "Skills 基",
        markdown: "**Skills 基**",
        memo: "",
        tag: "",
      },
    ]);

    const result = await getDocKeyInfo("doc-1");
    const boldSkills = result.items.filter((item) => item.type === "bold" && item.text === "Skills 基");

    expect(boldSkills.find((item) => item.blockId === "l-1")).toBeUndefined();
    expect(boldSkills.find((item) => item.blockId === "i-1")).toBeUndefined();
    expect(boldSkills.find((item) => item.blockId === "p-1")).toBeTruthy();
    expect((boldSkills.find((item) => item.blockId === "p-1") as any)?.listPrefix).toBe("- ");
  });

  test("keeps original ordered list index as list prefix", async () => {
    mockKernelSql([
      {
        id: "i-1",
        parent_id: "doc-1",
        sort: 1,
        type: "i",
        subtype: "",
        content: "编号测试",
        markdown: "3. **编号测试**",
        memo: "",
        tag: "",
      },
    ]);

    const result = await getDocKeyInfo("doc-1");
    const listBold = result.items.find((item) => item.blockId === "i-1" && item.type === "bold");

    expect(listBold?.text).toBe("编号测试");
    expect((listBold as any)?.listPrefix).toBe("3. ");
  });
});
