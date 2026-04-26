export type KeyInfoType =
  | "title"
  | "bold"
  | "italic"
  | "underline"
  | "highlight"
  | "code"
  | "remark"
  | "tag"
  | "link"
  | "ref";

export type KeyInfoFilter = KeyInfoType[];

export const KEY_INFO_TYPES: KeyInfoType[] = [
  "title",
  "bold",
  "italic",
  "underline",
  "highlight",
  "code",
  "remark",
  "tag",
  "link",
  "ref",
];

export function isKeyInfoType(value: unknown): value is KeyInfoType {
  return typeof value === "string" && KEY_INFO_TYPES.includes(value as KeyInfoType);
}

export function buildDefaultKeyInfoFilter(): KeyInfoFilter {
  return KEY_INFO_TYPES.filter((type) => type !== "code");
}

export function normalizeKeyInfoFilter(value: unknown): KeyInfoFilter {
  if (!Array.isArray(value)) {
    return buildDefaultKeyInfoFilter();
  }

  const normalized = value.filter((item): item is KeyInfoType => isKeyInfoType(item));
  return Array.from(new Set(normalized));
}

export type KeyInfoExtract = {
  type: KeyInfoType;
  text: string;
  raw: string;
  offset: number;
};

export type KeyInfoItem = KeyInfoExtract & {
  id: string;
  blockId?: string;
  blockSort: number;
  order: number;
  listItem?: boolean;
  listPrefix?: string;
};

const KEY_INFO_TYPE_LABELS: Record<KeyInfoType, string> = {
  title: "标题",
  bold: "加粗",
  italic: "斜体",
  underline: "下划",
  highlight: "高亮",
  code: "代码",
  remark: "备注",
  tag: "标签",
  link: "链接",
  ref: "引用",
};

export function keyInfoTypeLabel(type: KeyInfoType): string {
  return KEY_INFO_TYPE_LABELS[type] || type;
}

export function buildKeyInfoMarkdown(
  items: Array<Pick<KeyInfoExtract, "raw" | "text"> & { listItem?: boolean; listPrefix?: string }>
): string {
  const hasAnyListPrefix = (value: string) => /^\s*(?:[-+]\s*|\*\s+|\d+\.\s*)/.test(value);
  return items
    .map((item) => {
      const content = (item.raw || item.text || "").trim();
      if (!content) {
        return "";
      }
      if (item.listPrefix) {
        if (content.startsWith(item.listPrefix) || hasAnyListPrefix(content)) {
          return content;
        }
        return `${item.listPrefix}${content}`;
      }
      if (item.listItem && !hasAnyListPrefix(content)) {
        return `- ${content}`;
      }
      return content;
    })
    .filter(Boolean)
    .join("\n");
}

export function filterKeyInfoItems(items: KeyInfoItem[], filter?: KeyInfoFilter): KeyInfoItem[] {
  if (filter === undefined) {
    return items;
  }
  if (!filter.length) {
    return [];
  }

  const active = new Set(filter);
  const filtered = items.filter((item) => active.has(item.type));
  if (!active.has("title")) {
    return filtered;
  }

  const visibleHeadingBlockIds = new Set(
    filtered
      .filter((item) => item.type === "title" && item.id.includes("-heading-") && !!item.blockId)
      .map((item) => item.blockId as string)
  );
  if (!visibleHeadingBlockIds.size) {
    return filtered;
  }

  return filtered.filter((item) => item.type === "title" || !visibleHeadingBlockIds.has(item.blockId || ""));
}

