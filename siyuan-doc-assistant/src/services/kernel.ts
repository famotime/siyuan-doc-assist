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

type BlockKramdownRes = {
  id: string;
  kramdown: string;
};

type ChildBlockListItem = {
  id: string;
  type: string;
  subtype?: string;
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

type SqlChildDocRow = {
  id: string;
  box: string;
  hpath: string;
  updated: string;
  path: string;
};

type SqlChildBlockRow = {
  id: string;
  type: string;
  content: string;
  markdown: string;
  sort: number;
};

type SqlBlockParentRow = {
  id: string;
  parent_id: string;
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

export type FileTreeDoc = {
  id: string;
  name: string;
  path: string;
  icon?: string;
  subFileCount?: number;
};

export type ChildDocMeta = {
  id: string;
  box: string;
  hPath: string;
  updated: string;
};

export type ChildBlockMeta = {
  id: string;
  type: string;
  content: string;
  markdown: string;
  resolved?: boolean;
};

type FileErrorRes = {
  code?: number;
  msg?: string;
};

type SyTreeNode = {
  ID?: string;
  Properties?: {
    id?: string;
  };
  Children?: SyTreeNode[];
};

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function toTitle(hPath: string): string {
  const parts = hPath.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : hPath;
}

function trimDocPathSuffix(path: string): string {
  const value = (path || "").trim();
  return value.endsWith(".sy") ? value.slice(0, -3) : value;
}

function toChildDocPathPrefix(parentPath: string): string {
  const normalized = trimDocPathSuffix(parentPath);
  if (!normalized) {
    return "";
  }
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function isDirectChildDocPath(parentPath: string, candidatePath: string): boolean {
  const prefix = toChildDocPathPrefix(parentPath);
  if (!prefix) {
    return false;
  }
  const normalizedCandidate = trimDocPathSuffix(candidatePath);
  if (!normalizedCandidate.startsWith(prefix)) {
    return false;
  }
  const suffix = normalizedCandidate.slice(prefix.length);
  return !!suffix && !suffix.includes("/");
}

function inClause(ids: string[]): string {
  return ids.map((id) => `'${escapeSqlLiteral(id)}'`).join(",");
}

function normalizeDocSyPath(box: string, docPath: string): string {
  const notebook = (box || "").trim();
  const normalizedPath = (docPath || "").trim();
  if (!notebook || !normalizedPath) {
    return "";
  }
  const path = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  return `/data/${notebook}${path}`;
}

function buildDocSyCandidatePaths(box: string, docPath: string): string[] {
  const normalized = normalizeDocSyPath(box, docPath);
  if (!normalized) {
    return [];
  }
  const candidates = new Set<string>();
  candidates.add(normalized);
  if (/\.sy$/i.test(normalized)) {
    candidates.add(normalized.replace(/\.sy$/i, ""));
  } else {
    candidates.add(`${normalized}.sy`);
  }
  return [...candidates];
}

function getSyNodeId(node: SyTreeNode): string {
  return (node?.ID || node?.Properties?.id || "").trim();
}

function buildSyTreeOrderMap(root: SyTreeNode): Map<string, number> {
  const orderMap = new Map<string, number>();
  let cursor = 0;
  const walk = (node?: SyTreeNode) => {
    if (!node || typeof node !== "object") {
      return;
    }
    const id = getSyNodeId(node);
    if (id && !orderMap.has(id)) {
      orderMap.set(id, cursor);
      cursor += 1;
    }
    const children = Array.isArray(node.Children) ? node.Children : [];
    children.forEach((child) => walk(child));
  };
  walk(root);
  return orderMap;
}

export async function sql<T = any>(stmt: string): Promise<T[]> {
  return requestApi<T[]>("/api/query/sql", { stmt });
}

async function sqlPaged<T = any>(
  stmt: string,
  pageSize = 64,
  maxPages = 200
): Promise<T[]> {
  const rows: T[] = [];
  const base = stmt.trim().replace(/;$/, "");
  let offset = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const pageRows = await sql<T>(`${base} limit ${pageSize} offset ${offset}`);
    if (!pageRows || pageRows.length === 0) {
      break;
    }
    rows.push(...pageRows);
    if (pageRows.length < pageSize) {
      break;
    }
    offset += pageRows.length;
  }
  return rows;
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

export async function getBlockKramdowns(
  ids: string[]
): Promise<BlockKramdownRes[]> {
  if (!ids.length) {
    return [];
  }
  const chunks: string[][] = [];
  const chunkSize = 50;
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }
  const rows: BlockKramdownRes[] = [];
  for (const chunk of chunks) {
    const res = await requestApi<any>("/api/block/getBlockKramdowns", {
      ids: chunk,
    });
    if (Array.isArray(res)) {
      rows.push(...(res as BlockKramdownRes[]));
      continue;
    }
    if (res && Array.isArray(res.kramdowns)) {
      rows.push(...(res.kramdowns as BlockKramdownRes[]));
    }
  }
  return rows;
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

export async function insertBlockBefore(
  data: string,
  nextID: string,
  parentID = ""
): Promise<any> {
  return requestApi("/api/block/insertBlock", {
    dataType: "markdown",
    data,
    nextID,
    previousID: "",
    parentID,
  });
}

export async function deleteBlockById(id: string): Promise<void> {
  await requestApi("/api/block/deleteBlock", { id });
}

export async function updateBlockMarkdown(
  id: string,
  data: string
): Promise<void> {
  await requestApi("/api/block/updateBlock", {
    dataType: "markdown",
    data,
    id,
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

function isFileErrorEnvelope(value: unknown): value is FileErrorRes & { data?: unknown } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as FileErrorRes & { data?: unknown };
  return typeof payload.code === "number" && payload.code !== 0 && payload.data === null;
}

function isFileSuccessEnvelope(value: unknown): value is { code: number; data?: unknown } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as { code?: unknown };
  return typeof payload.code === "number" && payload.code === 0;
}

async function getFileTextAllowJson(path: string): Promise<string> {
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
  const text = await response.text();
  if (!contentType.includes("application/json")) {
    return text;
  }
  if (!text.trim()) {
    return text;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // JSON content-type with non-JSON payload should still be treated as file text.
    return text;
  }
  if (isFileErrorEnvelope(parsed)) {
    const message = (parsed.msg || "").trim();
    throw new Error(message || `读取文件失败：${parsed.code}`);
  }
  if (isFileSuccessEnvelope(parsed)) {
    const data = parsed.data;
    if (typeof data === "string") {
      return data;
    }
    if (data == null) {
      return "";
    }
    if (typeof data === "object") {
      return JSON.stringify(data);
    }
    return String(data);
  }
  return text;
}

export async function getPathByID(id: string): Promise<PathInfo> {
  return requestApi<PathInfo>("/api/filetree/getPathByID", { id });
}

export async function listDocsByPath(
  notebook: string,
  path: string
): Promise<FileTreeDoc[]> {
  const res = await requestApi<{ files?: FileTreeDoc[] }>("/api/filetree/listDocsByPath", {
    notebook,
    path,
  });
  return res?.files || [];
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
  const rows = await getChildDocsByParent(parentId);
  return rows.map((row) => toTitle(row.hPath));
}

export async function getChildDocsByParent(parentId: string): Promise<ChildDocMeta[]> {
  const parentRows = await sql<{ box: string; path: string }>(
    `select box, path from blocks where type='d' and id='${escapeSqlLiteral(
      parentId
    )}' limit 1`
  );
  const parent = parentRows[0];
  if (!parent?.path || !parent?.box) {
    return [];
  }

  const childPrefix = toChildDocPathPrefix(parent.path);
  if (!childPrefix) {
    return [];
  }

  const rows = await sql<SqlChildDocRow>(
    `select id, box, hpath, updated, path
     from blocks
     where type='d'
       and box='${escapeSqlLiteral(parent.box)}'
       and path like '${escapeSqlLiteral(childPrefix)}%'
     order by hpath asc`
  );
  return rows
    .filter((row) => isDirectChildDocPath(parent.path, row.path))
    .map((row) => ({
      id: row.id,
      box: row.box,
      hPath: row.hpath,
      updated: row.updated,
    }));
}

export async function getChildBlocksByParentId(
  parentId: string
): Promise<ChildBlockMeta[]> {
  if (!parentId) {
    return [];
  }
  const childList = await requestApi<ChildBlockListItem[]>("/api/block/getChildBlocks", {
    id: parentId,
  });
  const childTypeMap = new Map(
    (childList || []).map((item) => [item?.id || "", item?.type || ""])
  );
  const seen = new Set<string>();
  const orderedIds = (childList || [])
    .map((item) => item?.id || "")
    .filter(Boolean)
    .filter((id) => {
      if (seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });
  if (!orderedIds.length) {
    console.info("[DocAssistant][BlankLines] child blocks empty", {
      parentId,
      apiCount: childList?.length || 0,
    });
    return [];
  }
  const rows = await sqlPaged<SqlChildBlockRow>(
    `select id, type, content, markdown, sort
     from blocks
     where id in (${inClause(orderedIds)})
     order by sort asc`
  );
  const rowMap = new Map<string, ChildBlockMeta>();
  for (const row of rows) {
    rowMap.set(row.id, {
      id: row.id,
      type: row.type,
      content: row.content || "",
      markdown: row.markdown || "",
      resolved: true,
    });
  }
  const missingIds = orderedIds.filter((id) => !rowMap.has(id));
  let unresolvedCount = 0;
  if (missingIds.length) {
    const kramdowns = await getBlockKramdowns(missingIds);
    const kramdownMap = new Map(kramdowns.map((item) => [item.id, item.kramdown || ""]));
    for (const id of missingIds) {
      const type = childTypeMap.get(id) || "p";
      const resolved = kramdownMap.has(id);
      const markdown = resolved ? (kramdownMap.get(id) || "") : "";
      if (!resolved) {
        unresolvedCount += 1;
      }
      rowMap.set(id, {
        id,
        type,
        content: "",
        markdown,
        resolved,
      });
    }
  }
  console.info("[DocAssistant][BlankLines] child blocks loaded", {
    parentId,
    apiCount: childList?.length || 0,
    orderedCount: orderedIds.length,
    sqlCount: rows.length,
    missingCount: missingIds.length,
    unresolvedCount,
    sample: orderedIds.slice(0, 8),
  });
  return orderedIds
    .map((id) => rowMap.get(id))
    .filter((row): row is ChildBlockMeta => !!row);
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

export async function getDocTreeOrderFromSy(docId: string): Promise<Map<string, number>> {
  if (!docId) {
    return new Map();
  }
  const candidatePaths = new Set<string>();
  try {
    const meta = await getDocMetaByID(docId);
    if (meta?.box && meta.path) {
      buildDocSyCandidatePaths(meta.box, meta.path).forEach((path) =>
        candidatePaths.add(path)
      );
    }
  } catch {
    // Ignore and try other strategies.
  }

  try {
    const pathInfo = await getPathByID(docId);
    if (pathInfo?.notebook && pathInfo.path) {
      buildDocSyCandidatePaths(pathInfo.notebook, pathInfo.path).forEach((path) =>
        candidatePaths.add(path)
      );
    }
  } catch {
    // Ignore and continue with available paths.
  }

  const failures: Array<{ path: string; reason: string }> = [];
  const candidates = [...candidatePaths];
  if (!candidates.length) {
    console.warn("[DocAssistant][KeyInfo] sy order candidates empty", { docId });
    return new Map();
  }

  for (const syPath of candidates) {
    try {
      const raw = await getFileTextAllowJson(syPath);
      if (!raw.trim()) {
        failures.push({ path: syPath, reason: "empty-file" });
        continue;
      }
      const parsed = JSON.parse(raw) as SyTreeNode;
      const orderMap = buildSyTreeOrderMap(parsed);
      if (orderMap.size) {
        console.info("[DocAssistant][KeyInfo] sy order loaded", {
          docId,
          path: syPath,
          count: orderMap.size,
          candidates,
        });
        return orderMap;
      }
      failures.push({ path: syPath, reason: "empty-order-map" });
    } catch (error: any) {
      failures.push({
        path: syPath,
        reason: error?.message || String(error),
      });
      // Try next candidate path.
    }
  }
  console.warn("[DocAssistant][KeyInfo] sy order unavailable", {
    docId,
    candidates,
    failures: failures.slice(0, 6),
  });
  return new Map();
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
