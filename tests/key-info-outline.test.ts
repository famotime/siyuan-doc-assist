import { beforeEach, describe, expect, test, vi } from "vitest";
import { fetchSyncPost } from "siyuan";
import { getDocKeyInfo } from "@/services/key-info";
import {
  decodeOutlineHtmlToText,
  flattenDocOutlineNodes,
  getDocOutlineItems
} from "@/services/key-info-outline";

vi.mock("siyuan", () => ({
  fetchSyncPost: vi.fn()
}));

describe("key-info-outline service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("decodes outline HTML fragments and entities into clean plain text", () => {
    expect(
      decodeOutlineHtmlToText(
        '<span style="color: red;">第一章&nbsp;&amp;&nbsp;概览</span><br/>副标题&#39;A&#x21; '
      )
    ).toBe("第一章 & 概览 副标题'A!");
  });

  test("flattens nested outline paths and blocks with monotonic order", () => {
    const items = flattenDocOutlineNodes([
      {
        id: "h1-a",
        name: "<span>一级章节</span>",
        subType: "h1",
        blocks: [
          {
            id: "h2-a",
            content: "二级子节",
            subType: "h2",
            children: [
              { id: "h3-a", content: "三级条目", subType: "h3" }
            ]
          }
        ]
      },
      {
        id: "h1-b",
        name: "第二章",
        subType: "h1"
      }
    ]);

    expect(items).toHaveLength(4);
    expect(items.map((item) => ({
      blockId: item.blockId,
      level: item.headingLevel,
      text: item.text,
      order: item.order,
      blockSort: item.blockSort
    }))).toEqual([
      { blockId: "h1-a", level: 1, text: "一级章节", order: 0, blockSort: 0 },
      { blockId: "h2-a", level: 2, text: "二级子节", order: 1, blockSort: 1 },
      { blockId: "h3-a", level: 3, text: "三级条目", order: 2, blockSort: 2 },
      { blockId: "h1-b", level: 1, text: "第二章", order: 3, blockSort: 3 }
    ]);
  });

  test("fetches outline via /api/outline/getDocOutline without kramdown RPCs and prepends doc title when missing", async () => {
    const postMock = vi.mocked(fetchSyncPost);
    postMock.mockImplementation(async (url: string) => {
      if (url === "/api/outline/getDocOutline") {
        return {
          code: 0,
          msg: "",
          data: [
            { id: "h-1", name: "背景", subType: "h1" },
            { id: "h-2", name: "方案", subType: "h2" }
          ]
        };
      }
      if (url === "/api/query/sql") {
        return {
          code: 0,
          msg: "",
          data: [
            {
              id: "doc-1",
              parent_id: "",
              root_id: "doc-1",
              box: "box-1",
              path: "/doc-1.sy",
              hpath: "/测试长文档",
              updated: "20261122150000"
            }
          ]
        };
      }
      throw new Error(`unexpected api call: ${url}`);
    });

    const result = await getDocOutlineItems("doc-1");
    expect(result.docId).toBe("doc-1");
    expect(result.docTitle).toBe("测试长文档");
    expect(result.items.map((i) => ({ blockId: i.blockId, text: i.text, order: i.order }))).toEqual([
      { blockId: "doc-1", text: "测试长文档", order: -1 },
      { blockId: "h-1", text: "背景", order: 0 },
      { blockId: "h-2", text: "方案", order: 1 }
    ]);
    expect(postMock.mock.calls.some(([url]) => url === "/api/block/getBlockKramdowns")).toBe(false);
  });

  test("falls back to heading-only SQL when getDocOutline fails", async () => {
    const postMock = vi.mocked(fetchSyncPost);
    postMock.mockImplementation(async (url: string, body?: any) => {
      if (url === "/api/outline/getDocOutline") {
        return { code: -1, msg: "outline unavailable", data: null };
      }
      if (url === "/api/query/sql") {
        const stmt = String(body?.stmt || "");
        if (stmt.includes("where type='d'")) {
          return {
            code: 0,
            msg: "",
            data: [
              {
                id: "doc-2",
                parent_id: "",
                root_id: "doc-2",
                box: "box-1",
                path: "/doc-2.sy",
                hpath: "/一级回退标题",
                updated: "20261122150000"
              }
            ]
          };
        }
        if (stmt.includes("and type='h'")) {
          return {
            code: 0,
            msg: "",
            data: [
              { id: "h-10", subtype: "h1", content: "一级回退标题", sort: 10 },
              { id: "h-20", subtype: "h2", content: "二级回退标题", sort: 20 }
            ]
          };
        }
      }
      return { code: 0, msg: "", data: [] };
    });

    const result = await getDocOutlineItems("doc-2");
    // 已有与文档名一致的 H1，不再重复追加 doc-title
    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.text)).toEqual(["一级回退标题", "二级回退标题"]);
  });

  test("deduplicates concurrent in-flight getDocOutlineItems and getDocKeyInfo calls for same docId", async () => {
    const postMock = vi.mocked(fetchSyncPost);
    postMock.mockImplementation(async (url: string) => {
      if (url === "/api/outline/getDocOutline") {
        return { code: 0, msg: "", data: [{ id: "h-1", name: "唯一标题", subType: "h1" }] };
      }
      if (url === "/api/query/sql") {
        return { code: 0, msg: "", data: [] };
      }
      return { code: 0, msg: "", data: [] };
    });

    const [a, b] = await Promise.all([
      getDocOutlineItems("doc-dedup"),
      getDocOutlineItems("doc-dedup")
    ]);
    expect(a).toBe(b);
    const outlineCalls = postMock.mock.calls.filter(([u]) => u === "/api/outline/getDocOutline");
    expect(outlineCalls).toHaveLength(1);

    await getDocKeyInfo("doc-warmup-key");
    postMock.mockClear();
    await getDocKeyInfo("doc-single-key");
    const singleCallCount = postMock.mock.calls.length;

    postMock.mockClear();
    const [k1, k2] = await Promise.all([
      getDocKeyInfo("doc-dedup-key"),
      getDocKeyInfo("doc-dedup-key")
    ]);
    expect(k1).toBe(k2);
    expect(postMock.mock.calls.length).toBe(singleCallCount);
  });
});
