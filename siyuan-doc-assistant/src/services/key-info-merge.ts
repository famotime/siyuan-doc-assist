import { KeyInfoItem } from "@/core/key-info-core";

export function mergePreferredInlineItems(
  markdownInlineItems: KeyInfoItem[],
  spanItems: KeyInfoItem[],
  domItems: KeyInfoItem[]
): KeyInfoItem[] {
  let preferredInlineItems: KeyInfoItem[] = [];
  if (domItems.length || spanItems.length) {
    const spanBuckets = new Map<string, KeyInfoItem[]>();
    spanItems.forEach((item) => {
      const key = `${item.type}|${item.text}|${item.blockId}`;
      const bucket = spanBuckets.get(key) || [];
      bucket.push(item);
      spanBuckets.set(key, bucket);
    });

    const mergedDom = domItems.map((item) => {
      const key = `${item.type}|${item.text}|${item.blockId}`;
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
    const key = `${item.type}|${item.text}|${item.blockId}`;
    const bucket = preferredBuckets.get(key) || [];
    bucket.push(item);
    preferredBuckets.set(key, bucket);
  });

  const merged = [...preferredInlineItems];
  markdownInlineItems.forEach((item) => {
    const key = `${item.type}|${item.text}|${item.blockId}`;
    const bucket = preferredBuckets.get(key);
    if (bucket && bucket.length) {
      bucket.pop();
      return;
    }
    merged.push(item);
  });
  return merged;
}
