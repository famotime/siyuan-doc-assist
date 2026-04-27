import {
  buildLargeDocumentsReportMarkdown,
  rankLargeDocuments,
  type LargeDocumentReportItem,
} from "@/core/large-documents-report-core";
import {
  createDocWithMd,
  getDocAssets,
  getDocMetaByID,
  getFileBlob,
  getNotebookConf,
  listNotebookDocs,
  renderSprigTemplate,
  statAsset,
} from "@/services/kernel";

type CreateTop100LargeDocumentsReportOptions = {
  currentDocId: string;
  now?: Date;
};

export type Top100LargeDocumentsReport = {
  id: string;
  title: string;
  path: string;
  docCount: number;
};

export async function createTop100LargeDocumentsReport(
  options: CreateTop100LargeDocumentsReportOptions
): Promise<Top100LargeDocumentsReport> {
  const now = options.now || new Date();
  const currentDoc = await getDocMetaByID(options.currentDocId);
  if (!currentDoc?.box) {
    throw new Error("未找到当前文档信息，无法输出 Top100 大文件清单");
  }

  const notebookConf = await getNotebookConf(currentDoc.box);
  const dailyNoteSavePath = (notebookConf?.conf?.dailyNoteSavePath || "").trim();
  if (!dailyNoteSavePath) {
    throw new Error("当前笔记本未配置 Daily Note 保存路径");
  }

  const renderedDailyNotePath = (await renderSprigTemplate(dailyNoteSavePath)).trim();
  if (!renderedDailyNotePath) {
    throw new Error("无法解析当前笔记本的 Daily Note 保存路径");
  }

  const docs = await listNotebookDocs(currentDoc.box);
  const assetSizeCache = new Map<string, number>();
  const items: LargeDocumentReportItem[] = [];

  for (const doc of docs) {
    const documentBytes = await loadDocumentBytes(doc.box, doc.path);
    const assetPaths = await loadDocAssetPaths(doc.id);
    const assetBytes = await sumAssetBytes(assetPaths, assetSizeCache);

    items.push({
      documentId: doc.id,
      title: doc.title,
      hPath: doc.hPath,
      updated: doc.updated,
      documentBytes,
      assetBytes,
      assetCount: assetPaths.length,
    });
  }

  const title = buildReportTitle(now);
  const path = joinDocHPath(getParentDocHPath(renderedDailyNotePath), title);
  const markdown = buildLargeDocumentsReportMarkdown({
    notebookLabel: notebookConf?.name || currentDoc.box,
    generatedAt: formatGeneratedAt(now),
    items: rankLargeDocuments(items, 100),
  });
  const id = await createDocWithMd(currentDoc.box, path, markdown);

  return {
    id,
    title,
    path,
    docCount: Math.min(items.length, 100),
  };
}

async function loadDocumentBytes(box: string, path: string): Promise<number> {
  try {
    const blob = await getFileBlob(toWorkspaceDocumentPath(box, path));
    return blob.size;
  } catch {
    return 0;
  }
}

async function loadDocAssetPaths(docId: string): Promise<string[]> {
  try {
    return normalizeAssetPaths(await getDocAssets(docId));
  } catch {
    return [];
  }
}

async function sumAssetBytes(assetPaths: string[], assetSizeCache: Map<string, number>): Promise<number> {
  let total = 0;

  for (const assetPath of assetPaths) {
    if (!assetSizeCache.has(assetPath)) {
      assetSizeCache.set(assetPath, await loadAssetSize(assetPath));
    }
    total += assetSizeCache.get(assetPath) || 0;
  }

  return total;
}

async function loadAssetSize(assetPath: string): Promise<number> {
  try {
    return resolveAssetSize(await statAsset(assetPath));
  } catch {
    return 0;
  }
}

function toWorkspaceDocumentPath(box: string, docPath: string): string {
  const normalizedPath = docPath.startsWith("/") ? docPath : `/${docPath}`;
  return `/data/${box}${normalizedPath}`;
}

function normalizeAssetPaths(payload: unknown): string[] {
  const values = extractArrayPayload(payload);
  return [
    ...new Set(
      values.map(resolveAssetPath).filter((value): value is string => Boolean(value))
    ),
  ];
}

function extractArrayPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["assets", "files", "data"]) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }

  return [];
}

function resolveAssetPath(entry: unknown): string | null {
  if (typeof entry === "string") {
    return normalizeAssetPath(entry);
  }
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const record = entry as Record<string, unknown>;
  for (const key of ["path", "assetPath", "src", "url"]) {
    if (typeof record[key] === "string") {
      return normalizeAssetPath(record[key] as string);
    }
  }

  return null;
}

function normalizeAssetPath(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.startsWith("/data/assets/")) {
    return `assets/${normalized.slice("/data/assets/".length)}`;
  }
  if (normalized.startsWith("/assets/")) {
    return `assets/${normalized.slice("/assets/".length)}`;
  }
  if (normalized.startsWith("assets/")) {
    return normalized;
  }
  return null;
}

function resolveAssetSize(payload: unknown): number {
  if (typeof payload === "number") {
    return payload;
  }
  if (!payload || typeof payload !== "object") {
    return 0;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.size === "number") {
    return record.size;
  }
  if ("data" in record) {
    return resolveAssetSize(record.data);
  }
  return 0;
}

function buildReportTitle(now: Date): string {
  return `Top100大文件清单-${formatCompactTimestamp(now)}`;
}

function formatCompactTimestamp(now: Date): string {
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

function formatGeneratedAt(now: Date): string {
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

function getParentDocHPath(hPath: string): string {
  const parts = (hPath || "").split("/").filter(Boolean);
  if (parts.length <= 1) {
    return "";
  }
  return `/${parts.slice(0, -1).join("/")}`;
}

function joinDocHPath(parentPath: string, title: string): string {
  const base = (parentPath || "").trim().replace(/\/+$/u, "");
  if (!base) {
    return `/${title}`;
  }
  return `${base}/${title}`;
}
