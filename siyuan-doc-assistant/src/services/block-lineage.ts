import { sql } from "@/services/kernel";

type SqlBlockParentRow = {
  id: string;
  parent_id: string;
  root_id: string;
};

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

export async function resolveDocDirectChildBlockId(
  docId: string,
  blockId: string
): Promise<string> {
  const targetDocId = (docId || "").trim();
  let currentId = (blockId || "").trim();
  if (!targetDocId || !currentId) {
    return "";
  }

  const visited = new Set<string>();
  for (let depth = 0; depth < 64; depth += 1) {
    if (!currentId || visited.has(currentId)) {
      return "";
    }
    visited.add(currentId);
    const rows = await sql<SqlBlockParentRow>(
      `select id, parent_id, root_id
       from blocks
       where id='${escapeSqlLiteral(currentId)}'
       limit 1`
    );
    if (!rows.length) {
      return "";
    }
    const row = rows[0];
    if (row.id === targetDocId) {
      return "";
    }
    if (row.root_id && row.root_id !== targetDocId) {
      return "";
    }
    if (row.parent_id === targetDocId) {
      return row.id;
    }
    currentId = row.parent_id || "";
  }

  return "";
}
