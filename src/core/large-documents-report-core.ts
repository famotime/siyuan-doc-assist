export type LargeDocumentReportItem = {
  documentId: string;
  title: string;
  hPath: string;
  updated: string;
  documentBytes: number;
  assetBytes: number;
  assetCount: number;
};

export type RankedLargeDocumentReportItem = LargeDocumentReportItem & {
  totalBytes: number;
};

export function formatLargeDocumentBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function rankLargeDocuments(
  items: LargeDocumentReportItem[],
  limit = 100
): RankedLargeDocumentReportItem[] {
  return items
    .map((item) => ({
      ...item,
      totalBytes: item.documentBytes + item.assetBytes,
    }))
    .sort(
      (left, right) =>
        right.totalBytes - left.totalBytes
        || String(right.updated || "").localeCompare(String(left.updated || ""))
        || left.title.localeCompare(right.title, "zh-CN")
    )
    .slice(0, limit);
}

export function buildLargeDocumentsReportMarkdown(params: {
  notebookLabel: string;
  generatedAt: string;
  items: RankedLargeDocumentReportItem[];
}): string {
  const lines = [
    "# Top100大文件清单",
    "",
    `当前笔记本：${params.notebookLabel}`,
    "统计口径：文档大小 = 文档本体 + 内嵌资源",
    `生成时间：${params.generatedAt}`,
    "",
    "| 排名 | 文件名 | 文档大小 | 文档本体 | 内嵌资源 | 资源数 | 创建日期 | 更新日期 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...params.items.map(
      (item, index) =>
        `| ${index + 1} | [${item.title}](siyuan://blocks/${item.documentId}) | ${formatLargeDocumentBytes(
          item.totalBytes
        )} | ${formatLargeDocumentBytes(item.documentBytes)} | ${formatLargeDocumentBytes(
          item.assetBytes
        )} | ${item.assetCount} | ${formatReportDateFromId(item.documentId)} | ${formatReportDate(
          item.updated
        )} |`
    ),
  ];

  return lines.join("\n");
}

function formatReportDate(value: string): string {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) {
    return "";
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function formatReportDateFromId(documentId: string): string {
  return formatReportDate(String(documentId || "").split("-")[0] || "");
}
