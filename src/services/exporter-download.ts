import { buildGetFileRequest, decodeURIComponentSafe } from "@/core/workspace-path-core";

const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`下载超时（${DOWNLOAD_TIMEOUT_MS}ms）`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function triggerTextDownload(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export function normalizeFileDownloadPath(path: string): string {
  const trimmed = (path || "").trim();
  if (!trimmed) {
    return "/";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function isExportRoutePath(path: string): boolean {
  const normalized = normalizeFileDownloadPath(path);
  return normalized.startsWith("/export/");
}

export async function triggerWorkspaceFileDownload(relativePath: string, downloadName?: string) {
  const normalized = normalizeFileDownloadPath(relativePath);
  let response: Response;
  if (isExportRoutePath(normalized)) {
    response = await fetchWithTimeout(normalized, { method: "GET" });
  } else {
    const request = buildGetFileRequest(normalized);
    response = await fetchWithTimeout(request.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: request.body
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
  const anchor = document.createElement("a");
  anchor.href = href;
  if (downloadName) {
    anchor.download = downloadName;
  }
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(href);
  }, 1000);
}

export function basenameFromWorkspacePath(path: string): string {
  const cleaned = (path || "").replace(/[?#].*$/, "");
  const parts = cleaned.split("/").filter(Boolean);
  const name = parts.length ? parts[parts.length - 1] : "";
  return decodeURIComponentSafe(name);
}
