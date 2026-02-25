import { KeyInfoItem } from "@/core/key-info-core";

export function resolveKeyInfoItems(params: {
  isSameDoc: boolean;
  hasItems: boolean;
  currentItems: KeyInfoItem[];
  latestItems: KeyInfoItem[];
}): KeyInfoItem[] {
  const { latestItems } = params;
  // Always trust latest service snapshot to preserve true document order.
  return latestItems;
}
