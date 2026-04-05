import { extractSiyuanBlockIdsFromMarkdown } from "@/core/link-core";
import { escapeSqlLiteral, inClause, sql, sqlPaged } from "@/services/kernel-shared";

type SqlRootRow = {
  id: string;
  root_id: string;
};

export async function mapBlockIdsToRootDocIds(
  blockIds: string[]
): Promise<string[]> {
  if (!blockIds.length) {
    return [];
  }
  const rows = await sql<SqlRootRow>(
    `select id, root_id from blocks where id in (${inClause(blockIds)})`
  );
  const rootIds = new Set<string>();
  for (const row of rows) {
    // For document rows, root_id may be empty in some versions.
    // Fallback to row.id so doc links like siyuan://blocks/<doc-id> are kept.
    const resolved = row.root_id || row.id;
    if (resolved) {
      rootIds.add(resolved);
    }
  }
  return [...rootIds];
}

export async function getRootDocRawMarkdown(docId: string): Promise<string> {
  // Prefer the root document block markdown itself; this is closest to the
  // visible document source and avoids cross-block noise when concatenating.
  const docRows = await sql<{ markdown: string }>(
    `select markdown from blocks where type='d' and id='${escapeSqlLiteral(
      docId
    )}' limit 1`
  );
  const docMarkdown = docRows[0]?.markdown || "";
  if (docMarkdown) {
    return docMarkdown;
  }

  // Fallback for environments where document-row markdown is unavailable.
  const rows = await sql<{ markdown: string }>(
    `select markdown from blocks where root_id='${escapeSqlLiteral(docId)}'`
  );
  return rows.map((row) => row.markdown || "").filter(Boolean).join("\n");
}

export async function getForwardRefTargetBlockIds(docId: string): Promise<string[]> {
  try {
    const columns = await sql<{ name: string }>(`pragma table_info(refs)`);
    const nameSet = new Set(columns.map((item) => (item.name || "").toLowerCase()));
    if (!nameSet.has("block_id") || !nameSet.has("def_block_id")) {
      return [];
    }

    const rows = await sql<{ id: string }>(
      `select distinct r.def_block_id as id
       from refs r
       join blocks src on src.id = r.block_id
       where src.root_id='${escapeSqlLiteral(docId)}'
         and r.def_block_id is not null
         and r.def_block_id != ''
         and r.def_block_id != '${escapeSqlLiteral(docId)}'`
    );

    const set = new Set<string>();
    for (const row of rows) {
      if (row.id) {
        set.add(row.id);
      }
    }
    return [...set];
  } catch {
    return [];
  }
}

export async function getBacklinkSourceDocIdsFromRefs(docId: string): Promise<string[]> {
  const normalizedDocId = (docId || "").trim();
  if (!normalizedDocId) {
    return [];
  }

  try {
    const columns = await sql<{ name: string }>(`pragma table_info(refs)`);
    const nameSet = new Set(columns.map((item) => (item.name || "").toLowerCase()));
    if (!nameSet.has("root_id")) {
      return [];
    }

    const whereParts: string[] = [];
    if (nameSet.has("def_block_root_id")) {
      whereParts.push(`r.def_block_root_id='${escapeSqlLiteral(normalizedDocId)}'`);
    }
    if (nameSet.has("def_block_id")) {
      whereParts.push(`r.def_block_id='${escapeSqlLiteral(normalizedDocId)}'`);
    }
    if (!whereParts.length) {
      return [];
    }

    const rows = await sql<{ id: string }>(
      `select distinct r.root_id as id
       from refs r
       where (${whereParts.join(" or ")})
         and r.root_id is not null
         and r.root_id != ''
         and r.root_id != '${escapeSqlLiteral(normalizedDocId)}'`
    );

    return [...new Set(rows.map((row) => row.id).filter(Boolean))];
  } catch {
    return [];
  }
}

export async function getBacklinkSourceDocIdsFromMarkdown(docId: string): Promise<string[]> {
  const normalizedDocId = (docId || "").trim();
  if (!normalizedDocId) {
    return [];
  }

  const rows = await sqlPaged<{ root_id: string; markdown: string }>(
    `select root_id, markdown
     from blocks
     where root_id != '${escapeSqlLiteral(normalizedDocId)}'
       and markdown like '%${escapeSqlLiteral(normalizedDocId)}%'`
  );

  const result = new Set<string>();
  for (const row of rows) {
    const rootId = (row.root_id || "").trim();
    if (!rootId || rootId === normalizedDocId) {
      continue;
    }
    const extracted = extractSiyuanBlockIdsFromMarkdown(row.markdown || "");
    if (extracted.includes(normalizedDocId)) {
      result.add(rootId);
    }
  }
  return [...result];
}

export async function listDocsByParentSubtree(
  box: string,
  parentPrefix: string
): Promise<Array<{ id: string; hpath: string; updated: string }>> {
  return sqlPaged<Array<{ id: string; hpath: string; updated: string }>[number]>(
    `select id, hpath, updated
     from blocks
     where type='d'
       and box='${escapeSqlLiteral(box)}'
       and path like '${escapeSqlLiteral(parentPrefix)}%'
     order by path asc, id asc`
  );
}
