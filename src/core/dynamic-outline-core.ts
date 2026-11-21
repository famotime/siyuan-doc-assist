import PinyinMatch from "pinyin-match";
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

export type ProgressAnchor = {
  posRatio: number;
  domTop: number;
};

export function estimateGlobalDocumentProgress(options: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  anchors: ProgressAnchor[];
}): number {
  const { scrollTop, scrollHeight, clientHeight, anchors } = options;
  const maxScroll = scrollHeight - clientHeight;
  if (maxScroll <= 0) {
    return 0;
  }

  const viewCenter = scrollTop + clientHeight / 2;

  if (!anchors || anchors.length === 0) {
    return Math.max(0, Math.min(1, scrollTop / maxScroll));
  }

  const sorted = [...anchors].sort((a, b) => a.domTop - b.domTop);

  // 视口在第一个锚点之前
  if (viewCenter <= sorted[0].domTop) {
    const first = sorted[0];
    if (first.domTop <= 0) {
      return first.posRatio;
    }
    const ratioBefore = Math.max(0, viewCenter / first.domTop);
    return first.posRatio * ratioBefore;
  }

  // 视口在最后一个锚点之后（懒加载未拉取后续块时，平滑推进，避免突跳到底部）
  const last = sorted[sorted.length - 1];
  if (viewCenter >= last.domTop) {
    const remaining = scrollHeight - last.domTop;
    if (remaining <= 0) {
      return last.posRatio;
    }
    const fraction = Math.min(1, (viewCenter - last.domTop) / remaining);
    const maxPush = Math.min(0.12, 1 - last.posRatio);
    return Math.min(1, last.posRatio + fraction * maxPush);
  }

  // 在两个锚点之间线性插值
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    if (viewCenter >= cur.domTop && viewCenter <= next.domTop) {
      const span = next.domTop - cur.domTop;
      if (span <= 0) {
        return cur.posRatio;
      }
      const t = (viewCenter - cur.domTop) / span;
      return cur.posRatio + t * (next.posRatio - cur.posRatio);
    }
  }

  return Math.max(0, Math.min(1, scrollTop / maxScroll));
}

export function calculateViewportIndicator(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  trackHeight: number,
  overrideProgressRatio?: number
): { top: number; height: number } {
  if (scrollHeight <= 0 || clientHeight <= 0 || trackHeight <= 0) {
    return { top: 0, height: trackHeight };
  }
  if (scrollHeight <= clientHeight) {
    return { top: 0, height: trackHeight };
  }

  const viewRatio = Math.min(1, clientHeight / scrollHeight);
  const minIndicatorHeight = 18;
  const rawHeight = trackHeight * viewRatio;
  const height = Math.max(minIndicatorHeight, Math.min(trackHeight, rawHeight));

  const maxScroll = scrollHeight - clientHeight;
  const scrollRatio =
    typeof overrideProgressRatio === "number" ?
        Math.max(0, Math.min(1, overrideProgressRatio)) :
        Math.max(0, Math.min(1, scrollTop / maxScroll));
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

export type FilteredOutlineItem = {
  item: DynamicOutlineItem;
  matchRange?: [number, number];
  isAncestor?: boolean;
};

export type FilterOutlineOptions = {
  showTreeContext?: boolean;
};

export function filterDynamicOutlineItems(
  items: DynamicOutlineItem[],
  query: string,
  options?: FilterOutlineOptions
): FilteredOutlineItem[] {
  if (!items || items.length === 0) {
    return [];
  }

  const trimmed = (query || "").trim();
  if (!trimmed) {
    return items.map((item) => ({ item, isAncestor: false }));
  }

  const directMatches = new Map<number, [number, number]>();
  items.forEach((item, index) => {
    const matched = PinyinMatch.match(item.text, trimmed);
    if (matched) {
      directMatches.set(index, matched);
    }
  });

  if (options?.showTreeContext) {
    const includedIndices = new Set<number>();
    const ancestorIndices = new Set<number>();

    for (const matchIdx of directMatches.keys()) {
      includedIndices.add(matchIdx);
      const matchItem = items[matchIdx];
      let targetLevel = matchItem.level > 0 ? matchItem.level : 1;

      for (let j = matchIdx - 1; j >= 0; j--) {
        const candidate = items[j];
        if (candidate.level > 0 && candidate.level < targetLevel) {
          includedIndices.add(j);
          if (!directMatches.has(j)) {
            ancestorIndices.add(j);
          }
          targetLevel = candidate.level;
          if (targetLevel === 1) {
            break;
          }
        }
      }
    }

    const sortedIndices = Array.from(includedIndices).sort((a, b) => a - b);
    return sortedIndices.map((idx) => {
      const isAncestor = ancestorIndices.has(idx);
      return {
        item: items[idx],
        matchRange: isAncestor ? undefined : directMatches.get(idx),
        isAncestor
      };
    });
  }

  const result: FilteredOutlineItem[] = [];
  items.forEach((item, index) => {
    const matchRange = directMatches.get(index);
    if (matchRange) {
      result.push({
        item,
        matchRange,
        isAncestor: false
      });
    }
  });
  return result;
}

export function highlightMatchRanges(
  text: string,
  matchRange?: [number, number]
): { text: string; highlight: boolean }[] {
  if (!text) {
    return [];
  }
  if (!matchRange || matchRange.length < 2) {
    return [{ text, highlight: false }];
  }

  const rawStart = matchRange[0];
  const rawEnd = matchRange[1];
  const start = Math.max(0, Math.min(text.length - 1, rawStart));
  const end = Math.max(0, Math.min(text.length - 1, rawEnd));

  if (start > end) {
    return [{ text, highlight: false }];
  }

  const parts: { text: string; highlight: boolean }[] = [];
  if (start > 0) {
    parts.push({ text: text.slice(0, start), highlight: false });
  }
  parts.push({ text: text.slice(start, end + 1), highlight: true });
  if (end + 1 < text.length) {
    parts.push({ text: text.slice(end + 1), highlight: false });
  }

  return parts;
}
