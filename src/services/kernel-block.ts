import { requestApi } from "@/services/request";
import { createDocAssistantLogger } from "@/core/logger-core";
import { inClause, sqlPaged } from "@/services/kernel-shared";

type BlockKramdownRes = {
  id: string;
  kramdown: string;
};

type BlockDomRes = {
  id: string;
  dom: string;
};

type ChildBlockListItem = {
  id: string;
  type: string;
  subtype?: string;
};

type SqlChildBlockRow = {
  id: string;
  type: string;
  content: string;
  markdown: string;
  sort: number;
};

export type ChildBlockMeta = {
  id: string;
  type: string;
  content: string;
  markdown: string;
  resolved?: boolean;
};

const styleLogger = createDocAssistantLogger("Style");
const blankLinesLogger = createDocAssistantLogger("BlankLines");

function toBlockKramdownRows(payload: unknown): BlockKramdownRes[] {
  const rows: BlockKramdownRes[] = [];
  const pushRow = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") {
      return;
    }
    const record = candidate as { id?: unknown; kramdown?: unknown };
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id) {
      return;
    }
    const kramdown = typeof record.kramdown === "string" ? record.kramdown : String(record.kramdown || "");
    rows.push({ id, kramdown });
  };
  const pushFromArray = (value: unknown) => {
    if (!Array.isArray(value)) {
      return;
    }
    for (const item of value) {
      pushRow(item);
    }
  };

  pushFromArray(payload);
  if (payload && typeof payload === "object") {
    const source = payload as Record<string, unknown>;
    pushFromArray(source.kramdowns);
    pushFromArray(source.items);
    pushFromArray(source.blocks);
    pushFromArray(source.rows);
    pushFromArray(source.data);
    pushRow(source);
    // Handle dict format: { [blockId]: kramdownString }
    // as returned by /api/block/getBlockKramdowns in some SiYuan versions.
    if (!Array.isArray(payload)) {
      const siyuanIdPattern = /^\d{14}-[a-z0-9]{7}$/;
      for (const [key, value] of Object.entries(source)) {
        if (siyuanIdPattern.test(key) && typeof value === "string") {
          rows.push({ id: key, kramdown: value });
        }
      }
    }
  }

  const deduped = new Map<string, BlockKramdownRes>();
  for (const row of rows) {
    if (!deduped.has(row.id)) {
      deduped.set(row.id, row);
    }
  }
  return [...deduped.values()];
}

function toBlockDomRows(payload: unknown): BlockDomRes[] {
  const rows: BlockDomRes[] = [];
  const pushRow = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") {
      return;
    }
    const record = candidate as { id?: unknown; dom?: unknown };
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id) {
      return;
    }
    const dom = typeof record.dom === "string" ? record.dom : String(record.dom || "");
    rows.push({ id, dom });
  };
  const pushFromArray = (value: unknown) => {
    if (!Array.isArray(value)) {
      return;
    }
    for (const item of value) {
      pushRow(item);
    }
  };

  pushFromArray(payload);
  if (payload && typeof payload === "object") {
    const source = payload as Record<string, unknown>;
    pushFromArray(source.doms);
    pushFromArray(source.items);
    pushFromArray(source.blocks);
    pushFromArray(source.rows);
    pushFromArray(source.data);
    pushRow(source);
    if (!Array.isArray(payload)) {
      const siyuanIdPattern = /^\d{14}-[a-z0-9]{7}$/;
      for (const [key, value] of Object.entries(source)) {
        if (siyuanIdPattern.test(key) && typeof value === "string") {
          rows.push({ id: key, dom: value });
        }
      }
    }
  }

  const deduped = new Map<string, BlockDomRes>();
  for (const row of rows) {
    if (!deduped.has(row.id)) {
      deduped.set(row.id, row);
    }
  }
  return [...deduped.values()];
}

