function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

const UPLOAD_REPLACE_WITH_UNDERSCORE_RE = /[\\/:*?"'<>|]/g;
const UPLOAD_REMOVE_SYMBOLS_RE = /[~[\]()`!&{}=#%$;]/g;
const UTF8_ENCODER = new TextEncoder();

function stripQueryAndHash(path: string): string {
  return path.replace(/[?#].*$/, "");
}

function normalizeAssetPath(link: string): string | null {
  const cleaned = stripQueryAndHash(link.trim());
  if (cleaned.startsWith("/assets/")) {
    return cleaned;
  }
  if (cleaned.startsWith("assets/")) {
    return `/${cleaned}`;
  }
  return null;
}

function toWorkspaceAssetPath(assetPath: string): string {
  return `/data${assetPath.startsWith("/") ? assetPath : `/${assetPath}`}`;
}

function utf8ByteLength(text: string): number {
  return UTF8_ENCODER.encode(text).length;
}

function truncateUploadFileName(name: string, maxBytes = 189): string {
  const dotIndex = name.lastIndexOf(".");
  const hasExt = dotIndex > 0 && dotIndex < name.length - 1;
  const ext = hasExt ? name.slice(dotIndex) : "";
  const base = hasExt ? name.slice(0, dotIndex) : name;
  const maxBaseBytes = Math.max(1, maxBytes - utf8ByteLength(ext));

  let nextBase = "";
  let usedBytes = 0;
  for (const char of base) {
    const charBytes = utf8ByteLength(char);
    if (usedBytes + charBytes > maxBaseBytes) {
      break;
    }
    nextBase += char;
    usedBytes += charBytes;
  }

  return `${nextBase}${ext}`;
}

function normalizeUploadFileNameUnsafe(name: string): string {
  let next = name
    .replace(UPLOAD_REPLACE_WITH_UNDERSCORE_RE, "_")
    .trim()
    .replace(/\.+$/g, "");
  next = next.replace(UPLOAD_REMOVE_SYMBOLS_RE, "");
  next = truncateUploadFileName(next);
  return next;
}

export function normalizeUploadFileName(name: string, fallback = "doc.md"): string {
  const normalized = normalizeUploadFileNameUnsafe(name || "");
  if (normalized && /[^.]/.test(normalized)) {
    return normalized;
  }
  const normalizedFallback = normalizeUploadFileNameUnsafe(fallback || "");
  if (normalizedFallback && /[^.]/.test(normalizedFallback)) {
    return normalizedFallback;
  }
  return "doc.md";
}

export function collectAssetLinksFromMarkdown(markdown: string): string[] {
  const matches: string[] = [];
  const mdLinkPattern = /!?\[[^\]]*?\]\(([^)\s]+)\)/g;
  const htmlLinkPattern = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;

  let mdMatch: RegExpExecArray | null = mdLinkPattern.exec(markdown);
  while (mdMatch) {
    matches.push(mdMatch[1]);
    mdMatch = mdLinkPattern.exec(markdown);
  }

  let htmlMatch: RegExpExecArray | null = htmlLinkPattern.exec(markdown);
  while (htmlMatch) {
    matches.push(htmlMatch[1]);
    htmlMatch = htmlLinkPattern.exec(markdown);
  }

  return unique(
    matches.filter((link) => Boolean(normalizeAssetPath(link)))
  );
}

export function getExportResourceAssetPaths(markdown: string): string[] {
  const links = collectAssetLinksFromMarkdown(markdown);
  const normalized = links
    .map((link) => normalizeAssetPath(link))
    .map((path) => (path ? toWorkspaceAssetPath(path) : null))
    .filter((link): link is string => Boolean(link));
  return unique(normalized);
}

export function assetPathBasename(path: string): string {
  const normalized = stripQueryAndHash(path);
  const segments = normalized.split("/").filter(Boolean);
  return segments.length ? segments[segments.length - 1] : normalized;
}

function normalizeRelativeDirPrefix(prefix?: string): string {
  if (!prefix) {
    return "";
  }
  return prefix.replace(/^\/+|\/+$/g, "");
}

export function rewriteMarkdownAssetLinksToBasename(markdown: string, targetDirPrefix?: string): string {
  const links = collectAssetLinksFromMarkdown(markdown);
  const sortedLinks = [...links].sort((a, b) => b.length - a.length);
  const dirPrefix = normalizeRelativeDirPrefix(targetDirPrefix);

  let next = markdown;
  for (const link of sortedLinks) {
    const normalized = normalizeAssetPath(link);
    if (!normalized) {
      continue;
    }
    const name = assetPathBasename(normalized);
    const replacement = dirPrefix ? `${dirPrefix}/${name}` : name;
    next = next.split(link).join(replacement);
  }
  return next;
}
