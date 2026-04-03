import { describe, expect, test } from "vitest";
import { loadFreshNetworkLensDocumentSummary } from "@/services/network-lens-ai-index";

describe("network lens ai index", () => {
  test("loads a fresh document summary from network lens semantic profiles", async () => {
    const networkLensPlugin = {
      loadData: async () => ({
        schemaVersion: 2,
        semanticProfiles: {
          "doc-1": {
            documentId: "doc-1",
            sourceUpdatedAt: "20260403150208",
            sourceHash: "h123",
            documentSummaryShort: "这是短摘要。",
            documentSummaryMedium: "这是长摘要。",
            documentKeywordsJson: "[\"AI\",\"摘要\"]",
            documentEvidenceSnippetsJson: "[\"片段一\"]",
            documentSummaryUpdatedAt: "2026-04-03T15:02:08.012Z",
            summaryShort: "找到 1 个主题页建议",
            summaryMedium: "找到 1 个主题页建议，因为……",
          },
        },
      }),
    };

    const result = await loadFreshNetworkLensDocumentSummary({
      networkLensPlugin,
      documentId: "doc-1",
      documentUpdatedAt: "20260403150208",
    });

    expect(result).toEqual({
      summaryShort: "这是短摘要。",
      summaryMedium: "这是长摘要。",
      keywords: ["AI", "摘要"],
      evidenceSnippets: ["片段一"],
      indexedAt: "2026-04-03T15:02:08.012Z",
      sourceHash: "h123",
    });
  });

  test("does not treat link-suggestion summary fields as document summary", async () => {
    const networkLensPlugin = {
      loadData: async () => ({
        schemaVersion: 1,
        semanticProfiles: {
          "doc-1": {
            documentId: "doc-1",
            sourceUpdatedAt: "20260403150208",
            sourceHash: "h123",
            summaryShort: "找到 1 个主题页建议",
            summaryMedium: "找到 1 个主题页建议，因为……",
          },
        },
      }),
    };

    const result = await loadFreshNetworkLensDocumentSummary({
      networkLensPlugin,
      documentId: "doc-1",
      documentUpdatedAt: "20260403150208",
    });

    expect(result).toBeNull();
  });

  test("ignores stale summaries when source updated time no longer matches", async () => {
    const networkLensPlugin = {
      loadData: async () => ({
        schemaVersion: 2,
        semanticProfiles: {
          "doc-1": {
            documentId: "doc-1",
            sourceUpdatedAt: "20260403160000",
            sourceHash: "h123",
            documentSummaryShort: "这是短摘要。",
          },
        },
      }),
    };

    const result = await loadFreshNetworkLensDocumentSummary({
      networkLensPlugin,
      documentId: "doc-1",
      documentUpdatedAt: "20260403150208",
    });

    expect(result).toBeNull();
  });
});
