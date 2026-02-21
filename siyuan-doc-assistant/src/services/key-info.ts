import { extractKeyInfoFromMarkdown, KeyInfoItem } from "@/core/key-info-core";
import {
  getBlockKramdowns,
  getDocMetaByID,
  getRootDocRawMarkdown,
  sql,
} from "@/services/kernel";

type SqlKeyInfoRow = {
  id: string;
  sort: number | string;
  markdown: string;
  memo: string;
  tag: string;
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
    `select id, sort, markdown, memo, tag
     from blocks
     where root_id='${escapeSqlLiteral(docId)}'
     order by sort asc`
  );
  return rows || [];
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
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

export async function getDocKeyInfo(docId: string): Promise<KeyInfoDocResult> {
  const docMeta = await getDocMetaByID(docId);
  const docTitle = docMeta?.title || "";
  let rows = await listDocBlocks(docId);

  if (!rows.length) {
    const fallbackMarkdown = await getRootDocRawMarkdown(docId);
    if (fallbackMarkdown) {
      rows = [
        {
          id: docId,
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
  let order = 0;
  rows.forEach((row, index) => {
    const blockSort = normalizeSort(row.sort, index);
    const markdown = kramdownMap.get(row.id) || row.markdown || "";
    const extracted = extractKeyInfoFromMarkdown(markdown);
    for (const item of extracted) {
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
      blockId: docId,
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
    docId,
    docTitle,
    items,
  };
}