function normalizeInlineText(text: string): string {
  let next = text || "";
  next = next.replace(/\r?\n/g, " ");
  next = next.replace(/`([^`]+)`/g, "$1");
  next = next.replace(/(\*\*|__)(.+?)\1/g, "$2");
  next = next.replace(/(\*|_)(.+?)\1/g, "$2");
  next = next.replace(/==(.+?)==/g, "$1");
  next = next.replace(/%%(.+?)%%/g, "$1");
  next = next.replace(/<mark>([\s\S]+?)<\/mark>/gi, "$1");
  next = next.replace(/<u\b[^>]*>([\s\S]+?)<\/u>/gi, "$1");
  next = next.replace(/<ins\b[^>]*>([\s\S]+?)<\/ins>/gi, "$1");
  next = next.replace(/<span\b[^>]*data-type=["'](?:u|underline)["'][^>]*>([\s\S]+?)<\/span>/gi, "$1");
  next = next.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  next = next.replace(/\[\[([^\]]+)\]\]/g, "$1");
  next = next.replace(/\s+/g, " ").trim();
  return next;
}

function isFilteredKeyInfoText(type: KeyInfoType, text: string): boolean {
  const cleaned = (text || "").trim();
  if (!cleaned) {
    return true;
  }
  if (type === "bold" && cleaned === "*") {
    return true;
  }
  if (type === "italic" && cleaned === "\\") {
    return true;
  }
  if (type === "italic" && cleaned === "*") {
    return true;
  }
  if (type === "highlight" && cleaned === "=") {
    return true;
  }
  return false;
}

function maskCodeBlocks(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  let fenceChar = "";
  let fenceLen = 0;
  const masked = lines.map((line) => {
    const match = line.match(/^\s*(```+|~~~+)/);
    if (match) {
      const fence = match[1];
      if (!inFence) {
        inFence = true;
        fenceChar = fence[0];
        fenceLen = fence.length;
      } else if (
        fence[0] === fenceChar &&
        fence.length >= fenceLen
      ) {
        inFence = false;
      }
      return " ".repeat(line.length);
    }
    if (inFence) {
      return " ".repeat(line.length);
    }
    return line;
  });
  return masked.join("\n");
}

function maskInlineCode(markdown: string): string {
  const chars = markdown.split("");
  let i = 0;
  while (i < chars.length) {
    if (chars[i] !== "`") {
      i += 1;
      continue;
    }
    let tickLen = 1;
    while (i + tickLen < chars.length && chars[i + tickLen] === "`") {
      tickLen += 1;
    }
    let j = i + tickLen;
    let found = -1;
    while (j < chars.length) {
      if (chars[j] !== "`") {
        j += 1;
        continue;
      }
      let run = 1;
      while (j + run < chars.length && chars[j + run] === "`") {
        run += 1;
      }
      if (run === tickLen) {
        found = j;
        break;
      }
      j += run;
    }
    if (found !== -1) {
      for (let k = i; k < found + tickLen; k += 1) {
        chars[k] = " ";
      }
      i = found + tickLen;
    } else {
      i += 1;
    }
  }
  return chars.join("");
}

const BLOCK_ID_PATTERN = "[0-9]{14}-[a-z0-9]{7,}";
const BLOCK_REF_PATTERN = new RegExp(
  `\\(\\(\\s*(${BLOCK_ID_PATTERN})(?:\\s+(?:\"((?:\\\\.|[^\"\\\\])*)\"|'((?:\\\\.|[^'\\\\])*)'))?\\s*\\)\\)`,
  "gi"
);
const WIKI_REF_PATTERN = new RegExp(
  `\\[\\[\\s*(${BLOCK_ID_PATTERN})(?:\\s+(?:\"((?:\\\\.|[^\"\\\\])*)\"|'((?:\\\\.|[^'\\\\])*)'))?\\s*\\]\\]`,
  "gi"
);

function maskMarkdown(markdown: string): string {
  return maskInlineCode(maskCodeBlocks(markdown));
}

function applyMaskRanges(
  text: string,
  ranges: Array<[number, number]>
): string {
  if (!ranges.length) {
    return text;
  }
  const chars = text.split("");
  for (const [start, end] of ranges) {
    for (let i = start; i < end && i < chars.length; i += 1) {
      chars[i] = " ";
    }
  }
  return chars.join("");
}

