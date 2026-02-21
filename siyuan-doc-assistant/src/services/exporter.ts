import {
  assetPathBasename,
  getExportResourceAssetPaths,
  normalizeUploadFileName,
  rewriteMarkdownAssetLinksToBasename,
} from "@/core/export-media-core";
import { buildGetFileRequest, decodeURIComponentSafe } from "@/core/workspace-path-core";
import {
  exportMdContent,
  exportResources,
  getFileBlob,
  putBlobFile,
  putFile,
  removeFile,
} from "@/services/kernel";

function basename(hPath: string): string {
  const parts = hPath.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : hPath;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}

function sanitizePathSegment(name: string): string {
  const normalized = (name || "").normalize("NFKC");
  const replaced = normalized.replace(/[^A-Za-z0-9\u4E00-\u9FFF._-]/g, "_");
  const compact = replaced.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return compact || "export";
}

function sanitizeArchiveBaseName(name: string): string {
  const normalized = normalizeUploadFileName(sanitizePathSegment(name || ""), "export")
    .replace(/\.zip$/i, "")
    .replace(/\.+$/g, "")
    .trim();
  return normalized || "export";
}

function buildSafeMarkdownFileName(rawTitle: string, fallbackId: string): string {
  const safeBase = sanitizePathSegment(rawTitle || "") || fallbackId;
  return normalizeUploadFileName(`${safeBase}.md`, `${fallbackId}.md`);
}

function withZipExtension(name: string): string {
  return name.endsWith(".zip") ? name : `${name}.zip`;
}

