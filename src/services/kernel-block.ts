import { requestApi } from "@/services/request";
import { createDocAssistantLogger } from "@/core/logger-core";
import { inClause, sqlPaged } from "@/services/kernel-shared";
import {
  parseKernelTextRows,
  requestBatchRowsWithSingleFallback,
} from "@/services/kernel-adapter-core";

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
  return parseKernelTextRows(payload, "kramdown").map((row) => ({
    id: row.id,
    kramdown: row.text,
  }));
}

function toBlockDomRows(payload: unknown): BlockDomRes[] {
  return parseKernelTextRows(payload, "dom").map((row) => ({
    id: row.id,
    dom: row.text,
  }));
}

export async function getBlockKramdowns(
  ids: string[]
): Promise<BlockKramdownRes[]> {
  return requestBatchRowsWithSingleFallback({
    ids,
    chunkSize: 50,
    requestBatch: (chunk) =>
      requestApi<any>("/api/block/getBlockKramdowns", {
        ids: chunk,
      }),
    parseBatchRows: toBlockKramdownRows,
    requestSingle: getBlockKramdown,
    onBatchError: (error, chunk) => {
      const message = error instanceof Error ? error.message : String(error);
      styleLogger.debug("getBlockKramdowns failed, fallback to single", {
        chunkSize: chunk.length,
        sample: chunk.slice(0, 8),
        message,
      });
    },
    onSingleError: (error, id) => {
      const message = error instanceof Error ? error.message : String(error);
      styleLogger.debug("getBlockKramdown fallback failed", {
        id,
        message,
      });
    },
  });
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
  return requestBatchRowsWithSingleFallback({
    ids,
    chunkSize: 50,
    requestBatch: (chunk) =>
      requestApi<any>("/api/block/getBlockDOMs", {
        ids: chunk,
      }),
    parseBatchRows: toBlockDomRows,
    requestSingle: getBlockDOM,
    onBatchError: (error, chunk) => {
      const message = error instanceof Error ? error.message : String(error);
      styleLogger.debug("getBlockDOMs failed, fallback to single", {
        chunkSize: chunk.length,
        sample: chunk.slice(0, 8),
        message,
      });
    },
    onSingleError: (error, id) => {
      const message = error instanceof Error ? error.message : String(error);
      styleLogger.debug("getBlockDOM fallback failed", {
        id,
        message,
      });
    },
  });
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