function collectRegexMatches(
  text: string,
  original: string,
  pattern: RegExp,
  type: KeyInfoType,
  groupIndex: number,
  rawBuilder?: (raw: string, cleaned: string) => string
): { items: KeyInfoExtract[]; ranges: Array<[number, number]> } {
  const items: KeyInfoExtract[] = [];
  const ranges: Array<[number, number]> = [];
  let match: RegExpExecArray | null;
  match = pattern.exec(text);
  while (match) {
    const matchRaw = match[0] || "";
    const rawSlice = original.slice(match.index, match.index + matchRaw.length) || matchRaw;
    const maskedGroup = match[groupIndex] || "";
    const cleaned = normalizeInlineText(maskedGroup) || normalizeInlineText(rawSlice);
    const raw = rawBuilder ? rawBuilder(rawSlice, cleaned) : rawSlice.trim();
    if (!isFilteredKeyInfoText(type, cleaned)) {
      items.push({
        type,
        text: cleaned,
        raw: raw.trim(),
        offset: match.index,
      });
      ranges.push([match.index, match.index + match[0].length]);
    }
    match = pattern.exec(text);
  }
  return { items, ranges };
}

function extractHeadings(
  markdown: string,
  masked: string
): { items: KeyInfoExtract[]; ranges: Array<[number, number]> } {
  const items: KeyInfoExtract[] = [];
  const ranges: Array<[number, number]> = [];
  const originalLines = markdown.split(/\r?\n/);
  const maskedLines = masked.split(/\r?\n/);
  let offset = 0;
  for (let i = 0; i < maskedLines.length; i += 1) {
    const line = maskedLines[i];
    const match = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (match) {
      const rawLine = originalLines[i] || "";
      const raw = rawLine.trimEnd();
      const rawContent = rawLine
        .replace(/^\s*#{1,6}\s+/, "")
        .replace(/\s+#+\s*$/, "");
      const cleaned = normalizeInlineText(rawContent);
      if (cleaned) {
        items.push({
          type: "title",
          text: cleaned,
          raw: raw.trim() || `# ${cleaned}`,
          offset,
        });
      }
      ranges.push([offset, offset + (originalLines[i]?.length ?? 0)]);
    }
    offset += (originalLines[i]?.length ?? 0) + 1;
  }
  return { items, ranges };
}

function collectHtmlWrappedMatches(
  masked: string,
  original: string,
  tagName: string,
  type: KeyInfoType,
  wrapper: (cleaned: string) => string
): { items: KeyInfoExtract[]; ranges: Array<[number, number]> } {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]+?)<\\/${tagName}>`, "gi");
  return collectRegexMatches(masked, original, pattern, type, 1, (_raw, cleaned) => wrapper(cleaned));
}

function normalizeTagText(value: string): string {
  let text = value.trim();
  text = text.replace(/^#+/, "");
  text = text.replace(/[)\].,;:!?，。！？、#＃]+$/g, "");
  return text.trim();
}

function extractTags(original: string, masked: string): KeyInfoExtract[] {
  const items: KeyInfoExtract[] = [];
  const isWordChar = (value: string): boolean => /[A-Za-z0-9_]/.test(value);
  const isWhitespace = (value: string): boolean => /\s/.test(value);

  for (let index = 0; index < masked.length; index += 1) {
    if (masked[index] !== "#") {
      continue;
    }
    const prev = index > 0 ? masked[index - 1] : "";
    if (prev && isWordChar(prev)) {
      continue;
    }
    const next = masked[index + 1] || "";
    if (!next || isWhitespace(next) || next === "#") {
      continue;
    }

    let end = index + 1;
    while (end < masked.length) {
      const char = masked[end];
      if (isWhitespace(char)) {
        break;
      }
      if (char === "#") {
        end += 1;
        break;
      }
      end += 1;
    }

    const rawSlice = original.slice(index, end);
    const cleaned = normalizeTagText(rawSlice);
    if (cleaned) {
      items.push({
        type: "tag",
        text: cleaned,
        raw: (rawSlice || `#${cleaned}`).trim(),
        offset: index,
      });
    }

    index = end - 1;
  }
  let match: RegExpExecArray | null;
  const spanPattern = /<span[^>]*data-type=["']tag["'][^>]*>([\s\S]+?)<\/span>/gi;
  match = spanPattern.exec(masked);
  while (match) {
    const cleaned = normalizeTagText(match[1] || "");
    if (cleaned) {
      items.push({
        type: "tag",
        text: cleaned,
        raw: `#${cleaned}`,
        offset: match.index,
      });
    }
    match = spanPattern.exec(masked);
  }
  return items;
}

