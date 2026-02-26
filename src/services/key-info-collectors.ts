import { extractKeyInfoFromMarkdown, KeyInfoItem } from "@/core/key-info-core";
import {
  cleanInlineText,
  normalizeListDecoratedText,
  splitTags,
} from "@/services/key-info-model";
import { SqlKeyInfoRow } from "@/services/key-info-model";

type ResolveListLine = (blockId?: string) => { listItem: boolean; listPrefix?: string };

export function collectHeadingItems(
  rows: SqlKeyInfoRow[],
  blockSortMap: Map<string, number>,
  resolveListLine: ResolveListLine,
  startOrder = 0
): {
  items: KeyInfoItem[];
  headingBlockIds: Set<string>;
  nextOrder: number;
} {
  const items: KeyInfoItem[] = [];
  const headingBlockIds = new Set<string>();
  let order = startOrder;

  rows.forEach((row) => {
    if (row.type === "h") {
      headingBlockIds.add(row.id);
      const levelMatch = (row.subtype || "").match(/h([1-6])/i);
      const level = levelMatch ? Number(levelMatch[1]) : 1;
      const text = cleanInlineText(row.content || "");
      if (!text) {
        return;
      }
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
  });

  return {
    items,
    headingBlockIds,
    nextOrder: order,
  };
}

export function collectMarkdownAndMetaItems(
  rows: SqlKeyInfoRow[],
  options: {
    rootId: string;
    hasChildBlocks: boolean;
    kramdownMap: Map<string, string>;
    blockSortMap: Map<string, number>;
    isListItemWithMappedChild: (blockId?: string) => boolean;
    resolveListLine: ResolveListLine;
    startOrder?: number;
  }
): {
  items: KeyInfoItem[];
  markdownInlineItems: KeyInfoItem[];
  nextOrder: number;
} {
  const items: KeyInfoItem[] = [];
  const markdownInlineItems: KeyInfoItem[] = [];
  const {
    rootId,
    hasChildBlocks,
    kramdownMap,
    blockSortMap,
    isListItemWithMappedChild,
    resolveListLine,
  } = options;
  let order = options.startOrder ?? 0;

  rows.forEach((row, index) => {
    const rowType = (row.type || "").toLowerCase();
    const blockSort = blockSortMap.get(row.id) ?? index;
    const isRootDocRow = row.id === rootId && row.type === "d";
    const isListContainerRow = rowType === "l";
    const shouldExtractMarkdown =
      (!isRootDocRow || !hasChildBlocks) &&
      !isListContainerRow &&
      !isListItemWithMappedChild(row.id);
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

  return {
    items,
    markdownInlineItems,
    nextOrder: order,
  };
}
