import {
  cleanInlineText,
  extractListPrefix,
  normalizeListDecoratedText,
  normalizeSort,
} from "@/services/key-info-model";

const SY_ORDER_MIN_HIT_RATIO = 0.85;

export type KeyInfoOrderRow = {
  id: string;
  parent_id?: string;
  type?: string;
  subtype?: string;
  markdown?: string;
  content?: string;
  sort?: number | string;
};

export type OrderResolution = {
  source: "sy" | "structural" | "fallback";
  orderMap: Map<string, number>;
  syHitCount: number;
  syHitRatio: number;
};

export function createListContextResolver(
  rows: KeyInfoOrderRow[]
): {
  isListItemBlock: (blockId?: string) => boolean;
  getListPrefix: (blockId?: string) => string | undefined;
  hasMappedListLineChild: (blockId?: string) => boolean;
} {
  const indexById = new Map<string, number>();
  rows.forEach((row, index) => {
    indexById.set(row.id, index);
  });
  const childrenByParent = new Map<string, KeyInfoOrderRow[]>();
  rows.forEach((row) => {
    const parentId = row.parent_id || "";
    const siblings = childrenByParent.get(parentId) || [];
    siblings.push(row);
    childrenByParent.set(parentId, siblings);
  });
  childrenByParent.forEach((siblings, parentId) => {
    siblings.sort((a, b) => {
      const aSort = normalizeSort(a.sort ?? Number.MAX_SAFE_INTEGER, indexById.get(a.id) ?? 0);
      const bSort = normalizeSort(b.sort ?? Number.MAX_SAFE_INTEGER, indexById.get(b.id) ?? 0);
      if (aSort !== bSort) {
        return aSort - bSort;
      }
      return (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0);
    });
    childrenByParent.set(parentId, siblings);
  });

  const getComparableBlockText = (row: KeyInfoOrderRow): string => {
    const contentText = cleanInlineText(row.content || "");
    if (contentText) {
      return contentText;
    }
    return cleanInlineText(normalizeListDecoratedText(row.markdown || ""));
  };

  const listItemIds = new Set<string>();
  const listPrefixById = new Map<string, string>();
  const listItemIdsWithMappedChild = new Set<string>();
  rows.forEach((row) => {
    const type = (row.type || "").toLowerCase();
    if (type === "i") {
      listItemIds.add(row.id);
      const parsedPrefix =
        extractListPrefix((row.markdown || "").trim()) ||
        extractListPrefix((row.content || "").trim());
      const resolvedPrefix = parsedPrefix || "- ";
      listPrefixById.set(row.id, resolvedPrefix);

      const listItemText = getComparableBlockText(row);
      if (!listItemText) {
        return;
      }

      const children = childrenByParent.get(row.id) || [];
      const firstTextChild = children.find((child) => {
        const childType = (child.type || "").toLowerCase();
        if (childType !== "p" && childType !== "h") {
          return false;
        }
        return !!getComparableBlockText(child);
      });
      if (!firstTextChild) {
        return;
      }
      const firstTextChildText = getComparableBlockText(firstTextChild);
      const isListLineMatch =
        listItemText.startsWith(firstTextChildText) ||
        firstTextChildText.startsWith(listItemText);
      if (!isListLineMatch) {
        return;
      }

      listItemIds.add(firstTextChild.id);
      listPrefixById.set(firstTextChild.id, resolvedPrefix);
      listItemIdsWithMappedChild.add(row.id);
    }
  });

  return {
    isListItemBlock: (blockId?: string) => !!blockId && listItemIds.has(blockId),
    getListPrefix: (blockId?: string) => (blockId ? listPrefixById.get(blockId) : undefined),
    hasMappedListLineChild: (blockId?: string) =>
      !!blockId && listItemIdsWithMappedChild.has(blockId),
  };
}

export function buildStructuralBlockOrderMap(
  rows: Array<{ id: string; parent_id?: string; sort: number | string }>,
  rootId: string
): Map<string, number> {
  const indexById = new Map<string, number>();
  rows.forEach((row, index) => {
    indexById.set(row.id, index);
  });

  const childrenByParent = new Map<string, typeof rows>();
  for (const row of rows) {
    const parentId = row.parent_id || "";
    const group = childrenByParent.get(parentId) || [];
    group.push(row);
    childrenByParent.set(parentId, group);
  }

  childrenByParent.forEach((group, parentId) => {
    group.sort((a, b) => {
      const aSort = normalizeSort(a.sort, indexById.get(a.id) ?? 0);
      const bSort = normalizeSort(b.sort, indexById.get(b.id) ?? 0);
      if (aSort !== bSort) {
        return aSort - bSort;
      }
      const aIndex = indexById.get(a.id) ?? 0;
      const bIndex = indexById.get(b.id) ?? 0;
      return aIndex - bIndex;
    });
    childrenByParent.set(parentId, group);
  });

  const orderMap = new Map<string, number>();
  let cursor = 0;
  const visiting = new Set<string>();
  const walk = (parentId: string) => {
    const children = childrenByParent.get(parentId) || [];
    for (const child of children) {
      if (orderMap.has(child.id)) {
        continue;
      }
      orderMap.set(child.id, cursor);
      cursor += 1;
      if (visiting.has(child.id)) {
        continue;
      }
      visiting.add(child.id);
      walk(child.id);
      visiting.delete(child.id);
    }
  };

  walk(rootId);
  rows.forEach((row, index) => {
    if (!orderMap.has(row.id)) {
      orderMap.set(row.id, cursor + index);
    }
  });
  return orderMap;
}

export function resolveBlockOrderMap(
  rows: Array<{ id: string }>,
  syOrderMap: Map<string, number>,
  structuralOrderMap: Map<string, number>
): OrderResolution {
  if (!rows.length) {
    return {
      source: "fallback",
      orderMap: new Map(),
      syHitCount: 0,
      syHitRatio: 0,
    };
  }

  const syHitCount = rows.reduce((count, row) => {
    return count + (syOrderMap.has(row.id) ? 1 : 0);
  }, 0);
  const syHitRatio = syHitCount / rows.length;
  if (syOrderMap.size && syHitRatio >= SY_ORDER_MIN_HIT_RATIO) {
    return {
      source: "sy",
      orderMap: syOrderMap,
      syHitCount,
      syHitRatio,
    };
  }
  if (structuralOrderMap.size) {
    return {
      source: "structural",
      orderMap: structuralOrderMap,
      syHitCount,
      syHitRatio,
    };
  }
  return {
    source: "fallback",
    orderMap: new Map(),
    syHitCount,
    syHitRatio,
  };
}
