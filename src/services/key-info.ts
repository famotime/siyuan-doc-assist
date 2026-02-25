import { extractKeyInfoFromMarkdown, KeyInfoItem } from "@/core/key-info-core";
import {
  getDocMetaByID,
  getDocTreeOrderFromSy,
  getRootDocRawMarkdown,
} from "@/services/kernel";
import {
  extractInlineFromDom,
  getDomBlockSortMap,
  mapSpanRowsToItems,
} from "@/services/key-info-inline";
import { mergePreferredInlineItems } from "@/services/key-info-merge";
import {
  cleanInlineText,
  extractListPrefix,
  KeyInfoDocResult,
  normalizeListDecoratedText,
  normalizeSort,
  normalizeTitle,
  splitTags,
} from "@/services/key-info-model";
import {
  getKramdownMap,
  listDocBlocks,
  listSpanRows,
  resolveRootId,
} from "@/services/key-info-query";

const SY_ORDER_MIN_HIT_RATIO = 0.85;

type OrderResolution = {
  source: "sy" | "structural" | "fallback";
  orderMap: Map<string, number>;
  syHitCount: number;
  syHitRatio: number;
};

function createListContextResolver(
  rows: Array<{
    id: string;
    parent_id?: string;
    type?: string;
    subtype?: string;
    markdown?: string;
    content?: string;
    sort?: number | string;
  }>
): {
  isListItemBlock: (blockId?: string) => boolean;
  getListPrefix: (blockId?: string) => string | undefined;
  hasMappedListLineChild: (blockId?: string) => boolean;
} {
  const indexById = new Map<string, number>();
  rows.forEach((row, index) => {
    indexById.set(row.id, index);
  });
  const childrenByParent = new Map<string, typeof rows>();
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

  const getComparableBlockText = (row: (typeof rows)[number]): string => {
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

function buildStructuralBlockOrderMap(
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

function resolveBlockOrderMap(
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

export async function getDocKeyInfo(docId: string, protyle?: unknown): Promise<KeyInfoDocResult> {
  const rootId = await resolveRootId(docId);
  const docMeta = await getDocMetaByID(rootId);
  const docTitle = docMeta?.title || "";
  let rows = await listDocBlocks(rootId);

  if (!rows.length) {
    const fallbackMarkdown = await getRootDocRawMarkdown(rootId);
    if (fallbackMarkdown) {
      rows = [
        {
          id: rootId,
          sort: 0,
          markdown: fallbackMarkdown,
          memo: "",
          tag: "",
        },
      ];
    }
  }

  const kramdownMap = await getKramdownMap(rows.map((row) => row.id));
  const items: KeyInfoItem[] = [];
  const markdownInlineItems: KeyInfoItem[] = [];
  const hasChildBlocks = rows.some((row) => row.id !== rootId);
  let order = 0;
  const blockSortMap = new Map<string, number>();
  const headingBlockIds = new Set<string>();
  const structuralOrderMap = buildStructuralBlockOrderMap(rows, rootId);
  const syOrderMap = await getDocTreeOrderFromSy(rootId);
  const resolvedOrder = resolveBlockOrderMap(rows, syOrderMap, structuralOrderMap);
  const listContext = createListContextResolver(rows);
  const resolveListLine = (blockId?: string): { listItem: boolean; listPrefix?: string } => {
    if (!blockId) {
      return { listItem: false };
    }
    if (listContext.isListItemBlock(blockId)) {
      return {
        listItem: true,
        listPrefix: listContext.getListPrefix(blockId) || "- ",
      };
    }
    return { listItem: false };
  };

  rows.forEach((row, index) => {
    const blockSort =
      resolvedOrder.orderMap.get(row.id) ??
      index;
    blockSortMap.set(row.id, blockSort);
    if (row.type === "h") {
      headingBlockIds.add(row.id);
    }
  });
  const domBlockSort = getDomBlockSortMap(protyle);
  domBlockSort.forEach((value, key) => {
    if (!blockSortMap.has(key)) {
      blockSortMap.set(key, value);
    }
  });
  blockSortMap.set(rootId, blockSortMap.get(rootId) ?? -1);

  rows.forEach((row) => {
    if (row.type === "h") {
      const levelMatch = (row.subtype || "").match(/h([1-6])/i);
      const level = levelMatch ? Number(levelMatch[1]) : 1;
      const text = cleanInlineText(row.content || "");
      if (text) {
        const listLine = resolveListLine(row.id);
        items.push({
          id: `${row.id}-heading-${order}`,
          type: "title",
          text: listLine.listPrefix ? normalizeListDecoratedText(text) : text,
          raw: `${"#".repeat(level)} ${text}`,
          offset: 0,
          blockId: row.id,
          blockSort: blockSortMap.get(row.id) ?? 0,
          order,
          listItem: listLine.listItem,
          listPrefix: listLine.listPrefix,
        });
        order += 1;
      }
    }
  });

  rows.forEach((row, index) => {
    const rowType = (row.type || "").toLowerCase();
    const blockSort =
      blockSortMap.get(row.id) ??
      resolvedOrder.orderMap.get(row.id) ??
      index;
    const isRootDocRow = row.id === rootId && row.type === "d";
    const isListContainerRow = rowType === "l";
    const isListItemWithMappedChild =
      rowType === "i" && listContext.hasMappedListLineChild(row.id);
    const shouldExtractMarkdown =
      (!isRootDocRow || !hasChildBlocks) &&
      !isListContainerRow &&
      !isListItemWithMappedChild;
    const markdown = shouldExtractMarkdown
      ? (kramdownMap.get(row.id) || row.markdown || "")
      : "";
    const extracted = shouldExtractMarkdown
      ? extractKeyInfoFromMarkdown(markdown)
      : [];
    for (const item of extracted) {
      const listLine = resolveListLine(row.id);
      const normalizedText = listLine.listPrefix
        ? normalizeListDecoratedText(item.text)
        : item.text;
      if (item.type === "title") {
        if (row.type === "h") {
          continue;
        }
        items.push({
          id: `${row.id}-${order}`,
          type: item.type,
          text: normalizedText,
          raw: item.raw,
          offset: item.offset,
          blockId: row.id,
          blockSort,
          order,
          listItem: listLine.listItem,
          listPrefix: listLine.listPrefix,
        });
        order += 1;
        continue;
      }
      markdownInlineItems.push({
        id: `${row.id}-inline-${order}`,
        type: item.type,
        text: normalizedText,
        raw: item.raw,
        offset: item.offset,
        blockId: row.id,
        blockSort,
        order,
        listItem: listLine.listItem,
        listPrefix: listLine.listPrefix,
      });
      order += 1;
    }

    const memoText = (row.memo || "").trim();
    if (memoText) {
      const listLine = resolveListLine(row.id);
      items.push({
        id: `${row.id}-memo-${order}`,
        type: "remark",
        text: listLine.listPrefix ? normalizeListDecoratedText(memoText) : memoText,
        raw: `%%${memoText}%%`,
        offset: 1_000_000,
        blockId: row.id,
        blockSort,
        order,
        listItem: listLine.listItem,
        listPrefix: listLine.listPrefix,
      });
      order += 1;
    }

    const tags = splitTags(row.tag || "");
    tags.forEach((tag) => {
      const listLine = resolveListLine(row.id);
      items.push({
        id: `${row.id}-tag-${order}`,
        type: "tag",
        text: tag,
        raw: `#${tag}`,
        offset: order,
        blockId: row.id,
        blockSort,
        order,
        listItem: listLine.listItem,
        listPrefix: listLine.listPrefix,
      });
      order += 1;
    });
  });

  const spanItems = mapSpanRowsToItems(
    await listSpanRows(rootId),
    blockSortMap,
    resolveListLine
  ).filter(
    (item) => !headingBlockIds.has(item.blockId || "")
  );
  const domItems = extractInlineFromDom(protyle, blockSortMap, rootId, resolveListLine).filter(
    (item) => !headingBlockIds.has(item.blockId || "")
  );
  items.push(
    ...mergePreferredInlineItems(markdownInlineItems, spanItems, domItems)
  );

  const normalizedDocTitle = normalizeTitle(docTitle);
  const hasDocTitleHeading =
    docTitle &&
    items.some(
      (item) =>
        item.type === "title" &&
        normalizeTitle(item.text) === normalizedDocTitle
    );
  if (docTitle && !hasDocTitleHeading) {
    items.push({
      id: `doc-title-${order}`,
      type: "title",
      text: docTitle,
      raw: `# ${docTitle}`,
      offset: -1,
      blockId: rootId,
      blockSort: -1,
      order,
      listItem: false,
      listPrefix: undefined,
    });
  }

  items.sort((a, b) => {
    if (a.blockSort !== b.blockSort) {
      return a.blockSort - b.blockSort;
    }
    if (a.offset !== b.offset) {
      return a.offset - b.offset;
    }
    return a.order - b.order;
  });

  return {
    docId: rootId,
    docTitle,
    items,
  };
}
