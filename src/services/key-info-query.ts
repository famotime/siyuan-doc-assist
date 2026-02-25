import { getBlockKramdowns, sql } from "@/services/kernel";
import {
  chunkArray,
  escapeSqlLiteral,
  SqlKeyInfoRow,
  SqlSpanRow,
} from "@/services/key-info-model";

async function queryAllRows<T = unknown>(stmt: string, pageSize = 500): Promise<T[]> {
  const rows: T[] = [];
  const base = stmt.trim().replace(/;$/, "");
  let offset = 0;
  while (true) {
    const page = await sql<T>(`${base} limit ${pageSize} offset ${offset}`);
    if (!page || page.length === 0) {
      break;
    }
    rows.push(...page);
    if (page.length < pageSize) {
      break;
    }
    offset += page.length;
  }
  return rows;
}

export async function listDocBlocks(docId: string): Promise<SqlKeyInfoRow[]> {
  return queryAllRows<SqlKeyInfoRow>(
    `select id, parent_id, sort, type, subtype, content, markdown, memo, tag
     from blocks
     where root_id='${escapeSqlLiteral(docId)}'
     order by sort asc`
  );
}

export async function resolveRootId(docId: string): Promise<string> {
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

export async function listSpanRows(docId: string): Promise<SqlSpanRow[]> {
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
  return queryAllRows<SqlSpanRow>(stmt.trim());
}

export async function getKramdownMap(ids: string[]): Promise<Map<string, string>> {
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
