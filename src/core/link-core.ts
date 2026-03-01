export type DocRef = {
  id: string;
  name: string;
  hPath?: string;
  box?: string;
  depth?: number;
};

const BLOCK_ID_PATTERN = "[0-9]{14}-[a-z0-9]{7,}";
const SIYUAN_DOC_LINK_PATTERN = new RegExp(
  `(?<!!)\\[([^\\]]*)\\]\\(\\s*siyuan://blocks/(${BLOCK_ID_PATTERN})(?:[?#][^)]*)?\\s*\\)`,
  "gi"
);
const BLOCK_REF_PATTERN = new RegExp(
  `\\(\\(\\s*(${BLOCK_ID_PATTERN})(?:\\s+(?:"((?:\\\\.|[^"\\\\])*)"|'((?:\\\\.|[^'\\\\])*)'))?\\s*\\)\\)`,
  "gi"
);
const WIKI_REF_PATTERN = new RegExp(
  `\\[\\[\\s*(${BLOCK_ID_PATTERN})(?:\\s+(?:"((?:\\\\.|[^"\\\\])*)"|'((?:\\\\.|[^'\\\\])*)'))?\\s*\\]\\]`,
  "gi"
);

export type LinkRefConversionMode = "link-to-ref" | "ref-to-link" | "none";
export type LinkRefConversionPreferredMode = Exclude<LinkRefConversionMode, "none">;

export type LinkRefConversionResult = {
  markdown: string;
  mode: LinkRefConversionMode;
  convertedCount: number;
};

function countMatches(markdown: string, pattern: RegExp): number {
  const source = new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`
  );
  let count = 0;
  let match: RegExpExecArray | null;
  match = source.exec(markdown);
  while (match) {
    count += 1;
    match = source.exec(markdown);
  }
  return count;
}

function escapeRefAlias(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function unescapeRefAlias(value: string): string {
  return value.replace(/\\([\\'"])/g, "$1");
}

function toAliasOrId(
  id: string,
  doubleQuoteAlias?: string,
  singleQuoteAlias?: string
): string {
  const raw = (doubleQuoteAlias ?? singleQuoteAlias ?? "").trim();
  if (!raw) {
    return id;
  }
  const alias = unescapeRefAlias(raw).trim();
  return alias || id;
}

function convertLinksToRefs(markdown: string): { markdown: string; convertedCount: number } {
  let convertedCount = 0;
  const next = markdown.replace(
    SIYUAN_DOC_LINK_PATTERN,
    (_matched, label: string, id: string) => {
      convertedCount += 1;
      const normalizedLabel = (label || "").trim();
      if (!normalizedLabel || normalizedLabel === id) {
        return `((${id}))`;
      }
      return `((${id} "${escapeRefAlias(normalizedLabel)}"))`;
    }
  );
  return {
    markdown: next,
    convertedCount,
  };
}

function convertRefsToLinks(markdown: string): { markdown: string; convertedCount: number } {
  let convertedCount = 0;
  const blockRefConverted = markdown.replace(
    BLOCK_REF_PATTERN,
    (_matched, id: string, doubleQuoteAlias?: string, singleQuoteAlias?: string) => {
      convertedCount += 1;
      const label = toAliasOrId(id, doubleQuoteAlias, singleQuoteAlias);
      return `[${label}](siyuan://blocks/${id})`;
    }
  );
  const wikiRefConverted = blockRefConverted.replace(
    WIKI_REF_PATTERN,
    (_matched, id: string, doubleQuoteAlias?: string, singleQuoteAlias?: string) => {
      convertedCount += 1;
      const label = toAliasOrId(id, doubleQuoteAlias, singleQuoteAlias);
      return `[${label}](siyuan://blocks/${id})`;
    }
  );
  return {
    markdown: wikiRefConverted,
    convertedCount,
  };
}

export function convertSiyuanLinksAndRefsInMarkdown(
  markdown: string,
  preferredMode?: LinkRefConversionPreferredMode
): LinkRefConversionResult {
  const source = markdown || "";
  if (preferredMode === "link-to-ref") {
    const converted = convertLinksToRefs(source);
    return {
      markdown: converted.markdown,
      mode: "link-to-ref",
      convertedCount: converted.convertedCount,
    };
  }
  if (preferredMode === "ref-to-link") {
    const converted = convertRefsToLinks(source);
    return {
      markdown: converted.markdown,
      mode: "ref-to-link",
      convertedCount: converted.convertedCount,
    };
  }

  const linkCount = countMatches(source, SIYUAN_DOC_LINK_PATTERN);
  if (linkCount > 0) {
    const converted = convertLinksToRefs(source);
    return {
      markdown: converted.markdown,
      mode: "link-to-ref",
      convertedCount: converted.convertedCount,
    };
  }
  const refCount = countMatches(source, BLOCK_REF_PATTERN) + countMatches(source, WIKI_REF_PATTERN);
  if (refCount > 0) {
    const converted = convertRefsToLinks(source);
    return {
      markdown: converted.markdown,
      mode: "ref-to-link",
      convertedCount: converted.convertedCount,
    };
  }
  return {
    markdown: source,
    mode: "none",
    convertedCount: 0,
  };
}

export function extractSiyuanBlockIdsFromMarkdown(markdown: string): string[] {
  const found = new Set<string>();
  const patterns = [
    // ((block-id)) and (( block-id "alias" ))
    new RegExp(`\\(\\(\\s*(${BLOCK_ID_PATTERN})`, "gi"),
    // siyuan://blocks/block-id with optional query/hash
    new RegExp(`siyuan://blocks/(${BLOCK_ID_PATTERN})`, "gi"),
    // [[block-id]] and [[ block-id "alias" ]]
    new RegExp(`\\[\\[\\s*(${BLOCK_ID_PATTERN})`, "gi"),
    // Fallback for transformed links that still keep '/blocks/<id>'.
    new RegExp(`blocks/(${BLOCK_ID_PATTERN})`, "gi"),
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    match = pattern.exec(markdown);
    while (match) {
      found.add(match[1]);
      match = pattern.exec(markdown);
    }
  }

  return [...found];
}

export function dedupeDocRefs<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    result.push(item);
  }

  return result;
}

export function filterDocRefsByMarkdown<T extends { id: string }>(
  items: T[],
  markdown: string
): { items: T[]; skipped: T[]; existingIds: string[] } {
  if (!items.length) {
    return { items, skipped: [], existingIds: [] };
  }
  const existingIds = extractSiyuanBlockIdsFromMarkdown(markdown || "");
  if (!existingIds.length) {
    return { items, skipped: [], existingIds };
  }
  const existingSet = new Set(existingIds);
  const kept: T[] = [];
  const skipped: T[] = [];
  for (const item of items) {
    if (item?.id && existingSet.has(item.id)) {
      skipped.push(item);
    } else {
      kept.push(item);
    }
  }
  return { items: kept, skipped, existingIds };
}

export function buildBacklinkListMarkdown(items: DocRef[]): string {
  const lines = items.map((item) => `- [${item.name}](siyuan://blocks/${item.id})`);
  return `## 反向链接文档\n\n${lines.join("\n")}`;
}

export function buildChildDocListMarkdown(items: DocRef[]): string {
  const lines = items.map((item) => {
    const depth = Math.max(0, item.depth || 0);
    const indent = "    ".repeat(depth);
    return `${indent}- [${item.name}](siyuan://blocks/${item.id})`;
  });
  return `## 子文档列表\n\n${lines.join("\n")}`;
}
