type KernelTextRow = {
  id: string;
  text: string;
};

const SIYUAN_ID_PATTERN = /^\d{14}-[a-z0-9]{7}$/;
const DEFAULT_COLLECTION_KEYS = ["items", "blocks", "rows", "data"] as const;

export function parseKernelTextRows(
  payload: unknown,
  valueKey: string,
  collectionKeys: readonly string[] = DEFAULT_COLLECTION_KEYS
): KernelTextRow[] {
  const rows: KernelTextRow[] = [];

  const pushRow = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") {
      return;
    }
    const record = candidate as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id) {
      return;
    }
    const value = record[valueKey];
    rows.push({
      id,
      text: typeof value === "string" ? value : String(value || ""),
    });
  };

  const pushFromArray = (value: unknown) => {
    if (!Array.isArray(value)) {
      return;
    }
    value.forEach((item) => pushRow(item));
  };

  pushFromArray(payload);
  if (payload && typeof payload === "object") {
    const source = payload as Record<string, unknown>;
    pushFromArray(source[`${valueKey}s`]);
    collectionKeys.forEach((key) => pushFromArray(source[key]));
    pushRow(source);
    if (!Array.isArray(payload)) {
      Object.entries(source).forEach(([key, value]) => {
        if (SIYUAN_ID_PATTERN.test(key) && typeof value === "string") {
          rows.push({ id: key, text: value });
        }
      });
    }
  }

  const deduped = new Map<string, KernelTextRow>();
  rows.forEach((row) => {
    if (!deduped.has(row.id)) {
      deduped.set(row.id, row);
    }
  });
  return [...deduped.values()];
}

type BatchWithFallbackOptions<Row extends { id: string }> = {
  ids: string[];
  chunkSize?: number;
  requestBatch: (ids: string[]) => Promise<unknown>;
  parseBatchRows: (payload: unknown) => Row[];
  requestSingle: (id: string) => Promise<Row | null>;
  onBatchError?: (error: unknown, ids: string[]) => void;
  onSingleError?: (error: unknown, id: string) => void;
};

function normalizeUniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  (ids || []).forEach((id) => {
    const value = (id || "").trim();
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    normalized.push(value);
  });
  return normalized;
}

export async function requestBatchRowsWithSingleFallback<Row extends { id: string }>({
  ids,
  chunkSize = 50,
  requestBatch,
  parseBatchRows,
  requestSingle,
  onBatchError,
  onSingleError,
}: BatchWithFallbackOptions<Row>): Promise<Row[]> {
  const normalizedIds = normalizeUniqueIds(ids);
  if (!normalizedIds.length) {
    return [];
  }

  const chunks: string[][] = [];
  for (let i = 0; i < normalizedIds.length; i += chunkSize) {
    chunks.push(normalizedIds.slice(i, i + chunkSize));
  }

  const rowMap = new Map<string, Row>();
  const fallbackIds = new Set<string>();
  for (const chunk of chunks) {
    try {
      const result = await requestBatch(chunk);
      const parsedRows = parseBatchRows(result);
      const chunkSet = new Set(chunk);
      parsedRows.forEach((row) => {
        if (chunkSet.has(row.id) && !rowMap.has(row.id)) {
          rowMap.set(row.id, row);
        }
      });
    } catch (error) {
      onBatchError?.(error, chunk);
      chunk.forEach((id) => fallbackIds.add(id));
    }
  }

  const missingIds = normalizedIds.filter((id) => fallbackIds.has(id) && !rowMap.has(id));
  for (const id of missingIds) {
    try {
      const row = await requestSingle(id);
      if (row && !rowMap.has(row.id)) {
        rowMap.set(row.id, row);
      }
    } catch (error) {
      onSingleError?.(error, id);
    }
  }

  return normalizedIds
    .map((id) => rowMap.get(id))
    .filter((row): row is Row => !!row);
}