function extractLinksAndRefs(
  original: string,
  masked: string
): { items: KeyInfoExtract[]; ranges: Array<[number, number]> } {
  const items: KeyInfoExtract[] = [];
  const ranges: Array<[number, number]> = [];
  const isIgnoredLinkTarget = (href: string) => /^zotero:\/\//i.test((href || "").trim());

  const pushItem = (type: "link" | "ref", raw: string, offset: number, length: number) => {
    const cleaned = (raw || "").trim();
    if (!cleaned) {
      return;
    }
    items.push({
      type,
      text: cleaned,
      raw: cleaned,
      offset,
    });
    ranges.push([offset, offset + length]);
  };

  const markdownLinkPattern = /(?<!!)\[([^\]]+?)\]\(\s*([^)]+?)\s*\)/g;
  let match = markdownLinkPattern.exec(masked);
  while (match) {
    const raw = original.slice(match.index, match.index + match[0].length) || match[0];
    const href = (match[2] || "").trim();
    if (href && !isIgnoredLinkTarget(href)) {
      const trailingChar = original[match.index + match[0].length] || "";
      const isWrappedMarkdownLink = raw.startsWith("[[") && trailingChar === "]";
      const normalizedRaw = isWrappedMarkdownLink ? raw.slice(1) : raw;
      const rangeLength = match[0].length + (isWrappedMarkdownLink ? 1 : 0);
      pushItem("link", normalizedRaw, match.index, rangeLength);
    }
    match = markdownLinkPattern.exec(masked);
  }

  const autoLinkPattern = /<((?:https?:\/\/|siyuan:\/\/blocks\/)[^>\s]+)>/gi;
  match = autoLinkPattern.exec(masked);
  while (match) {
    const raw = original.slice(match.index, match.index + match[0].length) || match[0];
    const href = (match[1] || "").trim();
    if (href) {
      pushItem("link", raw, match.index, match[0].length);
    }
    match = autoLinkPattern.exec(masked);
  }

  const htmlLinkPattern = /<a\b[^>]*href=(['"])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  match = htmlLinkPattern.exec(masked);
  while (match) {
    const raw = original.slice(match.index, match.index + match[0].length) || match[0];
    const href = (match[2] || "").trim();
    if (href && !isIgnoredLinkTarget(href)) {
      pushItem("link", raw, match.index, match[0].length);
    }
    match = htmlLinkPattern.exec(masked);
  }

  BLOCK_REF_PATTERN.lastIndex = 0;
  match = BLOCK_REF_PATTERN.exec(masked);
  while (match) {
    const raw = original.slice(match.index, match.index + match[0].length) || match[0];
    if ((match[1] || "").trim()) {
      pushItem("ref", raw, match.index, match[0].length);
    }
    match = BLOCK_REF_PATTERN.exec(masked);
  }

  WIKI_REF_PATTERN.lastIndex = 0;
  match = WIKI_REF_PATTERN.exec(masked);
  while (match) {
    const raw = original.slice(match.index, match.index + match[0].length) || match[0];
    if ((match[1] || "").trim()) {
      pushItem("ref", raw, match.index, match[0].length);
    }
    match = WIKI_REF_PATTERN.exec(masked);
  }

  return { items, ranges };
}

export function extractKeyInfoFromMarkdown(markdown: string): KeyInfoExtract[] {
  if (!markdown) {
    return [];
  }
  const masked = maskMarkdown(markdown);
  const items: KeyInfoExtract[] = [];

  const headingExtract = extractHeadings(markdown, masked);
  items.push(...headingExtract.items);
  const maskedWithoutHeadings = applyMaskRanges(masked, headingExtract.ranges);
  const linkRefExtract = extractLinksAndRefs(markdown, maskedWithoutHeadings);
  items.push(...linkRefExtract.items);
  const maskedWithoutLinksRefs = applyMaskRanges(maskedWithoutHeadings, linkRefExtract.ranges);

  const highlightMarks = collectRegexMatches(
    maskedWithoutLinksRefs,
    markdown,
    /==([^\n]+?)==/g,
    "highlight",
    1
  );
  items.push(...highlightMarks.items);

  const highlightTags = collectHtmlWrappedMatches(
    maskedWithoutLinksRefs,
    markdown,
    "mark",
    "highlight",
    (cleaned) => `==${cleaned}==`
  );
  items.push(...highlightTags.items);

  const highlightSpans = collectRegexMatches(
    maskedWithoutLinksRefs,
    markdown,
    /<span[^>]*data-type=["']mark["'][^>]*>([\s\S]+?)<\/span>/gi,
    "highlight",
    1,
    (_raw, cleaned) => `==${cleaned}==`
  );
  items.push(...highlightSpans.items);

  const remarkMatches = collectRegexMatches(
    maskedWithoutLinksRefs,
    markdown,
    /%%([^\n]+?)%%/g,
    "remark",
    1
  );
  items.push(...remarkMatches.items);

  const boldMatches = collectRegexMatches(
    maskedWithoutLinksRefs,
    markdown,
    /(?<!\\)(\*\*|__)([^\n]+?)(?<!\\)\1/g,
    "bold",
    2
  );
  items.push(...boldMatches.items);

  const strongMatches = collectHtmlWrappedMatches(
    maskedWithoutLinksRefs,
    markdown,
    "strong",
    "bold",
    (cleaned) => `**${cleaned}**`
  );
  items.push(...strongMatches.items);

  const maskedWithoutBold = applyMaskRanges(maskedWithoutLinksRefs, boldMatches.ranges);
  const italicMatches = collectRegexMatches(
    maskedWithoutBold,
    markdown,
    /(?<!\\)(\*|_)([^\n]+?)(?<!\\)\1/g,
    "italic",
    2
  );
  items.push(...italicMatches.items);

  const emMatches = collectHtmlWrappedMatches(
    maskedWithoutLinksRefs,
    markdown,
    "em",
    "italic",
    (cleaned) => `*${cleaned}*`
  );
  items.push(...emMatches.items);

  const italicTagMatches = collectHtmlWrappedMatches(
    maskedWithoutLinksRefs,
    markdown,
    "i",
    "italic",
    (cleaned) => `*${cleaned}*`
  );
  items.push(...italicTagMatches.items);

  const underlineMatches = collectHtmlWrappedMatches(
    maskedWithoutLinksRefs,
    markdown,
    "u",
    "underline",
    (cleaned) => `<u>${cleaned}</u>`
  );
  items.push(...underlineMatches.items);

  const underlineInsertMatches = collectHtmlWrappedMatches(
    maskedWithoutLinksRefs,
    markdown,
    "ins",
    "underline",
    (cleaned) => `<u>${cleaned}</u>`
  );
  items.push(...underlineInsertMatches.items);

  const underlineSpanMatches = collectRegexMatches(
    maskedWithoutLinksRefs,
    markdown,
    /<span[^>]*data-type=["'](?:u|underline)["'][^>]*>([\s\S]+?)<\/span>/gi,
    "underline",
    1,
    (_raw, cleaned) => `<u>${cleaned}</u>`
  );
  items.push(...underlineSpanMatches.items);

  items.push(...extractTags(markdown, maskedWithoutLinksRefs));

  items.sort((a, b) => a.offset - b.offset);
  return items;
}
