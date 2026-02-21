export function normalizeWorkspacePath(path: string): string {
  const trimmed = (path || "").trim();
  if (!trimmed) {
    return "/";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function buildGetFileRequest(path: string): {
  url: string;
  body: string;
} {
  const normalized = normalizeWorkspacePath(path);
  return {
    url: "/api/file/getFile",
    body: JSON.stringify({ path: normalized }),
  };
}
