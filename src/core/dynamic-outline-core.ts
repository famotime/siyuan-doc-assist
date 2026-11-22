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

export type DynamicOutlineViewMode = "outline" | "open-docs" | "clipboard";

export const ALL_DYNAMIC_OUTLINE_VIEW_MODES: DynamicOutlineViewMode[] = [
  "outline",
  "open-docs",
  "clipboard"
];

export const DEFAULT_DYNAMIC_OUTLINE_VIEW_MODES: DynamicOutlineViewMode[] = [
  "outline",
  "open-docs"
];

export function isDynamicOutlineViewMode(value: unknown): value is DynamicOutlineViewMode {
  return value === "outline" || value === "open-docs" || value === "clipboard";
}

export function normalizeDynamicOutlineViewModes(
  raw: unknown
): DynamicOutlineViewMode[] {
  if (!Array.isArray(raw)) {
    return [...DEFAULT_DYNAMIC_OUTLINE_VIEW_MODES];
  }
  const unique: DynamicOutlineViewMode[] = [];
  for (const item of raw) {
    if (isDynamicOutlineViewMode(item) && !unique.includes(item)) {
      unique.push(item);
    }
  }
  return unique.length > 0 ? unique : [...DEFAULT_DYNAMIC_OUTLINE_VIEW_MODES];
}

export type OpenDocTabItem = {
  tabId: string;
  docId: string;
  title: string;
  iconHtml?: string;
  isPinned: boolean;
  isActive: boolean;
};

export type FilteredOpenDocItem = {
  item: OpenDocTabItem;
  matchRange?: [number, number];
};

export type RecentDocItem = {
  docId: string;
  title: string;
  iconHtml?: string;
  viewedAt?: number;
  closedAt?: number;
  openAt?: number;
};

export type FilteredRecentDocItem = {
  item: RecentDocItem;
  matchRange?: [number, number];
};

export type DynamicOutlineConfig = {
  enabled: boolean;
  followKeyInfo: boolean;
  quickSwitchEnabled?: boolean;
  position: DynamicOutlinePosition;
  viewModes: DynamicOutlineViewMode[];
  openDocsExpanded?: boolean;
  recentDocsExpanded?: boolean;
};

