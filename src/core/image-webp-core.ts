function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

const LOCAL_IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
  "tif",
  "tiff",
  "svg",
]);

const CONVERTIBLE_TO_WEBP_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "bmp",
  "tif",
  "tiff",
]);

const CONVERTIBLE_TO_PNG_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "webp",
  "bmp",
  "tif",
  "tiff",
]);

export type ImageTargetFormat = "webp" | "png";

function stripQueryAndHash(path: string): string {
  return path.replace(/[?#].*$/, "");
}

function unwrapTarget(target: string): { value: string; wrapped: boolean } {
  const trimmed = target.trim();
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    return {
      value: trimmed.slice(1, -1),
      wrapped: true,
    };
  }
  return {
    value: trimmed,
    wrapped: false,
  };
}

function getAssetExtension(assetPath: string): string {
  const base = stripQueryAndHash(assetPath).split("/").filter(Boolean).pop() || "";
  const dotIndex = base.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex >= base.length - 1) {
    return "";
  }
  return base.slice(dotIndex + 1).toLowerCase();
}

function splitSuffix(target: string): { base: string; suffix: string } {
  const match = target.match(/[?#].*$/);
  if (!match || match.index === undefined) {
    return { base: target, suffix: "" };
  }
  return {
    base: target.slice(0, match.index),
    suffix: target.slice(match.index),
  };
}

function isImageTarget(target: string): boolean {
  const { value } = unwrapTarget(target);
  if (/^data:image\//i.test(value)) {
    return true;
  }
  const ext = getAssetExtension(value);
  return LOCAL_IMAGE_EXTENSIONS.has(ext);
}

function collectImageTargets(markdown: string): string[] {
  const targets: string[] = [];
  const markdownImagePattern = /!\[[^\]]*?\]\(([^)\s]+)\)/g;
  const htmlImagePattern = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

  let mdMatch: RegExpExecArray | null = markdownImagePattern.exec(markdown);
  while (mdMatch) {
    targets.push(mdMatch[1]);
    mdMatch = markdownImagePattern.exec(markdown);
  }

  let htmlMatch: RegExpExecArray | null = htmlImagePattern.exec(markdown);
  while (htmlMatch) {
    targets.push(htmlMatch[1]);
    htmlMatch = htmlImagePattern.exec(markdown);
  }

  return targets;
}

export function normalizeLocalImageAssetPath(target: string): string | null {
  const { value } = unwrapTarget(target);
  const stripped = stripQueryAndHash(value);
  const normalized = stripped.startsWith("/assets/")
    ? stripped
    : stripped.startsWith("assets/")
      ? `/${stripped}`
      : "";
  if (!normalized) {
    return null;
  }
  const ext = getAssetExtension(normalized);
  if (!LOCAL_IMAGE_EXTENSIONS.has(ext)) {
    return null;
  }
  return normalized;
}

export function isConvertibleImageAssetPath(
  assetPath: string,
  targetFormat: ImageTargetFormat = "webp"
): boolean {
  const ext = getAssetExtension(assetPath);
  if (targetFormat === "png") {
    return CONVERTIBLE_TO_PNG_EXTENSIONS.has(ext);
  }
  return CONVERTIBLE_TO_WEBP_EXTENSIONS.has(ext);
}

export function toWebpAssetPath(assetPath: string): string {
  const normalized = normalizeLocalImageAssetPath(assetPath) || assetPath;
  return stripQueryAndHash(normalized).replace(/\.[^.\/]+$/i, ".webp");
}

export function toPngAssetPath(assetPath: string): string {
  const normalized = normalizeLocalImageAssetPath(assetPath) || assetPath;
  return stripQueryAndHash(normalized).replace(/\.[^.\/]+$/i, ".png");
}

export function collectLocalImageAssetPathsFromMarkdown(markdown: string): string[] {
  const targets = collectImageTargets(markdown);
  return unique(
    targets
      .map((target) => normalizeLocalImageAssetPath(target))
      .filter((item): item is string => Boolean(item))
  );
}

export function collectConvertibleLocalImageAssetPathsFromMarkdown(markdown: string): string[] {
  return collectLocalImageAssetPathsFromMarkdown(markdown).filter((assetPath) =>
    isConvertibleImageAssetPath(assetPath)
  );
}

export function rewriteMarkdownImageAssetLinks(
  markdown: string,
  replacements: Record<string, string>
): { markdown: string; replacedCount: number } {
  const replaceTarget = (target: string): { next: string; replaced: boolean } => {
    const { value, wrapped } = unwrapTarget(target);
    const normalized = normalizeLocalImageAssetPath(value);
    if (!normalized) {
      return {
        next: target,
        replaced: false,
      };
    }
    const replacement = replacements[normalized];
    if (!replacement) {
      return {
        next: target,
        replaced: false,
      };
    }
    const { base, suffix } = splitSuffix(value);
    const nextBase = base.startsWith("/assets/") ? replacement : replacement.replace(/^\//, "");
    const nextValue = `${nextBase}${suffix}`;
    return {
      next: wrapped ? `<${nextValue}>` : nextValue,
      replaced: nextValue !== value,
    };
  };

  let replacedCount = 0;
  const markdownImagePattern = /(!\[[^\]]*?\]\()([^) \t]+)(\))/g;
  const htmlImagePattern = /(<img\b[^>]*?\bsrc\s*=\s*["'])([^"']+)(["'][^>]*>)/gi;

  let next = markdown.replace(markdownImagePattern, (full, prefix, target, suffix) => {
    const result = replaceTarget(target);
    if (!result.replaced) {
      return full;
    }
    replacedCount += 1;
    return `${prefix}${result.next}${suffix}`;
  });

  next = next.replace(htmlImagePattern, (full, prefix, target, suffix) => {
    const result = replaceTarget(target);
    if (!result.replaced) {
      return full;
    }
    replacedCount += 1;
    return `${prefix}${result.next}${suffix}`;
  });

  return {
    markdown: next,
    replacedCount,
  };
}

export function removeMarkdownImageAssetLinks(markdown: string): {
  markdown: string;
  removedCount: number;
} {
  let removedCount = 0;

  const markdownImagePattern = /(!\[[^\]]*?\]\()([^) \t]+)(\))/g;
  const htmlImagePattern = /(<img\b[^>]*?\bsrc\s*=\s*["'])([^"']+)(["'][^>]*>)/gi;

  let next = markdown.replace(markdownImagePattern, (full, _prefix, target) => {
    if (!isImageTarget(target)) return full;
    removedCount += 1;
    return "";
  });

  next = next.replace(htmlImagePattern, (full, _prefix, target) => {
    if (!isImageTarget(target)) return full;
    removedCount += 1;
    return "";
  });

  return {
    markdown: next,
    removedCount,
  };
}
