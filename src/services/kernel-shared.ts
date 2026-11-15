import { createDocAssistantLogger } from "@/core/logger-core";
import { requestApi } from "@/services/request";

const kernelSharedLogger = createDocAssistantLogger("KernelShared");

export function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

export function inClause(ids: string[]): string {
  return ids.map((id) => `'${escapeSqlLiteral(id)}'`).join(",");
}

export async function sql<T = any>(stmt: string): Promise<T[]> {
  return requestApi<T[]>("/api/query/sql", { stmt });
}

/** 达到 maxPages×pageSize 上限被截断的返回数组会携带 truncated: true（审计低危项） */
export type SqlPagedRows<T> = T[] & { truncated?: boolean };

export async function sqlPaged<T = any>(
  stmt: string,
  pageSize = 64,
  maxPages = 200
): Promise<SqlPagedRows<T>> {
  const rows: T[] = [];
  const base = stmt.trim().replace(/;$/, "");
  let offset = 0;
  let truncated = false;
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
    if (page === maxPages - 1) {
      // 最后一页仍是满页：结果集很可能超过 12800 行上限被静默截断，必须告警
      truncated = true;
      kernelSharedLogger.warn("sqlPaged hit the maxPages cap, rows may be truncated", {
        rowCount: rows.length,
        maxPages,
        pageSize
      });
    }
  }
  const result = rows as SqlPagedRows<T>;
  result.truncated = truncated;
  return result;
}
