import { KeyInfoItem } from "@/core/key-info-core";
import {
  getDocMetaByID,
  getDocTreeOrderFromSy,
  getRootDocRawMarkdown
} from "@/services/kernel";
import {
  extractInlineFromDom,
  getDomBlockSortMap,
  mapSpanRowsToItems
} from "@/services/key-info-inline";
import { mergePreferredInlineItems } from "@/services/key-info-merge";
import {
  buildStructuralBlockOrderMap,
  createListContextResolver,
  resolveBlockOrderMap
} from "@/services/key-info-order";
import {
  collectHeadingItems,
  collectMarkdownAndMetaItems
} from "@/services/key-info-collectors";
import { KeyInfoDocResult } from "@/services/key-info-model";
import {
  appendDocTitleItemIfMissing,
  normalizeKeyInfoItemsByPipeline,
  sortKeyInfoItemsByAnchor
} from "@/services/key-info-pipeline";
import {
  getKramdownMap,
  listDocBlocks,
  listSpanRows,
  resolveRootId
} from "@/services/key-info-query";

const inFlightKeyInfoRequests = new Map<string, Promise<KeyInfoDocResult>>();

async function fetchDocKeyInfoUncached(
  docId: string,
  protyle?: unknown
): Promise<KeyInfoDocResult> {
  let rootId = docId;
  let [rows, docMeta] = await Promise.all([
    listDocBlocks(rootId),
    getDocMetaByID(rootId)
  ]);
  if (!rows.length) {
    const resolvedRootId = await resolveRootId(docId);
    if (resolvedRootId && resolvedRootId !== rootId) {
      rootId = resolvedRootId;
      [rows, docMeta] = await Promise.all([
        listDocBlocks(rootId),
        getDocMetaByID(rootId)
      ]);
    }
  }
  const docTitle = docMeta?.title || "";

  if (!rows.length) {
    const fallbackMarkdown = await getRootDocRawMarkdown(rootId);
    if (fallbackMarkdown) {
      rows = [
        {
          id: rootId,
          sort: 0,
          markdown: fallbackMarkdown,
          memo: "",
          tag: ""
        }
      ];
    }
  }

  const hasChildBlocks = rows.some((row) => row.id !== rootId);
  const kramdownTargetIds = rows
    .filter((row) => {
      const rowType = (row.type || "").toLowerCase();
      if (rowType === "l") {
        return false;
      }
      if (row.id === rootId && rowType === "d" && hasChildBlocks) {
        return false;
      }
      return true;
    })
    .map((row) => row.id);

  const [kramdownMap, syOrderMap, spanRows] = await Promise.all([
    getKramdownMap(kramdownTargetIds),
    getDocTreeOrderFromSy(rootId, docMeta ?? null),
    listSpanRows(rootId)
  ]);

  const items: KeyInfoItem[] = [];
  const blockSortMap = new Map<string, number>();
  const structuralOrderMap = buildStructuralBlockOrderMap(rows, rootId);
  const resolvedOrder = resolveBlockOrderMap(rows, syOrderMap, structuralOrderMap);
  const listContext = createListContextResolver(rows);
  const resolveListLine = (blockId?: string): { listItem: boolean; listPrefix?: string } => {
    if (!blockId) {
      return { listItem: false };
    }
    if (listContext.isListItemBlock(blockId)) {
      return {
        listItem: true,
        listPrefix: listContext.getListPrefix(blockId) || "- "
      };
    }
    return { listItem: false };
  };
  const remapListLineAnchor = (item: KeyInfoItem): KeyInfoItem => {
    const blockId = item.blockId;
    const mappedBlockId = listContext.getMappedListLineChildId(blockId);
    if (!mappedBlockId || mappedBlockId === blockId) {
      return item;
    }
    const listLine = resolveListLine(mappedBlockId);
    return {
      ...item,
      blockId: mappedBlockId,
      blockSort: blockSortMap.get(mappedBlockId) ?? item.blockSort,
      listItem: listLine.listItem,
      listPrefix: listLine.listPrefix
    };
  };

  rows.forEach((row, index) => {
    const blockSort =
      resolvedOrder.orderMap.get(row.id) ??
      index;
    blockSortMap.set(row.id, blockSort);
  });
  const domBlockSort = getDomBlockSortMap(protyle);
  domBlockSort.forEach((value, key) => {
    if (!blockSortMap.has(key)) {
      blockSortMap.set(key, value);
    }
  });
  blockSortMap.set(rootId, blockSortMap.get(rootId) ?? -1);

  const headingResult = collectHeadingItems(rows, blockSortMap, resolveListLine, 0);
  items.push(...headingResult.items);
  const markdownMetaResult = collectMarkdownAndMetaItems(rows, {
    rootId,
    hasChildBlocks,
    kramdownMap,
    blockSortMap,
    isListItemWithMappedChild: (blockId) => listContext.hasMappedListLineChild(blockId),
    getMappedListLineChildId: (blockId) => listContext.getMappedListLineChildId(blockId),
    resolveListLine,
    startOrder: headingResult.nextOrder
  });
  items.push(...markdownMetaResult.items);
  const markdownInlineItems = markdownMetaResult.markdownInlineItems;

  const spanItems = mapSpanRowsToItems(
    spanRows,
    blockSortMap,
    resolveListLine
  ).map(remapListLineAnchor);
  const domItems = extractInlineFromDom(protyle, blockSortMap, rootId, resolveListLine)
    .map(remapListLineAnchor);
  items.push(
    ...mergePreferredInlineItems(markdownInlineItems, spanItems, domItems)
  );

  const withDocTitle = appendDocTitleItemIfMissing(items, {
    docTitle,
    rootId,
    nextOrder: markdownMetaResult.nextOrder
  });
  const normalizedItems = normalizeKeyInfoItemsByPipeline(withDocTitle);
  const sortedItems = sortKeyInfoItemsByAnchor(normalizedItems);

  return {
    docId: rootId,
    docTitle,
    items: sortedItems
  };
}

export async function getDocKeyInfo(docId: string, protyle?: unknown): Promise<KeyInfoDocResult> {
  const key = `${(docId || "").trim()}::${protyle ? "dom" : "no-dom"}`;
  if (!docId) {
    return fetchDocKeyInfoUncached(docId, protyle);
  }
  const existing = inFlightKeyInfoRequests.get(key);
  if (existing) {
    return existing;
  }
  const pending = fetchDocKeyInfoUncached(docId, protyle).finally(() => {
    if (inFlightKeyInfoRequests.get(key) === pending) {
      inFlightKeyInfoRequests.delete(key);
    }
  });
  inFlightKeyInfoRequests.set(key, pending);
  return pending;
}
