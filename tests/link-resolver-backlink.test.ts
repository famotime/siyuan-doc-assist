import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/services/kernel", () => ({
  getBacklink2: vi.fn(),
  getBacklinkSourceDocIdsFromMarkdown: vi.fn(),
  getBacklinkSourceDocIdsFromRefs: vi.fn(),
  getDocMetasByIDs: vi.fn(),
}));

import { getBacklinkDocs } from "@/services/link-resolver";
import {
  getBacklink2,
  getBacklinkSourceDocIdsFromMarkdown,
  getBacklinkSourceDocIdsFromRefs,
  getDocMetasByIDs,
} from "@/services/kernel";

describe("link-resolver backlinks", () => {
  const getBacklink2Mock = vi.mocked(getBacklink2);
  const getBacklinkSourceDocIdsFromMarkdownMock = vi.mocked(getBacklinkSourceDocIdsFromMarkdown);
  const getBacklinkSourceDocIdsFromRefsMock = vi.mocked(getBacklinkSourceDocIdsFromRefs);
  const getDocMetasByIDsMock = vi.mocked(getDocMetasByIDs);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("merges refs, markdown links, and API fallbacks for backlink docs", async () => {
    getBacklinkSourceDocIdsFromRefsMock.mockResolvedValue(["doc-a", "doc-b"]);
    getBacklinkSourceDocIdsFromMarkdownMock.mockResolvedValue(["doc-b", "doc-c"]);
    getBacklink2Mock.mockResolvedValue({
      backlinks: [
        {
          id: "doc-d",
          box: "box-d",
          hPath: "/Root/Doc D",
          name: "Doc D",
          updated: "20260405100000",
        },
      ],
      linkRefsCount: 0,
      backmentions: [],
      mentionsCount: 0,
    } as any);
    getDocMetasByIDsMock.mockResolvedValue([
      {
        id: "doc-a",
        box: "box-a",
        hPath: "/Root/Doc A",
        updated: "20260405110000",
        title: "Doc A",
      },
      {
        id: "doc-b",
        box: "box-b",
        hPath: "/Root/Doc B",
        updated: "20260405120000",
        title: "Doc B",
      },
      {
        id: "doc-c",
        box: "box-c",
        hPath: "/Root/Doc C",
        updated: "20260405130000",
        title: "Doc C",
      },
    ] as any);

    const result = await getBacklinkDocs("current-doc");

    expect(getBacklinkSourceDocIdsFromRefsMock).toHaveBeenCalledWith("current-doc");
    expect(getBacklinkSourceDocIdsFromMarkdownMock).toHaveBeenCalledWith("current-doc");
    expect(getBacklink2Mock).toHaveBeenCalledWith("current-doc", false);
    expect(getDocMetasByIDsMock).toHaveBeenCalledWith(["doc-a", "doc-b", "doc-c", "doc-d"]);
    expect(result).toEqual([
      {
        id: "doc-a",
        box: "box-a",
        hPath: "/Root/Doc A",
        name: "Doc A",
        updated: "20260405110000",
        source: "backlink",
      },
      {
        id: "doc-b",
        box: "box-b",
        hPath: "/Root/Doc B",
        name: "Doc B",
        updated: "20260405120000",
        source: "backlink",
      },
      {
        id: "doc-c",
        box: "box-c",
        hPath: "/Root/Doc C",
        name: "Doc C",
        updated: "20260405130000",
        source: "backlink",
      },
      {
        id: "doc-d",
        box: "box-d",
        hPath: "/Root/Doc D",
        name: "Doc D",
        updated: "20260405100000",
        source: "backlink",
      },
    ]);
  });

  test("falls back to backlink API when explicit detection finds nothing", async () => {
    getBacklinkSourceDocIdsFromRefsMock.mockResolvedValue([]);
    getBacklinkSourceDocIdsFromMarkdownMock.mockResolvedValue([]);
    getBacklink2Mock.mockResolvedValue({
      backlinks: [
        {
          id: "doc-z",
          box: "box-z",
          hPath: "/Root/Doc Z",
          name: "Doc Z",
          updated: "20260405150000",
        },
      ],
      linkRefsCount: 0,
      backmentions: [],
      mentionsCount: 0,
    } as any);
    getDocMetasByIDsMock.mockResolvedValue([] as any);

    const result = await getBacklinkDocs("current-doc");

    expect(result).toEqual([
      {
        id: "doc-z",
        box: "box-z",
        hPath: "/Root/Doc Z",
        name: "Doc Z",
        updated: "20260405150000",
        source: "backlink",
      },
    ]);
  });
});
