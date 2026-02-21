import {
  assetPathBasename,
  getExportResourceAssetPaths,
  normalizeUploadFileName,
  rewriteMarkdownAssetLinksToBasename,
} from "@/core/export-media-core";
import { buildGetFileRequest, decodeURIComponentSafe } from "@/core/workspace-path-core";
import {
  exportMdContent,
  exportMds,
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

export async function exportCurrentDocMarkdown(
  docId: string
): Promise<ExportCurrentDocResult> {
  const res = await exportMdContent(docId, {
    // Keep export to current doc body only:
    // - no ref footnotes expansion
    // - no embedded block quote expansion
    // - no auto title/front-matter injection
    refMode: 3,
    embedMode: 0,
    addTitle: false,
    yfm: false,
  });
  const title = sanitizeFileName(basename(res.hPath || docId));
  const markdownName = `${title || docId}.md`;
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
  const tempMarkdownName = normalizeUploadFileName(markdownName, `${docId}.md`);
  const tempMarkdownPath = `${tempDir}/${tempMarkdownName}`;
  const rewrittenMarkdown = rewriteMarkdownAssetLinksToBasename(content, "assets");
  await putFile(tempMarkdownPath, rewrittenMarkdown);
  await stageAssetsToTempDir(assetPaths, tempAssetsDir);

  try {
    const zipName = sanitizeFileName(title || docId);
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
    void removeFile(tempDir).catch(() => undefined);
  }
}

export async function exportDocIdsAsMarkdownZip(
  docIds: string[],
  preferredDownloadBaseName?: string
): Promise<{ name: string; zip: string }> {
  const result = await exportMds(docIds);
  const preferredName = sanitizeFileName(preferredDownloadBaseName || "");
  const fallbackName = sanitizeFileName(result.name || "export");
  const derivedName = basenameFromWorkspacePath(result.zip)
    || withZipExtension(fallbackName);
  const downloadName = preferredName ? withZipExtension(preferredName) : derivedName;
  await triggerWorkspaceFileDownload(result.zip, downloadName);
  return result;
}