export async function getBlockKramdowns(
  ids: string[]
): Promise<BlockKramdownRes[]> {
  const normalizedIds = [...new Set((ids || []).map((id) => (id || "").trim()).filter(Boolean))];
  if (!normalizedIds.length) {
    return [];
  }
  const chunks: string[][] = [];
  const chunkSize = 50;
  for (let i = 0; i < normalizedIds.length; i += chunkSize) {
    chunks.push(normalizedIds.slice(i, i + chunkSize));
  }
  const rowMap = new Map<string, BlockKramdownRes>();
  const fallbackIds = new Set<string>();
  for (const chunk of chunks) {
    try {
      const res = await requestApi<any>("/api/block/getBlockKramdowns", {
        ids: chunk,
      });
      const rows = toBlockKramdownRows(res);
      for (const row of rows) {
        if (chunk.includes(row.id) && !rowMap.has(row.id)) {
          rowMap.set(row.id, row);
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      styleLogger.debug("getBlockKramdowns failed, fallback to single", {
        chunkSize: chunk.length,
        sample: chunk.slice(0, 8),
        message,
      });
      chunk.forEach((id) => fallbackIds.add(id));
    }
  }

  const missingIds = normalizedIds.filter((id) => fallbackIds.has(id) && !rowMap.has(id));
  if (missingIds.length) {
    for (const id of missingIds) {
      try {
        const row = await getBlockKramdown(id);
        if (row && !rowMap.has(row.id)) {
          rowMap.set(row.id, row);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        styleLogger.debug("getBlockKramdown fallback failed", {
          id,
          message,
        });
      }
    }
  }

  return normalizedIds
    .map((id) => rowMap.get(id))
    .filter((row): row is BlockKramdownRes => !!row);
}

export async function getBlockKramdown(
  id: string
): Promise<BlockKramdownRes | null> {
  const normalized = (id || "").trim();
  if (!normalized) {
    return null;
  }
  const res = await requestApi<any>("/api/block/getBlockKramdown", {
    id: normalized,
  });
  const rows = toBlockKramdownRows(res);
  if (rows.length) {
    const exact = rows.find((item) => item.id === normalized);
    return exact || rows[0];
  }
  if (typeof res === "string") {
    return {
      id: normalized,
      kramdown: res,
    };
  }
  return null;
}

export async function getBlockDOMs(ids: string[]): Promise<BlockDomRes[]> {
  const normalizedIds = [...new Set((ids || []).map((id) => (id || "").trim()).filter(Boolean))];
  if (!normalizedIds.length) {
    return [];
  }
  const chunks: string[][] = [];
  const chunkSize = 50;
  for (let i = 0; i < normalizedIds.length; i += chunkSize) {
    chunks.push(normalizedIds.slice(i, i + chunkSize));
  }
  const rowMap = new Map<string, BlockDomRes>();
  const fallbackIds = new Set<string>();
  for (const chunk of chunks) {
    try {
      const res = await requestApi<any>("/api/block/getBlockDOMs", {
        ids: chunk,
      });
      const rows = toBlockDomRows(res);
      for (const row of rows) {
        if (chunk.includes(row.id) && !rowMap.has(row.id)) {
          rowMap.set(row.id, row);
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      styleLogger.debug("getBlockDOMs failed, fallback to single", {
        chunkSize: chunk.length,
        sample: chunk.slice(0, 8),
        message,
      });
      chunk.forEach((id) => fallbackIds.add(id));
    }
  }
  const missingIds = normalizedIds.filter((id) => fallbackIds.has(id) && !rowMap.has(id));
  if (missingIds.length) {
    for (const id of missingIds) {
      try {
        const row = await getBlockDOM(id);
        if (row && !rowMap.has(row.id)) {
          rowMap.set(row.id, row);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        styleLogger.debug("getBlockDOM fallback failed", {
          id,
          message,
        });
      }
    }
  }
  return normalizedIds.map((id) => rowMap.get(id)).filter((row): row is BlockDomRes => !!row);
}

export async function getBlockDOM(id: string): Promise<BlockDomRes | null> {
  const normalized = (id || "").trim();
  if (!normalized) {
    return null;
  }
  const res = await requestApi<any>("/api/block/getBlockDOM", {
    id: normalized,
  });
  const rows = toBlockDomRows(res);
  if (rows.length) {
    const exact = rows.find((item) => item.id === normalized);
    return exact || rows[0];
  }
  if (typeof res === "string") {
    return {
      id: normalized,
      dom: res,
    };
  }
  return null;
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

export async function updateBlockDom(
  id: string,
  data: string
): Promise<void> {
  await requestApi("/api/block/updateBlock", {
    dataType: "dom",
    data,
    id,
  });
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
    blankLinesLogger.debug("child blocks empty", {
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
  blankLinesLogger.debug("child blocks loaded", {
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
