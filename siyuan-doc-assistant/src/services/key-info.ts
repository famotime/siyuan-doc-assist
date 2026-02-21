import { extractKeyInfoFromMarkdown, KeyInfoItem, KeyInfoType } from "@/core/key-info-core";
import {
  getBlockKramdowns,
  getDocMetaByID,
  getRootDocRawMarkdown,
  sql,
} from "@/services/kernel";

type SqlKeyInfoRow = {
  id: string;
  sort: number | string;
  type?: string;
  subtype?: string;
  content?: string;
  markdown: string;
  memo: string;
  tag: string;
};

type SqlSpanRow = {
  id: string;
  block_id: string;
  root_id: string;
  content: string;
  markdown: string;
  type: string;
  ial?: string;
  start_offset?: number | string;
  block_sort?: number | string | null;
};

type KeyInfoDocResult = {
  docId: string;
  docTitle: string;
  items: KeyInfoItem[];
};

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function normalizeTitle(value: string): string {
  return (value || "").replace(/\s+/g, "").trim().toLowerCase();
}

function splitTags(raw: string): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .map((item) => item.replace(/^#+/, ""))
    .filter(Boolean);
}

function normalizeSort(value: number | string, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function listDocBlocks(docId: string): Promise<SqlKeyInfoRow[]> {
  const rows = await sql<SqlKeyInfoRow>(
    `select id, sort, type, subtype, content, markdown, memo, tag
     from blocks
     where root_id='${escapeSqlLiteral(docId)}'
     order by sort asc`
  );
  return rows || [];
}

async function resolveRootId(docId: string): Promise<string> {
  if (!docId) {
    return docId;
  }
  try {
    const rows = await sql<{ root_id: string }>(
      `select root_id from blocks where id='${escapeSqlLiteral(docId)}' limit 1`
    );
    const rootId = rows?.[0]?.root_id;
    return rootId || docId;
  } catch {
    return docId;
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

let spanOrderColumn: string | null = null;
let spanColumnsLoaded = false;

async function resolveSpanOrderColumn(): Promise<string | null> {
  if (spanColumnsLoaded) {
    return spanOrderColumn;
  }
  spanColumnsLoaded = true;
  try {
    const columns = await sql<{ name: string }>(`pragma table_info(spans)`);
    const names = new Set(
      (columns || []).map((item) => (item.name || "").toLowerCase())
    );
    const candidates = ["start_offset", "start", "offset", "pos", "position"];
    spanOrderColumn = candidates.find((name) => names.has(name)) || null;
  } catch {
    spanOrderColumn = null;
  }
  return spanOrderColumn;
}

function cleanInlineText(text: string): string {
  return (text || "").replace(/\u200B/g, "").replace(/\s+/g, " ").trim();
}

function tokenizeType(value: string): string[] {
  return (value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function parseInlineMemoFromText(text: string, memoHint?: string): { marked: string; memo: string } {
  const cleaned = cleanInlineText(text);
  const memo = (memoHint || "").trim();
  if (memo) {
    return { marked: cleaned, memo };
  }
  let match = cleaned.match(/^(.+?)（(.+?)）$/);
  if (match) {
    return { marked: match[1].trim(), memo: match[2].trim() };
  }
  match = cleaned.match(/^(.+?)\((.+?)\)$/);
  if (match) {
    return { marked: match[1].trim(), memo: match[2].trim() };
  }
  return { marked: cleaned, memo: "" };
}

function buildInlineRaw(type: KeyInfoType, text: string): string {
  if (type === "bold") {
    return `**${text}**`;
  }
  if (type === "italic") {
    return `*${text}*`;
  }
  if (type === "highlight") {
    return `==${text}==`;
  }
  if (type === "tag") {
    return `#${text}`;
  }
  return text;
}

function resolveSpanFormatType(spanType: string, ial?: string): KeyInfoType | null {
  const normalized = [spanType, ial].filter(Boolean).join(" ").toLowerCase();
  const tokens = tokenizeType(normalized);
  const hasToken = (token: string) => tokens.includes(token);
  const hasInlineMemo =
    normalized.includes("inline-memo") ||
    (hasToken("inline") && hasToken("memo"));
  if (hasInlineMemo) {
    return "remark";
  }
  if (hasToken("tag")) {
    return "tag";
  }
  if (hasToken("strong")) {
    return "bold";
  }
  if (hasToken("em")) {
    return "italic";
  }
  if (hasToken("mark") || hasToken("textmark") || hasToken("text")) {
    return "highlight";
  }
  return null;
}

async function listSpanRows(docId: string): Promise<SqlSpanRow[]> {
  const orderColumn = await resolveSpanOrderColumn();
  const typeConditions = [
    "s.type LIKE '%textmark%'",
    "s.type LIKE '%strong%'",
    "s.type LIKE '%em%'",
    "s.type LIKE '%mark%'",
    "s.type LIKE '%inline-memo%'",
    "s.type LIKE '%tag%'",
  ];
  const orderBy = orderColumn ? `s.${orderColumn} asc` : "s.id asc";
  const stmt = `
    select s.*, b.sort as block_sort
    from spans s
    left join blocks b on b.id = s.block_id
    where s.root_id='${escapeSqlLiteral(docId)}'
      and (${typeConditions.join(" OR ")})
    order by b.sort asc, ${orderBy}
  `;
  const rows = await sql<SqlSpanRow>(stmt.trim());
  return rows || [];
}

function extractInlineMemoHint(ial?: string): string {
  if (!ial) {
    return "";
  }
  const match = ial.match(
    /(?:inline-memo|memo|data-inline-memo-content|data-memo-content|data-memo)=["']([^"']+)["']/i
  );
  return match ? match[1] : "";
}

function mapSpanRowsToItems(
  spans: SqlSpanRow[],
  blockSortMap: Map<string, number>
): KeyInfoItem[] {
  const items: KeyInfoItem[] = [];
  let order = 0;
  spans.forEach((span) => {
    const type = resolveSpanFormatType(span.type || "", span.ial);
    if (!type) {
      return;
    }
    const rawSource = (span.markdown || "").trim();
    const content = cleanInlineText(span.content || rawSource);
    if (!content) {
      return;
    }
    const blockId = span.block_id || span.root_id;
    const blockSort =
      blockSortMap.get(blockId) ??
      normalizeSort(span.block_sort ?? Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    const offsetRaw =
      span.start_offset ??
      (span as any).start ??
      (span as any).offset ??
      (span as any).pos ??
      (span as any).position ??
      order;
    const offset = normalizeSort(offsetRaw as number | string, order);

    let text = content;
    let raw = rawSource;
    if (type === "tag") {
      const tagText = content.replace(/^#+/, "");
      text = tagText || content;
      raw = raw || `#${text}`;
    } else if (type === "remark") {
      const memoHint = extractInlineMemoHint(span.ial);
      const memoResult = parseInlineMemoFromText(content, memoHint);
      text = memoResult.memo
        ? `${memoResult.marked} (${memoResult.memo})`
        : memoResult.marked;
      raw = raw || (memoResult.memo ? `${memoResult.marked}(${memoResult.memo})` : memoResult.marked);
    } else {
      raw = raw || buildInlineRaw(type, text);
    }

    items.push({
      id: `span-${span.id || blockId}-${order}`,
      type,
      text,
      raw,
      offset,
      blockId,
      blockSort,
      order,
    });
    order += 1;
  });
  return items;
}

function extractInlineFromDom(
  protyle: any,
  blockSortMap: Map<string, number>,
  docId: string
): KeyInfoItem[] {
  const root = protyle?.wysiwyg?.element as HTMLElement | undefined;
  if (!root) {
    return [];
  }
  const selectors = [
    "strong",
    "b",
    "[data-type='strong']",
    "em",
    "i",
    "[data-type='em']",
    "mark",
    "[data-type='mark']",
    "[data-type='textmark']",
    "[data-type='text']",
    "span[data-type='inline-memo']",
    "span[data-inline-memo-content]",
    "span[data-memo-content]",
    "span[data-memo]",
    "span[data-type='tag']",
  ];
  const elements = root.querySelectorAll(selectors.join(","));
  const items: KeyInfoItem[] = [];
  let order = 0;
  elements.forEach((element) => {
    const dataType = (element.getAttribute("data-type") || "").toLowerCase();
    const dataSubtype = (element.getAttribute("data-subtype") || "").toLowerCase();
    const tagName = element.tagName.toLowerCase();
    const tokens = tokenizeType(`${dataType} ${dataSubtype}`);
    const hasToken = (token: string) => tokens.includes(token);
    const textContent = cleanInlineText(element.textContent || "");
    if (!textContent) {
      return;
    }

    let type: KeyInfoType | null = null;
    let text = textContent;
    let raw = "";

    const memoHint =
      element.getAttribute("data-inline-memo-content") ||
      element.getAttribute("data-memo-content") ||
      element.getAttribute("data-memo") ||
      element.getAttribute("title") ||
      "";

    const hasInlineMemo =
      dataType.includes("inline-memo") ||
      (hasToken("inline") && hasToken("memo")) ||
      !!memoHint;

    if (hasInlineMemo) {
      type = "remark";
      const memoResult = parseInlineMemoFromText(textContent, memoHint);
      text = memoResult.memo
        ? `${memoResult.marked} (${memoResult.memo})`
        : memoResult.marked;
      raw = memoResult.memo
        ? `${memoResult.marked}(${memoResult.memo})`
        : memoResult.marked;
    } else if (dataType === "tag" || hasToken("tag")) {
      type = "tag";
      const tagText = textContent.replace(/^#+/, "");
      text = tagText || textContent;
      raw = `#${text}`;
    } else if (
      tagName === "strong" ||
      tagName === "b" ||
      dataType === "strong" ||
      hasToken("strong")
    ) {
      type = "bold";
      raw = buildInlineRaw(type, text);
    } else if (
      tagName === "em" ||
      tagName === "i" ||
      dataType === "em" ||
      hasToken("em")
    ) {
      type = "italic";
      raw = buildInlineRaw(type, text);
    } else if (
      tagName === "mark" ||
      dataType === "mark" ||
      dataType === "textmark" ||
      dataType === "text" ||
      hasToken("mark") ||
      hasToken("textmark") ||
      hasToken("text")
    ) {
      type = "highlight";
      raw = buildInlineRaw(type, text);
    }

    if (!type) {
      return;
    }

    const blockElement = element.closest("[data-node-id]") as HTMLElement | null;
    const blockId =
      blockElement?.dataset.nodeId ||
      blockElement?.getAttribute("data-node-id") ||
      docId;
    const blockSort =
      blockSortMap.get(blockId) ?? blockSortMap.get(docId) ?? 0;

    items.push({
      id: `dom-${blockId}-${order}`,
      type,
      text,
      raw,
      offset: order,
      blockId,
      blockSort,
      order,
    });
    order += 1;
  });
  return items;
}

function getDomBlockSortMap(protyle: any): Map<string, number> {
  const map = new Map<string, number>();
  const root = protyle?.wysiwyg?.element as HTMLElement | undefined;
  if (!root) {
    return map;
  }
  const elements = root.querySelectorAll("[data-node-id]");
  let index = 0;
  elements.forEach((element) => {
    const id =
      element.getAttribute("data-node-id") ||
      (element as HTMLElement).dataset.nodeId;
    if (!id || map.has(id)) {
      return;
    }
    map.set(id, index);
    index += 1;
  });
  return map;
}

async function getKramdownMap(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!ids.length) {
    return map;
  }
  const chunks = chunkArray(ids, 50);
  for (const chunk of chunks) {
    try {
      const rows = await getBlockKramdowns(chunk);
      rows.forEach((row) => {
        if (row?.id) {
          map.set(row.id, row.kramdown || "");
        }
      });
    } catch {
      // Ignore and fallback to DB markdown.
    }
  }
  return map;
}

export async function getDocKeyInfo(docId: string, protyle?: any): Promise<KeyInfoDocResult> {
  const rootId = await resolveRootId(docId);
  const docMeta = await getDocMetaByID(rootId);
  const docTitle = docMeta?.title || "";
  let rows = await listDocBlocks(rootId);

  if (!rows.length) {
    const fallbackMarkdown = await getRootDocRawMarkdown(rootId);
    if (fallbackMarkdown) {
      rows = [
        {
          id: rootId,
          sort: 0,
          markdown: fallbackMarkdown,
          memo: "",
          tag: "",
        },
      ];
    }
  }

  const kramdownMap = await getKramdownMap(rows.map((row) => row.id));
  const items: KeyInfoItem[] = [];
  const markdownInlineItems: KeyInfoItem[] = [];
  let order = 0;
  const blockSortMap = new Map<string, number>();
  rows.forEach((row, index) => {
    const blockSort = normalizeSort(row.sort, index);
    blockSortMap.set(row.id, blockSort);
  });
  const domBlockSort = getDomBlockSortMap(protyle);
  domBlockSort.forEach((value, key) => {
    blockSortMap.set(key, value);
  });
  blockSortMap.set(rootId, blockSortMap.get(rootId) ?? -1);

  rows.forEach((row) => {
    if (row.type === "h") {
      const levelMatch = (row.subtype || "").match(/h([1-6])/i);
      const level = levelMatch ? Number(levelMatch[1]) : 1;
      const text = cleanInlineText(row.content || "");
      if (text) {
        items.push({
          id: `${row.id}-heading-${order}`,
          type: "title",
          text,
          raw: `${"#".repeat(level)} ${text}`,
          offset: 0,
          blockId: row.id,
          blockSort: blockSortMap.get(row.id) ?? 0,
          order,
        });
        order += 1;
      }
    }
  });

  rows.forEach((row, index) => {
    const blockSort = blockSortMap.get(row.id) ?? normalizeSort(row.sort, index);
    const markdown = kramdownMap.get(row.id) || row.markdown || "";
    const extracted = extractKeyInfoFromMarkdown(markdown);
    for (const item of extracted) {
      if (item.type === "title") {
        if (row.type === "h") {
          continue;
        }
        items.push({
          id: `${row.id}-${order}`,
          type: item.type,
          text: item.text,
          raw: item.raw,
          offset: item.offset,
          blockId: row.id,
          blockSort,
          order,
        });
        order += 1;
        continue;
      }
      markdownInlineItems.push({
        id: `${row.id}-inline-${order}`,
        type: item.type,
        text: item.text,
        raw: item.raw,
        offset: item.offset,
        blockId: row.id,
        blockSort,
        order,
      });
      order += 1;
    }

    const memoText = (row.memo || "").trim();
    if (memoText) {
      items.push({
        id: `${row.id}-memo-${order}`,
        type: "remark",
        text: memoText,
        raw: `%%${memoText}%%`,
        offset: 1_000_000,
        blockId: row.id,
        blockSort,
        order,
      });
      order += 1;
    }

    const tags = splitTags(row.tag || "");
    tags.forEach((tag) => {
      items.push({
        id: `${row.id}-tag-${order}`,
        type: "tag",
        text: tag,
        raw: `#${tag}`,
        offset: 1_000_000 + order,
        blockId: row.id,
        blockSort,
        order,
      });
      order += 1;
    });
  });

  const spans = await listSpanRows(rootId);
  const spanItems = mapSpanRowsToItems(spans, blockSortMap);
  const domItems = extractInlineFromDom(protyle, blockSortMap, rootId);
  if (domItems.length || spanItems.length) {
    const spanBuckets = new Map<string, KeyInfoItem[]>();
    spanItems.forEach((item) => {
      const key = `${item.type}|${item.text}|${item.blockId}`;
      const bucket = spanBuckets.get(key) || [];
      bucket.push(item);
      spanBuckets.set(key, bucket);
    });

    const mergedDom = domItems.map((item) => {
      const key = `${item.type}|${item.text}|${item.blockId}`;
      const bucket = spanBuckets.get(key);
      if (bucket && bucket.length) {
        const match = bucket.shift() as KeyInfoItem;
        return {
          ...item,
          raw: match.raw || item.raw,
          offset: match.offset ?? item.offset,
        };
      }
      return item;
    });

    const remainingSpans: KeyInfoItem[] = [];
    spanBuckets.forEach((bucket) => {
      remainingSpans.push(...bucket);
    });

    items.push(...mergedDom, ...remainingSpans);
  } else if (markdownInlineItems.length) {
    items.push(...markdownInlineItems);
  }

  const normalizedDocTitle = normalizeTitle(docTitle);
  const hasDocTitleHeading =
    docTitle &&
    items.some(
      (item) =>
        item.type === "title" &&
        normalizeTitle(item.text) === normalizedDocTitle
    );
  if (docTitle && !hasDocTitleHeading) {
    items.push({
      id: `doc-title-${order}`,
      type: "title",
      text: docTitle,
      raw: `# ${docTitle}`,
      offset: -1,
      blockId: rootId,
      blockSort: -1,
      order,
    });
  }

  items.sort((a, b) => {
    if (a.blockSort !== b.blockSort) {
      return a.blockSort - b.blockSort;
    }
    if (a.offset !== b.offset) {
      return a.offset - b.offset;
    }
    return a.order - b.order;
  });

  return {
    docId: rootId,
    docTitle,
    items,
  };
}
