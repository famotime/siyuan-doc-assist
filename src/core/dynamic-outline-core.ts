import {
  filterKeyInfoItems,
  KeyInfoFilter,
  KeyInfoItem,
  KeyInfoType
} from "./key-info-core";
import { HeadingLevel } from "./key-info-heading-color-core";

export type DynamicOutlineItem = {
  id: string;
  blockId: string;
  text: string;
  type: KeyInfoType;
  level: HeadingLevel | 0;
  posRatio: number;
  order: number;
};

export type DynamicOutlinePosition = "left" | "right";

export type DynamicOutlineConfig = {
  enabled: boolean;
  followKeyInfo: boolean;
  position: DynamicOutlinePosition;
};

export const DEFAULT_DYNAMIC_OUTLINE_CONFIG: DynamicOutlineConfig = {
  enabled: false,
  followKeyInfo: false,
  position: "right"
};

export function parseHeadingLevel(item: KeyInfoItem): HeadingLevel | 0 {
  if (item.type !== "title") {
    return 0;
  }
  if (item.headingLevel && item.headingLevel >= 1 && item.headingLevel <= 6) {
    return item.headingLevel as HeadingLevel;
  }
  const match = (item.raw || "").match(/^#{1,6}\s+/);
  if (match) {
    const hashes = match[0].trim().length;
    if (hashes >= 1 && hashes <= 6) {
      return hashes as HeadingLevel;
    }
  }
  return 1;
}

export function buildDynamicOutlineItems(
  items: KeyInfoItem[],
  options: {
    followKeyInfo: boolean;
    activeFilter?: KeyInfoFilter;
  }
): DynamicOutlineItem[] {
  if (!items || items.length === 0) {
    return [];
  }

  let filtered: KeyInfoItem[];
  if (!options.followKeyInfo) {
    filtered = items.filter((item) => item.type === "title");
  } else if (!options.activeFilter || options.activeFilter.length === 0) {
    filtered = items;
  } else {
    filtered = filterKeyInfoItems(items, options.activeFilter);
  }

  if (filtered.length === 0) {
    return [];
  }

  const minOrder = filtered[0].order;
  const maxOrder = filtered[filtered.length - 1].order;
  const orderSpan = maxOrder - minOrder;

  return filtered.map((item, index) => {
    const level = parseHeadingLevel(item);
    const posRatio =
      orderSpan > 0 ?
          Math.max(0, Math.min(1, (item.order - minOrder) / orderSpan)) :
        filtered.length > 1 ?
          index / (filtered.length - 1) :
          0.5;

    return {
      id: item.id,
      blockId: item.blockId || "",
      text: item.text.trim(),
      type: item.type,
      level,
      posRatio,
      order: item.order
    };
  });
}

export function calculateViewportIndicator(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  trackHeight: number
): { top: number; height: number } {
  if (scrollHeight <= 0 || clientHeight <= 0 || trackHeight <= 0) {
    return { top: 0, height: trackHeight };
  }
  if (scrollHeight <= clientHeight) {
    return { top: 0, height: trackHeight };
  }

  const viewRatio = Math.min(1, clientHeight / scrollHeight);
  const minIndicatorHeight = 16;
  const rawHeight = trackHeight * viewRatio;
  const height = Math.max(minIndicatorHeight, Math.min(trackHeight, rawHeight));

  const maxScroll = scrollHeight - clientHeight;
  const scrollRatio = Math.max(0, Math.min(1, scrollTop / maxScroll));
  const availableTrack = trackHeight - height;
  const top = scrollRatio * availableTrack;

  return {
    top: Math.round(top),
    height: Math.round(height)
  };
}

export function findActiveOutlineItemIndex(
  items: DynamicOutlineItem[],
  scrollRatio: number
): number {
  if (!items || items.length === 0) {
    return -1;
  }
  if (items.length === 1) {
    return 0;
  }

  let activeIdx = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i].posRatio <= scrollRatio + 0.05) {
      activeIdx = i;
    } else {
      break;
    }
  }
  return activeIdx;
}
