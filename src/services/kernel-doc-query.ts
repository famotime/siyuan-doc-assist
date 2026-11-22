import { createDocAssistantLogger } from "@/core/logger-core";
import { getFileTextAllowJson, getPathByID } from "@/services/kernel-file";
import { escapeSqlLiteral, inClause, sql, sqlPaged } from "@/services/kernel-shared";
import { requestApi } from "@/services/request";

type SqlDocRow = {
  id: string;
  parent_id: string;
  root_id: string;
  box: string;
  path: string;
  hpath: string;
  updated: string;
};

type SqlChildDocRow = {
  id: string;
  box: string;
  hpath: string;
  updated: string;
  path: string;
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

export type NotebookDocMeta = {
  id: string;
  box: string;
  path: string;
  hPath: string;
  updated: string;
  title: string;
};

export type ChildDocMeta = {
  id: string;
  box: string;
  hPath: string;
  updated: string;
};

type SyTreeNode = {
  ID?: string;
  Properties?: {
    id?: string;
  };
  Children?: SyTreeNode[];
};

const keyInfoLogger = createDocAssistantLogger("KeyInfo");

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

export function isDirectChildDocPath(parentPath: string, candidatePath: string): boolean {
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

export function normalizeDocSyPath(box: string, docPath: string): string {
  const notebook = (box || "").trim();
  const normalizedPath = (docPath || "").trim();
  if (!notebook || !normalizedPath) {
    return "";
  }
  const path = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  return `/data/${notebook}${path}`;
}

export function buildDocSyCandidatePaths(box: string, docPath: string): string[] {
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

export function buildSyTreeOrderMap(root: SyTreeNode): Map<string, number> {
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

export function toDocMeta(row: SqlDocRow): DocMeta {
  return {
    id: row.id,
    parentId: row.parent_id,
    rootId: row.root_id,
    box: row.box,
    path: row.path,
    hPath: row.hpath,
    updated: row.updated,
    title: toTitle(row.hpath)
  };
}

export function toNotebookDocMeta(row: Pick<SqlDocRow, "id" | "box" | "path" | "hpath" | "updated">): NotebookDocMeta {
  return {
    id: row.id,
    box: row.box,
    path: row.path,
    hPath: row.hpath,
    updated: row.updated,
    title: toTitle(row.hpath)
  };
}

export function toChildDocMeta(row: Pick<SqlChildDocRow, "id" | "box" | "hpath" | "updated">): ChildDocMeta {
  return {
    id: row.id,
    box: row.box,
    hPath: row.hpath,
    updated: row.updated
  };
}

export async function getDocMetaByID(id: string): Promise<DocMeta | null> {
  const rows = await sql<SqlDocRow>(
    `select id, parent_id, root_id, box, path, hpath, updated from blocks where type='d' and id='${escapeSqlLiteral(
      id
    )}' limit 1`
  );
  return rows[0] ? toDocMeta(rows[0]) : null;
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
  return rows.map((row) => toDocMeta(row));
}

export async function listNotebookDocs(notebook: string): Promise<NotebookDocMeta[]> {
  if (!notebook.trim()) {
    return [];
  }

  const rows = await sqlPaged<SqlDocRow>(
    `select id, parent_id, root_id, box, path, hpath, updated
     from blocks
     where type='d'
       and box='${escapeSqlLiteral(notebook)}'`
  );

  return rows.map((row) => toNotebookDocMeta(row));
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
    .map((row) => toChildDocMeta(row));
}

export async function getDocTreeOrderFromSy(
  docId: string,
  docMeta?: DocMeta | null
): Promise<Map<string, number>> {
  if (!docId) {
    return new Map();
  }
  const candidatePaths = new Set<string>();
  if (docMeta === undefined) {
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
  } else if (docMeta?.box && docMeta.path) {
    buildDocSyCandidatePaths(docMeta.box, docMeta.path).forEach((path) =>
      candidatePaths.add(path)
    );
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
    keyInfoLogger.debug("sy order candidates empty", { docId });
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
        keyInfoLogger.debug("sy order loaded", {
          docId,
          path: syPath,
          count: orderMap.size,
          candidates
        });
        return orderMap;
      }
      failures.push({ path: syPath, reason: "empty-order-map" });
    } catch (error: any) {
      failures.push({
        path: syPath,
        reason: error?.message || String(error)
      });
    }
  }
  keyInfoLogger.debug("sy order unavailable", {
    docId,
    candidates,
    failures: failures.slice(0, 6)
  });
  return new Map();
}

export type SiYuanOutlineBlock = {
  id: string;
  content?: string;
  name?: string;
  type?: string;
  subType?: string;
  number?: string;
  children?: SiYuanOutlineBlock[];
};

export type SiYuanOutlineNode = {
  id: string;
  name?: string;
  nameIsHTML?: boolean;
  number?: string;
  type?: string;
  nodeType?: string;
  subType?: string;
  blocks?: SiYuanOutlineBlock[];
  children?: SiYuanOutlineNode[];
};

export async function getDocOutline(
  id: string,
  preview = false
): Promise<SiYuanOutlineNode[]> {
  const normalized = (id || "").trim();
  if (!normalized) {
    return [];
  }
  const res = await requestApi<SiYuanOutlineNode[] | null>(
    "/api/outline/getDocOutline",
    { id: normalized, preview }
  );
  return Array.isArray(res) ? res : [];
}
