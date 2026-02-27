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
  buildInlineRaw,
  extractHighlightInlineCodeTexts,
  formatRemarkText,
  KeyInfoDocResult,
  normalizeHighlightTextWithoutLinksAndCode,
  parseRemarkText,
  normalizeTitle,
} from "@/services/key-info-model";
import {
  getKramdownMap,
  listDocBlocks,
  listSpanRows,
  resolveRootId,
} from "@/services/key-info-query";

function normalizeHighlightItems(items: KeyInfoItem[]): KeyInfoItem[] {
  const normalized: KeyInfoItem[] = [];
  items.forEach((item) => {
    if (item.type !== "highlight") {
      normalized.push(item);
      return;
    }
    const source = item.raw || item.text || "";
    const text = normalizeHighlightTextWithoutLinksAndCode(source, item.text);
    if (text) {
      normalized.push({
        ...item,
        text,
        raw: buildInlineRaw("highlight", text),
      });
    }
    const codeTexts = extractHighlightInlineCodeTexts(source, item.text);
    codeTexts.forEach((code, index) => {
      normalized.push({
        ...item,
        id: `${item.id}-code-${index}`,
        type: "code",
        text: code,
        raw: buildInlineRaw("code", code),
        offset: item.offset + (index + 1) * 0.001,
        order: item.order + (index + 1) * 0.001,
      });
    });
  });
  return normalized;
}

function normalizeBoldItems(items: KeyInfoItem[]): KeyInfoItem[] {
  const nonBold: KeyInfoItem[] = [];
  const buckets = new Map<string, KeyInfoItem[]>();

  items.forEach((item) => {
    if (item.type !== "bold") {
      nonBold.push(item);
      return;
    }
    const blockKey = `${item.blockId || ""}|${item.blockSort}`;
    const bucket = buckets.get(blockKey) || [];
    bucket.push({ ...item });
    buckets.set(blockKey, bucket);
  });

  const mergedBold: KeyInfoItem[] = [];
  buckets.forEach((bucket) => {
    bucket.sort((a, b) => {
      if (a.offset !== b.offset) {
        return a.offset - b.offset;
      }
      return a.order - b.order;
    });

    let current: KeyInfoItem | null = null;
    let currentEnd = 0;
    const flush = () => {
      if (!current) {
        return;
      }
      current.raw = buildInlineRaw("bold", current.text);
      mergedBold.push(current);
      current = null;
      currentEnd = 0;
    };

    bucket.forEach((item) => {
      const text = item.text || "";
      const start = item.offset;
      const end = start + text.length;
      if (!current) {
        current = { ...item };
        currentEnd = end;
        return;
      }
      if (start <= currentEnd) {
        if (text.includes(current.text)) {
          current.text = text;
        } else if (!current.text.includes(text)) {
          let overlap = 0;
          const maxOverlap = Math.min(current.text.length, text.length);
          for (let size = maxOverlap; size > 0; size -= 1) {
            if (current.text.endsWith(text.slice(0, size))) {
              overlap = size;
              break;
            }
          }
          current.text = `${current.text}${text.slice(overlap)}`;
        }
        currentEnd = Math.max(currentEnd, end);
        if (!current.listPrefix && item.listPrefix) {
          current.listPrefix = item.listPrefix;
        }
        if (!current.listItem && item.listItem) {
          current.listItem = item.listItem;
        }
        current.order = Math.min(current.order, item.order);
        current.offset = Math.min(current.offset, item.offset);
        return;
      }
      flush();
      current = { ...item };
      currentEnd = end;
    });

    flush();
  });

  return [...nonBold, ...mergedBold];
}

function normalizeRemarkItems(items: KeyInfoItem[]): KeyInfoItem[] {
  const normalized = items.map((item) => {
    if (item.type !== "remark") {
      return item;
    }
    const parsed = parseRemarkText(item.text || item.raw || "");
    const text = formatRemarkText(parsed.marked, parsed.memo);
    return {
      ...item,
      text,
      raw: item.raw || text,
    };
  });

  const memoOnlyBlockMap = new Map<string, Set<string>>();
  normalized.forEach((item) => {
    if (item.type !== "remark") {
      return;
    }
    const parsed = parseRemarkText(item.text || "");
    if (!parsed.memo) {
      return;
    }
    const blockId = item.blockId || "";
    const bucket = memoOnlyBlockMap.get(blockId) || new Set<string>();
    bucket.add(parsed.memo);
    memoOnlyBlockMap.set(blockId, bucket);
  });

  const deduped: KeyInfoItem[] = [];
  const seen = new Set<string>();
  normalized.forEach((item) => {
    if (item.type !== "remark") {
      deduped.push(item);
      return;
    }
    const parsed = parseRemarkText(item.text || "");
    const blockId = item.blockId || "";
    if (!parsed.memo && memoOnlyBlockMap.get(blockId)?.has(parsed.marked)) {
      return;
    }
    const key = `${blockId}|${item.type}|${item.text}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    deduped.push(item);
  });

  return deduped;
}

export async function getDocKeyInfo(docId: string, protyle?: unknown): Promise<KeyInfoDocResult> {
  let rootId = docId;
  let rows = await listDocBlocks(rootId);
  if (!rows.length) {
    const resolvedRootId = await resolveRootId(docId);
    if (resolvedRootId && resolvedRootId !== rootId) {
      rootId = resolvedRootId;
      rows = await listDocBlocks(rootId);
    }
  }
  const docMeta = await getDocMetaByID(rootId);
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
  const syOrderMap = await getDocTreeOrderFromSy(rootId, docMeta ?? null);
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

  const normalizedItems = normalizeRemarkItems(normalizeBoldItems(normalizeHighlightItems(items)));

  normalizedItems.sort((a, b) => {
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
    items: normalizedItems,
  };
}
