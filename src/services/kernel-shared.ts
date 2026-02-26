import { requestApi } from "@/services/request";

export function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

export function inClause(ids: string[]): string {
  return ids.map((id) => `'${escapeSqlLiteral(id)}'`).join(",");
}

export async function sql<T = any>(stmt: string): Promise<T[]> {
  return requestApi<T[]>("/api/query/sql", { stmt });
}

export async function sqlPaged<T = any>(
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