function triggerDownload(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function normalizeFileDownloadPath(path: string): string {
  const trimmed = (path || "").trim();
  if (!trimmed) {
    return "/";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function isExportRoutePath(path: string): boolean {
  const normalized = normalizeFileDownloadPath(path);
  return normalized.startsWith("/export/");
}

async function triggerWorkspaceFileDownload(relativePath: string, downloadName?: string) {
  const normalized = normalizeFileDownloadPath(relativePath);
  let response: Response;
  if (isExportRoutePath(normalized)) {
    response = await fetch(normalized, { method: "GET" });
  } else {
    const request = buildGetFileRequest(normalized);
    response = await fetch(request.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: request.body,
    });
  }
  if (!response.ok) {
    throw new Error(`下载失败：${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await response.json().catch(() => null);
    const message = json?.msg || "下载失败";
    throw new Error(message);
  }
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  if (downloadName) {
    a.download = downloadName;
  }
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(href);
  }, 1000);
}

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function basenameFromWorkspacePath(path: string): string {
  const cleaned = (path || "").replace(/[?#].*$/, "");
  const parts = cleaned.split("/").filter(Boolean);
  const name = parts.length ? parts[parts.length - 1] : "";
  return decodeURIComponentSafe(name);
}

async function stageAssetsToTempDir(assetPaths: string[], tempAssetsDir: string) {
  for (const assetPath of assetPaths) {
    const name = normalizeUploadFileName(assetPathBasename(assetPath), "asset.bin");
    const data = await getFileBlob(assetPath);
    await putBlobFile(`${tempAssetsDir}/${name}`, data, name);
  }
}

export type ExportCurrentDocResult = {
  mode: "md" | "zip";
  fileName: string;
  zipPath?: string;
};

const EXPORT_MD_OPTIONS = {
  refMode: 3,
  embedMode: 0,
  addTitle: false,
  yfm: false,
} as const;

export async function exportCurrentDocMarkdown(
  docId: string
): Promise<ExportCurrentDocResult> {
  const res = await exportMdContent(docId, EXPORT_MD_OPTIONS);
  const title = basename(res.hPath || docId);
  const markdownName = buildSafeMarkdownFileName(title, docId);
  const content = res.content || "";
  const assetPaths = getExportResourceAssetPaths(content);

  if (!assetPaths.length) {
    triggerDownload(markdownName, content);
    return {
      mode: "md",
      fileName: markdownName,
    };
  }

  const tempDir = `/temp/export/doc-link-tool-${randomId()}`;
  const tempAssetsDir = `${tempDir}/assets`;
  const tempMarkdownName = buildSafeMarkdownFileName(title, docId);
  const tempMarkdownPath = `${tempDir}/${tempMarkdownName}`;
  const rewrittenMarkdown = rewriteMarkdownAssetLinksToBasename(content, "assets");
  await putFile(tempMarkdownPath, rewrittenMarkdown);
  await stageAssetsToTempDir(assetPaths, tempAssetsDir);

  try {
    const zipName = sanitizeArchiveBaseName(title || docId);
    const zip = await exportResources([tempMarkdownPath, tempAssetsDir], zipName);
    const outputName = `${zipName}.zip`;
    await triggerWorkspaceFileDownload(zip.path, outputName);
    return {
      mode: "zip",
      fileName: outputName,
      zipPath: zip.path,
    };
  } finally {
    // Best effort cleanup of temporary markdown folder.
    void Promise.resolve(removeFile(tempDir)).catch(() => undefined);
  }
}

export async function exportDocIdsAsMarkdownZip(
  docIds: string[],
  preferredDownloadBaseName?: string
): Promise<{ name: string; zip: string }> {
  if (!docIds.length) {
    throw new Error("未找到可导出的文档");
  }

  const preferredName = sanitizeArchiveBaseName(preferredDownloadBaseName || "");
  const tempDir = `/temp/export/doc-link-tool-${randomId()}`;
  const tempAssetsDir = `${tempDir}/assets`;
  const usedDocNames = new Set<string>();
  const assetPathSet = new Set<string>();
  const packPathSet = new Set<string>();

  const uniqueDocIds = [...new Set(docIds.filter(Boolean))];
  for (const docId of uniqueDocIds) {
    const res = await exportMdContent(docId, EXPORT_MD_OPTIONS);
    const title = basename(res.hPath || docId) || docId;
    const safeBase = sanitizePathSegment(title) || docId;
    const markdownName = normalizeUploadFileName(`${safeBase}.md`, `${docId}.md`);
    let uniqueName = markdownName;
    let suffix = 2;
    while (usedDocNames.has(uniqueName)) {
      uniqueName = normalizeUploadFileName(`${safeBase}-${suffix}.md`, `${docId}-${suffix}.md`);
      suffix += 1;
    }
    usedDocNames.add(uniqueName);

    const content = res.content || "";
    const rewrittenMarkdown = rewriteMarkdownAssetLinksToBasename(content, "assets");
    const markdownPath = `${tempDir}/${uniqueName}`;
    try {
      await putFile(markdownPath, rewrittenMarkdown);
    } catch (error: any) {
      const detail = error?.message || String(error);
      throw new Error(`导出临时文件写入失败（${markdownPath}）：${detail}`);
    }
    packPathSet.add(markdownPath);

    const assetPaths = getExportResourceAssetPaths(content);
    for (const assetPath of assetPaths) {
      assetPathSet.add(assetPath);
    }
  }

  if (assetPathSet.size) {
    await stageAssetsToTempDir([...assetPathSet], tempAssetsDir);
    packPathSet.add(tempAssetsDir);
  }

  const zipBaseName = preferredName || "export";
  try {
    const packPaths = [...packPathSet];
    const zip = await exportResources(packPaths, zipBaseName);
    const derivedName = basenameFromWorkspacePath(zip.path) || withZipExtension(zipBaseName);
    const downloadName = preferredName ? withZipExtension(preferredName) : derivedName;
    await triggerWorkspaceFileDownload(zip.path, downloadName);
    return {
      name: zipBaseName,
      zip: zip.path,
    };
  } finally {
    void Promise.resolve(removeFile(tempDir)).catch(() => undefined);
  }
}
