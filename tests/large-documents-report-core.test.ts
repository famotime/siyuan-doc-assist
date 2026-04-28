import { describe, expect, test } from "vitest";
import {
  buildLargeDocumentsReportMarkdown,
  formatLargeDocumentBytes,
  rankLargeDocuments,
} from "@/core/large-documents-report-core";

describe("large documents report core", () => {
  test("sorts by total size and renders Siyuan links in markdown table", () => {
    const ranked = rankLargeDocuments([
      {
        documentId: "doc-b",
        title: "B 文档",
        hPath: "/资料/B 文档",
        updated: "20260427120000",
        documentBytes: 100,
        assetBytes: 300,
        assetCount: 2,
      },
      {
        documentId: "20260426112233-doca",
        title: "A 文档",
        hPath: "/资料/A 文档",
        updated: "20260427130000",
        documentBytes: 200,
        assetBytes: 200,
        assetCount: 1,
      },
    ]);

    expect(ranked.map((item) => item.documentId)).toEqual(["20260426112233-doca", "doc-b"]);

    const markdown = buildLargeDocumentsReportMarkdown({
      notebookLabel: "知识库",
      generatedAt: "2026-04-27 13:30:15",
      items: ranked,
    });

    expect(formatLargeDocumentBytes(1024)).toBe("1.0 KB");
    expect(markdown).toContain("| 排名 | 文件名 | 文档大小 | 文档本体 | 内嵌资源 | 资源数 | 创建日期 | 更新日期 |");
    expect(markdown).toContain("[A 文档](siyuan://blocks/20260426112233-doca)");
    expect(markdown).toContain(
      "| 1 | [A 文档](siyuan://blocks/20260426112233-doca) | 400 B | 200 B | 200 B | 1 | 2026-04-26 | 2026-04-27 |"
    );
  });
});
