import { KeyInfoItem } from "@/core/key-info-core";
import {
  buildInlineRaw,
  extractHighlightInlineCodeTexts,
  formatRemarkText,
  normalizeHighlightTextWithoutLinksAndCode,
  normalizeTagTextValue,
  normalizeTitle,
  parseRemarkText,
} from "@/services/key-info-model";

export type AppendDocTitleItemOptions = {
  docTitle: string;
  rootId: string;
  nextOrder: number;
};

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
  const isNear = (a: { blockSort: number; order: number }, b: { blockSort: number; order: number }) =>
    Math.abs(a.blockSort - b.blockSort) <= 1 || Math.abs(a.order - b.order) <= 5;
  const isInlineRemark = (item: KeyInfoItem): boolean =>
    item.id.startsWith("span-") || item.id.startsWith("dom-");
  const isBlockMetaRemark = (item: KeyInfoItem): boolean =>
    item.id.includes("-memo-") || item.offset >= 1_000_000;
  const isSameBlockAnchor = (a: KeyInfoItem, b: KeyInfoItem): boolean => {
    if (a.blockId && b.blockId) {
      return a.blockId === b.blockId;
    }
    return a.blockSort === b.blockSort;
  };

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

  const parsedRemarkMap = new Map<string, { marked: string; memo: string }>();
  normalized.forEach((item) => {
    if (item.type !== "remark") {
      return;
    }
    parsedRemarkMap.set(item.id, parseRemarkText(item.text || ""));
  });
  const remarkItems = normalized.filter((item) => item.type === "remark");
  const suppressedWeakInlineRemarkIds = new Set<string>();
  remarkItems.forEach((item) => {
    const parsed = parsedRemarkMap.get(item.id) || { marked: "", memo: "" };
    const isWeakInlineOrBlockMeta =
      !parsed.memo &&
      (isInlineRemark(item) || isBlockMetaRemark(item));
    if (!isWeakInlineOrBlockMeta) {
      return;
    }
    const hasSameBlockRichInlineRemark = remarkItems.some((candidate) => {
      if (candidate.id === item.id || !isInlineRemark(candidate)) {
        return false;
      }
      const candidateParsed = parsedRemarkMap.get(candidate.id) || { marked: "", memo: "" };
      if (!candidateParsed.memo) {
        return false;
      }
      return isSameBlockAnchor(item, candidate);
    });
    if (hasSameBlockRichInlineRemark) {
      suppressedWeakInlineRemarkIds.add(item.id);
    }
  });

  const deduped: KeyInfoItem[] = [];
  const seenBySignature = new Map<string, Array<{ blockSort: number; order: number }>>();
  normalized.forEach((item) => {
    if (item.type !== "remark") {
      deduped.push(item);
      return;
    }
    if (suppressedWeakInlineRemarkIds.has(item.id)) {
      return;
    }
    const signature = `${item.type}|${item.text}`;
    const seenAnchors = seenBySignature.get(signature) || [];
    const isDuplicated = seenAnchors.some((anchor) =>
      isNear(anchor, { blockSort: item.blockSort, order: item.order })
    );
    if (isDuplicated) {
      return;
    }
    seenAnchors.push({ blockSort: item.blockSort, order: item.order });
    seenBySignature.set(signature, seenAnchors);
    deduped.push(item);
  });

  return deduped;
}

function normalizeTagItems(items: KeyInfoItem[]): KeyInfoItem[] {
  const normalized: KeyInfoItem[] = [];
  const seenByAnchor = new Set<string>();

  items.forEach((item) => {
    if (item.type !== "tag") {
      normalized.push(item);
      return;
    }

    const text = normalizeTagTextValue(item.text || item.raw || "");
    if (!text) {
      return;
    }

    const anchorKey = `${item.blockId || ""}|${item.blockSort}|${text}`;
    if (seenByAnchor.has(anchorKey)) {
      return;
    }
    seenByAnchor.add(anchorKey);

    normalized.push({
      ...item,
      text,
      raw: `#${text}`,
    });
  });

  return normalized;
}

function mergeSeparatedItemsWithinBlock(items: KeyInfoItem[]): KeyInfoItem[] {
  const mergeableTypes = new Set<KeyInfoItem["type"]>([
    "bold",
    "italic",
    "underline",
    "highlight",
    "code",
    "remark",
    "tag",
    "link",
    "ref",
  ]);
  const nonMergeable: KeyInfoItem[] = [];
  const buckets = new Map<string, KeyInfoItem[]>();

  items.forEach((item) => {
    if (!mergeableTypes.has(item.type)) {
      nonMergeable.push(item);
      return;
    }
    const key = `${item.type}|${item.blockId || ""}|${item.blockSort}`;
    const bucket = buckets.get(key) || [];
    bucket.push({ ...item });
    buckets.set(key, bucket);
  });

  const mergedItems: KeyInfoItem[] = [];
  buckets.forEach((bucket) => {
    bucket.sort((a, b) => {
      if (a.offset !== b.offset) {
        return a.offset - b.offset;
      }
      return a.order - b.order;
    });

    const [first, ...rest] = bucket;
    if (!first) {
      return;
    }

    const merged = rest.reduce<KeyInfoItem>((current, item) => {
      if (item.text === current.text) {
        return current;
      }
      current.text = `${current.text}  ${item.text}`;
      current.raw = `${current.raw}  ${item.raw}`;
      if (!current.listPrefix && item.listPrefix) {
        current.listPrefix = item.listPrefix;
      }
      if (!current.listItem && item.listItem) {
        current.listItem = item.listItem;
      }
      current.order = Math.min(current.order, item.order);
      current.offset = Math.min(current.offset, item.offset);
      return current;
    }, { ...first });

    mergedItems.push(merged);
  });

  return [...nonMergeable, ...mergedItems];
}

export function normalizeKeyInfoItemsByPipeline(items: KeyInfoItem[]): KeyInfoItem[] {
  return mergeSeparatedItemsWithinBlock(
    normalizeTagItems(normalizeRemarkItems(normalizeBoldItems(normalizeHighlightItems(items))))
  );
}

export function appendDocTitleItemIfMissing(
  items: KeyInfoItem[],
  options: AppendDocTitleItemOptions
): KeyInfoItem[] {
  const { docTitle, rootId, nextOrder } = options;
  if (!docTitle) {
    return items;
  }
  const normalizedDocTitle = normalizeTitle(docTitle);
  const hasDocTitleHeading = items.some(
    (item) => item.type === "title" && normalizeTitle(item.text) === normalizedDocTitle
  );
  if (hasDocTitleHeading) {
    return items;
  }
  return [
    ...items,
    {
      id: `doc-title-${nextOrder}`,
      type: "title",
      text: docTitle,
      raw: `# ${docTitle}`,
      offset: -1,
      blockId: rootId,
      blockSort: -1,
      order: nextOrder,
      listItem: false,
      listPrefix: undefined,
    },
  ];
}

export function sortKeyInfoItemsByAnchor(items: KeyInfoItem[]): KeyInfoItem[] {
  return [...items].sort((a, b) => {
    if (a.blockSort !== b.blockSort) {
      return a.blockSort - b.blockSort;
    }
    if (a.offset !== b.offset) {
      return a.offset - b.offset;
    }
    return a.order - b.order;
  });
}
