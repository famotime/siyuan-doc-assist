import { extractKeyInfoFromMarkdown, KeyInfoItem } from "@/core/key-info-core";
import { getDocMetaByID, getRootDocRawMarkdown } from "@/services/kernel";
import {
  extractInlineFromDom,
  getDomBlockSortMap,
  mapSpanRowsToItems,
} from "@/services/key-info-inline";
import { mergePreferredInlineItems } from "@/services/key-info-merge";
import {
  cleanInlineText,
  KeyInfoDocResult,
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
  let order = 0;
  const blockSortMap = new Map<string, number>();
  const headingBlockIds = new Set<string>();
  rows.forEach((row, index) => {
    const blockSort = normalizeSort(row.sort, index);
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
        items.push({
          id: `${row.id}-heading-${order}`,
          type: "title",
          text,
          raw: `${"#".repeat(level)} ${text}`,
          offset: 0,
          blockId: row.id,
          blockSort: blockSortMap.get(row.id) ?? 0,
          order,
        });
        order += 1;
      }
    }
  });

  rows.forEach((row, index) => {
    const blockSort = blockSortMap.get(row.id) ?? normalizeSort(row.sort, index);
    const markdown = kramdownMap.get(row.id) || row.markdown || "";
    const extracted = extractKeyInfoFromMarkdown(markdown);
    for (const item of extracted) {
      if (item.type === "title") {
        if (row.type === "h") {
          continue;
        }
        items.push({
          id: `${row.id}-${order}`,
          type: item.type,
          text: item.text,
          raw: item.raw,
          offset: item.offset,
          blockId: row.id,
          blockSort,
          order,
        });
        order += 1;
        continue;
      }
      markdownInlineItems.push({
        id: `${row.id}-inline-${order}`,
        type: item.type,
        text: item.text,
        raw: item.raw,
        offset: item.offset,
        blockId: row.id,
        blockSort,
        order,
      });
      order += 1;
    }

    const memoText = (row.memo || "").trim();
    if (memoText) {
      items.push({
        id: `${row.id}-memo-${order}`,
        type: "remark",
        text: memoText,
        raw: `%%${memoText}%%`,
        offset: 1_000_000,
        blockId: row.id,
        blockSort,
        order,
      });
      order += 1;
    }

    const tags = splitTags(row.tag || "");
    tags.forEach((tag) => {
      items.push({
        id: `${row.id}-tag-${order}`,
        type: "tag",
        text: tag,
        raw: `#${tag}`,
        offset: 1_000_000 + order,
        blockId: row.id,
        blockSort,
        order,
      });
      order += 1;
    });
  });

  const spanItems = mapSpanRowsToItems(await listSpanRows(rootId), blockSortMap).filter(
    (item) => !headingBlockIds.has(item.blockId || "")
  );
  const domItems = extractInlineFromDom(protyle, blockSortMap, rootId).filter(
    (item) => !headingBlockIds.has(item.blockId || "")
  );
  items.push(...mergePreferredInlineItems(markdownInlineItems, spanItems, domItems));

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
