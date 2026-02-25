import { KeyInfoItem } from "@/core/key-info-core";
import { normalizeListDecoratedText } from "@/services/key-info-model";

function toMergeKey(item: KeyInfoItem): string {
  const normalizedText = item.listPrefix
    ? normalizeListDecoratedText(item.text)
    : item.text;
  return `${item.type}|${normalizedText}|${item.blockId}`;
}

export function mergePreferredInlineItems(
  markdownInlineItems: KeyInfoItem[],
  spanItems: KeyInfoItem[],
  domItems: KeyInfoItem[]
): KeyInfoItem[] {
  let preferredInlineItems: KeyInfoItem[] = [];
  if (domItems.length || spanItems.length) {
    const spanBuckets = new Map<string, KeyInfoItem[]>();
    spanItems.forEach((item) => {
      const key = toMergeKey(item);
      const bucket = spanBuckets.get(key) || [];
      bucket.push(item);
      spanBuckets.set(key, bucket);
    });

    const mergedDom = domItems.map((item) => {
      const key = toMergeKey(item);
      const bucket = spanBuckets.get(key);
      if (bucket && bucket.length) {
        const match = bucket.shift() as KeyInfoItem;
        return {
          ...item,
          raw: match.raw || item.raw,
          offset: match.offset ?? item.offset,
        };
      }
      return item;
    });

    const remainingSpans: KeyInfoItem[] = [];
    spanBuckets.forEach((bucket) => {
      remainingSpans.push(...bucket);
    });

    preferredInlineItems = [...mergedDom, ...remainingSpans];
  }

  if (!markdownInlineItems.length) {
    return preferredInlineItems;
  }
  if (!preferredInlineItems.length) {
    return markdownInlineItems;
  }

  const preferredBuckets = new Map<string, KeyInfoItem[]>();
  preferredInlineItems.forEach((item) => {
    const key = toMergeKey(item);
    const bucket = preferredBuckets.get(key) || [];
    bucket.push(item);
    preferredBuckets.set(key, bucket);
  });

  const merged = [...preferredInlineItems];
  markdownInlineItems.forEach((item) => {
    const key = toMergeKey(item);
    const bucket = preferredBuckets.get(key);
    if (bucket && bucket.length) {
      const preferred = bucket.pop() as KeyInfoItem;
      const needsListMetaBackfill =
        (!!item.listPrefix && !preferred.listPrefix) ||
        (!!item.listItem && !preferred.listItem);
      if (needsListMetaBackfill) {
        preferred.listItem = preferred.listItem || item.listItem;
        preferred.listPrefix = preferred.listPrefix || item.listPrefix;
        if (preferred.listPrefix) {
          preferred.text = normalizeListDecoratedText(preferred.text);
        }
      }
      return;
    }
    merged.push(item);
  });
  return merged;
}