export const DEFAULT_DYNAMIC_OUTLINE_CONFIG: DynamicOutlineConfig = {
  enabled: false,
  followKeyInfo: false,
  quickSwitchEnabled: false,
  position: "right",
  viewModes: [...DEFAULT_DYNAMIC_OUTLINE_VIEW_MODES],
  openDocsExpanded: true,
  recentDocsExpanded: false
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

  const threshold = scrollRatio + 0.05;
  let lo = 0;
  let hi = items.length - 1;
  let activeIdx = 0;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (items[mid].posRatio <= threshold) {
      activeIdx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return activeIdx;
}

/** 计算包含子标题或下属关键内容的标题 ID 集合 */
export function computeOutlineExpandableIds(items: DynamicOutlineItem[]): Set<string> {
  const expandable = new Set<string>();
  if (!items || items.length === 0) {
    return expandable;
  }
  for (let i = 0; i < items.length; i++) {
    const current = items[i];
    if (current.level <= 0) {
      continue;
    }
    const next = items[i + 1];
    if (!next) {
      continue;
    }
    // 紧接其后的是更深层级标题或关键内容 (level === 0) 时，当前标题可折叠
    if (next.level === 0 || next.level > current.level) {
      expandable.add(current.id);
    }
  }
  return expandable;
}

/** 根据已折叠的标题 ID 集合过滤出当前可见的大纲条目 */
export function filterCollapsedOutlineItems(
  items: DynamicOutlineItem[],
  collapsedIds: ReadonlySet<string>,
  precomputedExpandableIds?: ReadonlySet<string>
): DynamicOutlineItem[] {
  if (!items || items.length === 0) {
    return [];
  }
  if (!collapsedIds || collapsedIds.size === 0) {
    return [...items];
  }
  const expandableIds = precomputedExpandableIds || computeOutlineExpandableIds(items);
  const visible: DynamicOutlineItem[] = [];
  let collapsedLevel: number | null = null;

  for (const item of items) {
    if (collapsedLevel !== null) {
      if (item.level > 0 && item.level <= collapsedLevel) {
        collapsedLevel = null;
      } else {
        continue;
      }
    }
    visible.push(item);
    if (item.level > 0 && expandableIds.has(item.id) && collapsedIds.has(item.id)) {
      collapsedLevel = item.level;
    }
  }

  return visible;
}

export type SampledMinimapTick = {
  item: DynamicOutlineItem;
  topPx: number;
  representedIds: string[];
};

const MINIMAP_SAMPLE_THRESHOLD = 120;

export function sampleMinimapTicks(
  items: DynamicOutlineItem[],
  trackHeight: number,
  bucketPx = 3
): SampledMinimapTick[] {
  if (!items || items.length === 0) {
    return [];
  }
  const usableSpan = Math.max(1, trackHeight - 6);
  if (items.length <= MINIMAP_SAMPLE_THRESHOLD) {
    return items.map((item) => ({
      item,
      topPx: Math.round(item.posRatio * usableSpan) + 3,
      representedIds: [item.id]
    }));
  }

  const safeBucketPx = Math.max(1, bucketPx);
  const rankLevel = (level: number) => (level > 0 ? level : 7);
  const buckets = new Map<number, SampledMinimapTick>();

  for (const item of items) {
    const topPx = Math.round(item.posRatio * usableSpan) + 3;
    const bucketKey = Math.floor(topPx / safeBucketPx);
    const existing = buckets.get(bucketKey);
    if (!existing) {
      buckets.set(bucketKey, {
        item,
        topPx,
        representedIds: [item.id]
      });
    } else {
      existing.representedIds.push(item.id);
      if (rankLevel(item.level) < rankLevel(existing.item.level)) {
        existing.item = item;
        existing.topPx = topPx;
      }
    }
  }

  return Array.from(buckets.values());
}

export type VirtualOutlineWindow = {
  startIndex: number;
  endIndex: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
};

export function computeVirtualOutlineWindow(options: {
  totalCount: number;
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  overscan?: number;
}): VirtualOutlineWindow {
  const { totalCount, scrollTop, viewportHeight, rowHeight, overscan = 12 } = options;
  if (totalCount <= 0 || rowHeight <= 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0
    };
  }
  const safeScrollTop = Math.max(0, scrollTop);
  const safeViewportHeight = Math.max(rowHeight, viewportHeight);
  const visibleStart = Math.max(0, Math.floor(safeScrollTop / rowHeight));
  const visibleCount = Math.max(1, Math.ceil(safeViewportHeight / rowHeight));
  const startIndex = Math.max(0, visibleStart - overscan);
  const endIndex = Math.min(totalCount, visibleStart + visibleCount + overscan);
  const topSpacerHeight = startIndex * rowHeight;
  const bottomSpacerHeight = Math.max(0, (totalCount - endIndex) * rowHeight);

  return {
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight
  };
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

function filterDocItemsByTitle<T extends { title: string }>(
  items: T[],
  query: string
): Array<{ item: T; matchRange?: [number, number] }> {
  if (!items || items.length === 0) {
    return [];
  }

  const trimmed = (query || "").trim();
  if (!trimmed) {
    return items.map((item) => ({ item }));
  }

  const result: Array<{ item: T; matchRange?: [number, number] }> = [];
  items.forEach((item) => {
    const matchRange = PinyinMatch.match(item.title || "", trimmed);
    if (matchRange) {
      result.push({ item, matchRange });
    }
  });
  return result;
}

export function filterOpenDocItems(
  items: OpenDocTabItem[],
  query: string
): FilteredOpenDocItem[] {
  return filterDocItemsByTitle(items, query);
}

export function filterRecentDocItems(
  items: RecentDocItem[],
  query: string
): FilteredRecentDocItem[] {
  return filterDocItemsByTitle(items, query);
}

export function deduplicateRecentDocs(
  recentDocs: RecentDocItem[],
  openDocs: OpenDocTabItem[]
): RecentDocItem[] {
  if (!recentDocs || recentDocs.length === 0) {
    return [];
  }
  const openDocIds = new Set(openDocs.map((doc) => doc.docId).filter(Boolean));
  const seenRecentIds = new Set<string>();
  const result: RecentDocItem[] = [];
  for (const doc of recentDocs) {
    if (!doc.docId || openDocIds.has(doc.docId) || seenRecentIds.has(doc.docId)) {
      continue;
    }
    seenRecentIds.add(doc.docId);
    result.push(doc);
  }
  return result;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const DEFAULT_DOC_ICON_SVG = '<svg><use xlink:href="#iconFile"></use></svg>';

/** 将思源文档 icon 字段转换为可用于面板渲染的 HTML 片段 */
export function formatDocIconHtml(icon?: string): string {
  const raw = (icon || "").trim();
  if (!raw) {
    return DEFAULT_DOC_ICON_SVG;
  }

  if (raw.startsWith("api/icon/getDynamicIcon") || /^https?:\/\//i.test(raw)) {
    const normalized = raw.replace(/&amp;/g, "&");
    const networkAttr = /^https?:\/\//i.test(normalized) ? ' referrerpolicy="no-referrer"' : "";
    return `<img src="${escapeHtmlAttr(normalized)}"${networkAttr}/>`;
  }

  if (raw.includes(".") || raw.includes("/")) {
    return `<img src="/emojis/${escapeHtmlAttr(raw)}"/>`;
  }

  try {
    let emoji = "";
    for (const part of raw.split("-")) {
      const code = Number.parseInt(part, 16);
      if (Number.isNaN(code) || code <= 0) {
        return DEFAULT_DOC_ICON_SVG;
      }
      emoji += String.fromCodePoint(code);
    }
    return emoji || DEFAULT_DOC_ICON_SVG;
  } catch {
    return DEFAULT_DOC_ICON_SVG;
  }
}
