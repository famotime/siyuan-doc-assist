export type KeyInfoType =
  | "title"
  | "bold"
  | "italic"
  | "highlight"
  | "remark"
  | "tag";

export type KeyInfoFilter = "all" | KeyInfoType;

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
};

const KEY_INFO_TYPE_LABELS: Record<KeyInfoType, string> = {
  title: "标题",
  bold: "加粗",
  italic: "斜体",
  highlight: "高亮",
  remark: "备注",
  tag: "标签",
};

export function keyInfoTypeLabel(type: KeyInfoType): string {
  return KEY_INFO_TYPE_LABELS[type] || type;
}

export function buildKeyInfoMarkdown(
  items: Array<Pick<KeyInfoExtract, "raw" | "text">>
): string {
  return items
    .map((item) => (item.raw || item.text || "").trim())
    .filter(Boolean)
    .join("\n");
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
  next = next.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  next = next.replace(/\[\[([^\]]+)\]\]/g, "$1");
  next = next.replace(/\s+/g, " ").trim();
  return next;
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
  groupIndex: number
): { items: KeyInfoExtract[]; ranges: Array<[number, number]> } {
  const items: KeyInfoExtract[] = [];
  const ranges: Array<[number, number]> = [];
  let match: RegExpExecArray | null;
  match = pattern.exec(text);
  while (match) {
    const matchRaw = match[0] || "";
    const raw = original.slice(match.index, match.index + matchRaw.length) || matchRaw;
    const cleaned = normalizeInlineText(match[groupIndex] || raw);
    if (cleaned) {
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

function extractHeadings(markdown: string, masked: string): KeyInfoExtract[] {
  const items: KeyInfoExtract[] = [];
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
    }
    offset += (originalLines[i]?.length ?? 0) + 1;
  }
  return items;
}

function normalizeTagText(value: string): string {
  let text = value.trim();
  text = text.replace(/^#+/, "");
  text = text.replace(/[)\].,;:!?，。！？、]+$/g, "");
  return text.trim();
}

function extractTags(original: string, masked: string): KeyInfoExtract[] {
  const items: KeyInfoExtract[] = [];
  const pattern = /(^|[^A-Za-z0-9_])#([^\s#][^\s]*)/gm;
  let match: RegExpExecArray | null;
  match = pattern.exec(masked);
  while (match) {
    const raw = match[2] || "";
    const cleaned = normalizeTagText(raw);
    if (cleaned) {
      const prefix = match[1] || "";
      const rawStart = match.index + prefix.length;
      const rawSlice = original.slice(rawStart, rawStart + match[0].length - prefix.length);
      items.push({
        type: "tag",
        text: cleaned,
        raw: (rawSlice || `#${cleaned}`).trim(),
        offset: match.index + prefix.length,
      });
    }
    match = pattern.exec(masked);
  }
  return items;
}

export function extractKeyInfoFromMarkdown(markdown: string): KeyInfoExtract[] {
  if (!markdown) {
    return [];
  }
  const masked = maskMarkdown(markdown);
  const items: KeyInfoExtract[] = [];

  items.push(...extractHeadings(markdown, masked));

  const highlightMarks = collectRegexMatches(
    masked,
    markdown,
    /==([^\n]+?)==/g,
    "highlight",
    1
  );
  items.push(...highlightMarks.items);

  const highlightTags = collectRegexMatches(
    masked,
    markdown,
    /<mark>([\s\S]+?)<\/mark>/gi,
    "highlight",
    1
  );
  items.push(...highlightTags.items);

  const remarkMatches = collectRegexMatches(
    masked,
    markdown,
    /%%([^\n]+?)%%/g,
    "remark",
    1
  );
  items.push(...remarkMatches.items);

  const boldMatches = collectRegexMatches(
    masked,
    markdown,
    /(\*\*|__)([^\n]+?)\1/g,
    "bold",
    2
  );
  items.push(...boldMatches.items);

  const strongMatches = collectRegexMatches(
    masked,
    markdown,
    /<strong>([\s\S]+?)<\/strong>/gi,
    "bold",
    1
  );
  items.push(...strongMatches.items);

  const maskedWithoutBold = applyMaskRanges(masked, boldMatches.ranges);
  const italicMatches = collectRegexMatches(
    maskedWithoutBold,
    markdown,
    /(\*|_)([^\n]+?)\1/g,
    "italic",
    2
  );
  items.push(...italicMatches.items);

  const emMatches = collectRegexMatches(
    masked,
    markdown,
    /<em>([\s\S]+?)<\/em>/gi,
    "italic",
    1
  );
  items.push(...emMatches.items);

  const italicTagMatches = collectRegexMatches(
    masked,
    markdown,
    /<i>([\s\S]+?)<\/i>/gi,
    "italic",
    1
  );
  items.push(...italicTagMatches.items);

  items.push(...extractTags(markdown, masked));

  items.sort((a, b) => a.offset - b.offset);
  return items;
}
