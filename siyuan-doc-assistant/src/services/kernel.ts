import { requestApi } from "@/services/request";

type BacklinkPath = {
  id: string;
  box: string;
  hPath: string;
  name: string;
  updated: string;
};

type Backlink2Res = {
  backlinks: BacklinkPath[];
  linkRefsCount: number;
  backmentions: BacklinkPath[];
  mentionsCount: number;
};

type ExportMdContentRes = {
  hPath: string;
  content: string;
};

type ExportMdContentOptions = {
  refMode?: number;
  embedMode?: number;
  addTitle?: boolean;
  yfm?: boolean;
  fillCSSVar?: boolean;
  adjustHeadingLevel?: boolean;
  imgTag?: boolean;
};

type ExportMdsRes = {
  name: string;
  zip: string;
};

type ExportResourcesRes = {
  path: string;
};

type SqlDocRow = {
  id: string;
  parent_id: string;
  root_id: string;
  box: string;
  path: string;
  hpath: string;
  updated: string;
};

type SqlRootRow = {
  id: string;
  root_id: string;
};

export type DocMeta = {
  id: string;
  parentId: string;
  rootId: string;
  box: string;
  path: string;
  hPath: string;
  updated: string;
  title: string;
};

export type PathInfo = {
  path: string;
  notebook: string;
};

type FileErrorRes = {
  code?: number;
  msg?: string;
};

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function toTitle(hPath: string): string {
  const parts = hPath.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : hPath;
}

function inClause(ids: string[]): string {
  return ids.map((id) => `'${escapeSqlLiteral(id)}'`).join(",");
}

export async function sql<T = any>(stmt: string): Promise<T[]> {
  return requestApi<T[]>("/api/query/sql", { stmt });
}

export async function getBacklink2(
  id: string,
  containChildren = false
): Promise<Backlink2Res> {
  return requestApi<Backlink2Res>("/api/ref/getBacklink2", {
    id,
    k: "",
    mk: "",
    containChildren,
  });
}

export async function exportMdContent(
  id: string,
  options: ExportMdContentOptions = {}
): Promise<ExportMdContentRes> {
  return requestApi<ExportMdContentRes>("/api/export/exportMdContent", {
    id,
    ...options,
  });
}

export async function exportMds(ids: string[]): Promise<ExportMdsRes> {
  return requestApi<ExportMdsRes>("/api/export/exportMds", { ids });
}

export async function exportResources(
  paths: string[],
  name: string
): Promise<ExportResourcesRes> {
  return requestApi<ExportResourcesRes>("/api/export/exportResources", {
    paths,
    name,
  });
}

export async function appendBlock(
  data: string,
  parentID: string
): Promise<any> {
  return requestApi("/api/block/appendBlock", {
    dataType: "markdown",
    data,
    parentID,
  });
}

export async function moveDocsByID(fromIDs: string[], toID: string): Promise<void> {
  await requestApi("/api/filetree/moveDocsByID", {
    fromIDs,
    toID,
  });
}

export async function renameDocByID(id: string, title: string): Promise<void> {
  await requestApi("/api/filetree/renameDocByID", {
    id,
    title,
  });
}

export async function removeDocByID(id: string): Promise<void> {
  await requestApi("/api/filetree/removeDocByID", {
    id,
  });
}

export async function putFile(
  path: string,
  content: string
): Promise<void> {
  await putBlobFile(
    path,
    new Blob([content], { type: "text/markdown;charset=utf-8" }),
    path.split("/").filter(Boolean).pop() || "doc.md"
  );
}

export async function putBlobFile(
  path: string,
  fileBlob: Blob,
  fileName?: string
): Promise<void> {
  const form = new FormData();
  const name = fileName || path.split("/").filter(Boolean).pop() || "file.bin";
  form.append("path", path);
  form.append("isDir", "false");
  form.append("modTime", `${Math.floor(Date.now() / 1000)}`);
  form.append("file", fileBlob, name);
  await requestApi("/api/file/putFile", form);
}

export async function removeFile(path: string): Promise<void> {
  await requestApi("/api/file/removeFile", { path });
}

export async function getFileBlob(path: string): Promise<Blob> {
  const response = await fetch("/api/file/getFile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) {
    throw new Error(`读取文件失败：${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = (await response.json().catch(() => null)) as FileErrorRes | null;
    throw new Error(json?.msg || "读取文件失败");
  }

  return response.blob();
}

export async function getPathByID(id: string): Promise<PathInfo> {
  return requestApi<PathInfo>("/api/filetree/getPathByID", { id });
}

export async function getDocMetaByID(id: string): Promise<DocMeta | null> {
  const rows = await sql<SqlDocRow>(
    `select id, parent_id, root_id, box, path, hpath, updated from blocks where type='d' and id='${escapeSqlLiteral(
      id
    )}' limit 1`
  );
  if (!rows.length) {
    return null;
  }
  const row = rows[0];
  return {
    id: row.id,
    parentId: row.parent_id,
    rootId: row.root_id,
    box: row.box,
    path: row.path,
    hPath: row.hpath,
    updated: row.updated,
    title: toTitle(row.hpath),
  };
}

export async function getDocMetasByIDs(ids: string[]): Promise<DocMeta[]> {
  if (!ids.length) {
    return [];
  }
  const rows = await sql<SqlDocRow>(
    `select id, parent_id, root_id, box, path, hpath, updated from blocks where type='d' and id in (${inClause(
      ids
    )})`
  );
  return rows.map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    rootId: row.root_id,
    box: row.box,
    path: row.path,
    hPath: row.hpath,
    updated: row.updated,
    title: toTitle(row.hpath),
  }));
}

export async function getChildDocTitles(parentId: string): Promise<string[]> {
  const rows = await sql<{ hpath: string }>(
    `select hpath from blocks where type='d' and parent_id='${escapeSqlLiteral(
      parentId
    )}'`
  );
  return rows.map((row) => toTitle(row.hpath));
}

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

export async function listDocsByParentSubtree(
  box: string,
  parentPrefix: string
): Promise<Array<{ id: string; hpath: string; updated: string }>> {
  return sql<Array<{ id: string; hpath: string; updated: string }>[number]>(
    `select id, hpath, updated from blocks where type='d' and box='${escapeSqlLiteral(
      box
    )}' and path like '${escapeSqlLiteral(parentPrefix)}%'`
  );
}
