import { KeyInfoItem } from "@/core/key-info-core";
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
  buildStructuralBlockOrderMap,
  createListContextResolver,
  resolveBlockOrderMap,
} from "@/services/key-info-order";
import {
  collectHeadingItems,
  collectMarkdownAndMetaItems,
} from "@/services/key-info-collectors";
import {
  KeyInfoDocResult,
  normalizeTitle,
} from "@/services/key-info-model";
import {
  getKramdownMap,
  listDocBlocks,
  listSpanRows,
  resolveRootId,
} from "@/services/key-info-query";

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
  const hasChildBlocks = rows.some((row) => row.id !== rootId);
  const blockSortMap = new Map<string, number>();
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
  });
  const domBlockSort = getDomBlockSortMap(protyle);
  domBlockSort.forEach((value, key) => {
    if (!blockSortMap.has(key)) {
      blockSortMap.set(key, value);
    }
  });
  blockSortMap.set(rootId, blockSortMap.get(rootId) ?? -1);

  const headingResult = collectHeadingItems(rows, blockSortMap, resolveListLine, 0);
  const headingBlockIds = headingResult.headingBlockIds;
  items.push(...headingResult.items);
  const markdownMetaResult = collectMarkdownAndMetaItems(rows, {
    rootId,
    hasChildBlocks,
    kramdownMap,
    blockSortMap,
    isListItemWithMappedChild: (blockId) => listContext.hasMappedListLineChild(blockId),
    resolveListLine,
    startOrder: headingResult.nextOrder,
  });
  items.push(...markdownMetaResult.items);
  const markdownInlineItems = markdownMetaResult.markdownInlineItems;

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
      id: `doc-title-${markdownMetaResult.nextOrder}`,
      type: "title",
      text: docTitle,
      raw: `# ${docTitle}`,
      offset: -1,
      blockId: rootId,
      blockSort: -1,
      order: markdownMetaResult.nextOrder,
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
