import { normalizeLocalImageAssetPath } from "@/core/image-webp-core";

export type DisplaySizeSpec = {
  width: number | null;
  height: number | null;
};

export type DisplaySizedImageCandidate = DisplaySizeSpec & {
  assetPath: string;
};

function unwrapTarget(target: string): { value: string; wrapped: boolean } {
  const trimmed = (target || "").trim();
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    return {
      value: trimmed.slice(1, -1),
      wrapped: true
    };
  }
  return {
    value: trimmed,
    wrapped: false
  };
}

function splitSuffix(target: string): { base: string; suffix: string } {
  const match = target.match(/[?#].*$/);
  if (!match || match.index === undefined) {
    return { base: target, suffix: "" };
  }
  return {
    base: target.slice(0, match.index),
    suffix: target.slice(match.index)
  };
}

function parsePxLength(value: string): number | null {
  const parsed = Number.parseFloat((value || "").trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.max(1, Math.round(parsed));
}

function parseStylePxDimension(style: string, key: "width" | "height"): number | null {
  const pattern = new RegExp(`\\b${key}\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)px\\b`, "i");
  const match = (style || "").match(pattern);
  if (!match) {
    return null;
  }
  return parsePxLength(match[1]);
}

function parseAttributePxDimension(attrs: string, key: "width" | "height"): number | null {
  const pattern = new RegExp(
    `\\b${key}\\s*=\\s*["']?\\s*([0-9]+(?:\\.[0-9]+)?)\\s*(?:px)?\\s*["']?`,
    "i"
  );
  const match = (attrs || "").match(pattern);
  if (!match) {
    return null;
  }
  return parsePxLength(match[1]);
}

export function parseDisplaySizeSpecFromAttributes(attrs: string): DisplaySizeSpec | null {
  const raw = attrs || "";
  const styleMatch = raw.match(/\bstyle\s*=\s*["']([^"']*)["']/i);
  const style = styleMatch?.[1] || "";

  const width = parseStylePxDimension(style, "width") || parseAttributePxDimension(raw, "width");
  const height =
    parseStylePxDimension(style, "height") || parseAttributePxDimension(raw, "height");
  if (!width && !height) {
    return null;
  }
  return {
    width: width || null,
    height: height || null
  };
}

function toCandidate(target: string, attrs: string): DisplaySizedImageCandidate | null {
  const { value } = unwrapTarget(target);
  const assetPath = normalizeLocalImageAssetPath(value);
  if (!assetPath) {
    return null;
  }
  const size = parseDisplaySizeSpecFromAttributes(attrs);
  if (!size) {
    return null;
  }
  return {
    assetPath,
    width: size.width,
    height: size.height
  };
}

function replaceTarget(
  target: string,
  replacements: Record<string, string>
): { next: string; replaced: boolean } {
  const { value, wrapped } = unwrapTarget(target);
  const normalized = normalizeLocalImageAssetPath(value);
  if (!normalized) {
    return {
      next: target,
      replaced: false
    };
  }
  const replacement = replacements[normalized];
  if (!replacement) {
    return {
      next: target,
      replaced: false
    };
  }
  const { base, suffix } = splitSuffix(value);
  const nextBase = base.startsWith("/assets/") ? replacement : replacement.replace(/^\//, "");
  const nextValue = `${nextBase}${suffix}`;
  return {
    next: wrapped ? `<${nextValue}>` : nextValue,
    replaced: nextValue !== value
  };
}

export function collectDisplaySizedLocalImageCandidatesFromMarkdown(
  markdown: string
): DisplaySizedImageCandidate[] {
  const candidates: DisplaySizedImageCandidate[] = [];
  const markdownImagePattern = /!\[[^\]]*\]\(([^)\s]+)\)(\s*\{:[^}]*\})?/g;
  const htmlImagePattern = /<img\b[^>]*>/gi;

  let markdownMatch: RegExpExecArray | null = markdownImagePattern.exec(markdown);
  while (markdownMatch) {
    const candidate = toCandidate(markdownMatch[1], markdownMatch[2] || "");
    if (candidate) {
      candidates.push(candidate);
    }
    markdownMatch = markdownImagePattern.exec(markdown);
  }

  let htmlMatch: RegExpExecArray | null = htmlImagePattern.exec(markdown);
  while (htmlMatch) {
    const html = htmlMatch[0] || "";
    const srcMatch = html.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (srcMatch) {
      const candidate = toCandidate(srcMatch[1], html);
      if (candidate) {
        candidates.push(candidate);
      }
    }
    htmlMatch = htmlImagePattern.exec(markdown);
  }

  return candidates;
}

export function rewriteDisplaySizedMarkdownImageAssetLinks(
  markdown: string,
  replacements: Record<string, string>
): { markdown: string; replacedCount: number } {
  let replacedCount = 0;
  const markdownImagePattern = /(!\[[^\]]*\]\()([^) \t]+)(\))(\s*\{:[^}]*\})?/g;
  const htmlImagePattern = /(<img\b[^>]+?\bsrc\s*=\s*["'])([^"']+)(["'][^>]*>)/gi;

  let next = markdown.replace(markdownImagePattern, (full, prefix, target, suffix, attrs) => {
    const size = parseDisplaySizeSpecFromAttributes(attrs || "");
    if (!size) {
      return full;
    }
    const result = replaceTarget(target, replacements);
    if (!result.replaced) {
      return full;
    }
    replacedCount += 1;
    return `${prefix}${result.next}${suffix}${attrs || ""}`;
  });

  next = next.replace(htmlImagePattern, (full, prefix, target, suffix) => {
    const size = parseDisplaySizeSpecFromAttributes(full);
    if (!size) {
      return full;
    }
    const result = replaceTarget(target, replacements);
    if (!result.replaced) {
      return full;
    }
    replacedCount += 1;
    return `${prefix}${result.next}${suffix}`;
  });

  return {
    markdown: next,
    replacedCount
  };
}
