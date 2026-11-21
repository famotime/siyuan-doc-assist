import {
  calculateViewportIndicator,
  DynamicOutlineItem,
  DynamicOutlinePosition
} from "@/core/dynamic-outline-core";
import { resolveKeyInfoTypeLabel } from "@/core/key-info-core";
import { HeadingLevel } from "@/core/key-info-heading-color-core";
import { applyHeadingColorsToElement } from "@/services/key-info-heading-color";

const LUCIDE_PIN_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>';

const LUCIDE_PIN_ACTIVE_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>';

const LUCIDE_SWITCH_SIDE_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7 3 12l5 5"></path><path d="M3 12h18"></path><path d="m16 17 5-5-5-5"></path></svg>';

const LUCIDE_ARROW_UP_TO_LINE_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"></path><path d="M6 5h12"></path></svg>';

const LUCIDE_ARROW_DOWN_TO_LINE_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path><path d="M6 19h12"></path></svg>';

export type DynamicOutlineViewOptions = {
  position?: DynamicOutlinePosition;
  isZh?: boolean;
  onItemClick: (item: DynamicOutlineItem) => void;
  onPinChange?: (pinned: boolean) => void;
  onTogglePosition?: (nextPosition: DynamicOutlinePosition) => void;
  onJumpToTop?: () => void;
  onJumpToBottom?: () => void;
};

export type DynamicOutlineViewHandle = {
  setItems: (items: DynamicOutlineItem[], modeLabel?: string) => void;
  setScroll: (
    scrollTop: number,
    scrollHeight: number,
    clientHeight: number,
    overrideProgressRatio?: number
  ) => void;
  setActiveIndex: (index: number) => void;
  setPosition: (position: DynamicOutlinePosition) => void;
  setHeadingColors: (colors: Record<HeadingLevel, string>) => void;
  destroy: () => void;
  element: HTMLElement;
};

export function createDynamicOutlineView(
  parent: HTMLElement,
  options: DynamicOutlineViewOptions
): DynamicOutlineViewHandle {
  let currentPosition: DynamicOutlinePosition = options.position || "right";

  const container = document.createElement("div");
  container.className = `doc-assistant-dynamic-outline is-${currentPosition}`;

  const minimap = document.createElement("div");
  minimap.className = "doc-assistant-dynamic-outline__minimap";
  container.appendChild(minimap);

  const viewportIndicator = document.createElement("div");
  viewportIndicator.className = "doc-assistant-dynamic-outline__viewport";
  minimap.appendChild(viewportIndicator);

  const flyout = document.createElement("div");
  flyout.className = "doc-assistant-dynamic-outline__flyout";
  container.appendChild(flyout);

  const header = document.createElement("div");
  header.className = "doc-assistant-dynamic-outline__header";
  flyout.appendChild(header);

  const titleWrap = document.createElement("div");
  titleWrap.className = "doc-assistant-dynamic-outline__title";
  header.appendChild(titleWrap);

  const titleText = document.createElement("span");
  titleText.textContent = "文档大纲";
  titleWrap.appendChild(titleText);

  const countBadge = document.createElement("span");
  countBadge.className = "doc-assistant-dynamic-outline__count";
  countBadge.textContent = "0";
  titleWrap.appendChild(countBadge);

  const isZh = options.isZh !== undefined ? options.isZh : true;

  const actionsWrap = document.createElement("div");
  actionsWrap.className = "doc-assistant-dynamic-outline__header-actions";
  header.appendChild(actionsWrap);

  const toTopBtn = document.createElement("button");
  toTopBtn.className = "doc-assistant-dynamic-outline__btn doc-assistant-dynamic-outline__top-btn";
  toTopBtn.setAttribute("type", "button");
  toTopBtn.setAttribute("title", isZh ? "跳转到文档开头" : "Jump to top");
  toTopBtn.innerHTML = LUCIDE_ARROW_UP_TO_LINE_SVG;
  actionsWrap.appendChild(toTopBtn);

  const toBottomBtn = document.createElement("button");
  toBottomBtn.className = "doc-assistant-dynamic-outline__btn doc-assistant-dynamic-outline__bottom-btn";
  toBottomBtn.setAttribute("type", "button");
  toBottomBtn.setAttribute("title", isZh ? "跳转到文档结尾" : "Jump to bottom");
  toBottomBtn.innerHTML = LUCIDE_ARROW_DOWN_TO_LINE_SVG;
  actionsWrap.appendChild(toBottomBtn);

  const switchSideBtn = document.createElement("button");
  switchSideBtn.className = "doc-assistant-dynamic-outline__btn doc-assistant-dynamic-outline__switch-btn";
  switchSideBtn.setAttribute("type", "button");
  switchSideBtn.setAttribute("title", currentPosition === "left" ? "停靠在右侧" : "停靠在左侧");
  switchSideBtn.innerHTML = LUCIDE_SWITCH_SIDE_SVG;
  actionsWrap.appendChild(switchSideBtn);

  const pinBtn = document.createElement("button");
  pinBtn.className = "doc-assistant-dynamic-outline__btn doc-assistant-dynamic-outline__pin-btn";
  pinBtn.setAttribute("type", "button");
  pinBtn.setAttribute("title", "固定大纲");
  pinBtn.innerHTML = LUCIDE_PIN_SVG;
  actionsWrap.appendChild(pinBtn);

  const list = document.createElement("div");
  list.className = "doc-assistant-dynamic-outline__list";
  flyout.appendChild(list);

  let currentItems: DynamicOutlineItem[] = [];
  let isPinned = false;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let activeIndex = -1;
  const itemElements: HTMLElement[] = [];

  const updatePositionClass = (pos: DynamicOutlinePosition) => {
    currentPosition = pos;
    container.classList.remove("is-left", "is-right");
    container.classList.add(`is-${pos}`);
    switchSideBtn.setAttribute("title", pos === "left" ? "停靠在右侧" : "停靠在左侧");
  };

  const openFlyout = () => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    flyout.classList.add("is-open");
  };

  const closeFlyoutLater = () => {
    if (isPinned) {
      return;
    }
    if (closeTimer) {
      clearTimeout(closeTimer);
    }
    closeTimer = setTimeout(() => {
      flyout.classList.remove("is-open");
      closeTimer = null;
    }, 300);
  };

  container.addEventListener("mouseenter", openFlyout);
  container.addEventListener("mouseleave", closeFlyoutLater);

  toTopBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    options.onJumpToTop?.();
  });

  toBottomBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    options.onJumpToBottom?.();
  });

  pinBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    isPinned = !isPinned;
    if (isPinned) {
      pinBtn.classList.add("is-pinned");
      pinBtn.setAttribute("title", "取消固定");
      pinBtn.innerHTML = LUCIDE_PIN_ACTIVE_SVG;
      openFlyout();
    } else {
      pinBtn.classList.remove("is-pinned");
      pinBtn.setAttribute("title", "固定大纲");
      pinBtn.innerHTML = LUCIDE_PIN_SVG;
      closeFlyoutLater();
    }
    options.onPinChange?.(isPinned);
  });

  switchSideBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const nextPos: DynamicOutlinePosition = currentPosition === "left" ? "right" : "left";
    updatePositionClass(nextPos);
    options.onTogglePosition?.(nextPos);
  });

  parent.appendChild(container);

  const renderMinimapTicks = () => {
    const ticks = minimap.querySelectorAll(".doc-assistant-dynamic-outline__tick");
    ticks.forEach((tick) => tick.remove());

    const trackHeight = minimap.clientHeight || 260;
    currentItems.forEach((item) => {
      const tick = document.createElement("div");
      tick.className = "doc-assistant-dynamic-outline__tick";
      tick.setAttribute("data-level", String(item.level));
      const topPx = Math.round(item.posRatio * (trackHeight - 6)) + 3;
      tick.style.top = `${topPx}px`;
      minimap.appendChild(tick);
    });
  };

  const renderList = (modeLabel?: string) => {
    list.innerHTML = "";
    itemElements.length = 0;

    titleText.textContent = modeLabel || "文档大纲";
    countBadge.textContent = String(currentItems.length);

    if (currentItems.length === 0) {
      const empty = document.createElement("div");
      empty.className = "doc-assistant-dynamic-outline__empty";
      empty.textContent = "暂无大纲内容";
      list.appendChild(empty);
      return;
    }

    currentItems.forEach((item) => {
      const row = document.createElement("div");
      row.className = "doc-assistant-dynamic-outline__item";
      row.setAttribute("data-level", String(item.level));
      row.setAttribute("data-block-id", item.blockId);

      if (item.level === 0 && item.type !== "title") {
        const badge = document.createElement("span");
        badge.className = "doc-assistant-dynamic-outline__item-badge";
        badge.setAttribute("data-type", item.type);
        badge.textContent = resolveKeyInfoTypeLabel(item.type, options.isZh);
        row.appendChild(badge);
      }

      const textSpan = document.createElement("span");
      textSpan.className = "doc-assistant-dynamic-outline__item-text";
      textSpan.setAttribute("data-level", String(item.level));
      textSpan.textContent = item.text || "(空)";
      textSpan.setAttribute("title", item.text);
      row.appendChild(textSpan);

      row.addEventListener("click", () => {
        options.onItemClick(item);
        if (!isPinned) {
          flyout.classList.remove("is-open");
        }
      });

      list.appendChild(row);
      itemElements.push(row);
    });
  };

  const setItems = (items: DynamicOutlineItem[], modeLabel?: string) => {
    currentItems = items;
    renderMinimapTicks();
    renderList(modeLabel);
  };

  const setScroll = (
    scrollTop: number,
    scrollHeight: number,
    clientHeight: number,
    overrideProgressRatio?: number
  ) => {
    const trackHeight = minimap.clientHeight || 260;
    const { top, height } = calculateViewportIndicator(
      scrollTop,
      scrollHeight,
      clientHeight,
      trackHeight,
      overrideProgressRatio
    );
    viewportIndicator.style.top = `${top}px`;
    viewportIndicator.style.height = `${height}px`;
  };

  const setActiveIndex = (index: number) => {
    if (activeIndex === index) {
      return;
    }
    if (activeIndex >= 0 && itemElements[activeIndex]) {
      itemElements[activeIndex].classList.remove("is-active");
    }
    activeIndex = index;
    if (activeIndex >= 0 && itemElements[activeIndex]) {
      itemElements[activeIndex].classList.add("is-active");
    }
  };

  const setPosition = (position: DynamicOutlinePosition) => {
    updatePositionClass(position);
  };

  const setHeadingColors = (colors: Record<HeadingLevel, string>) => {
    applyHeadingColorsToElement(container, colors);
  };

  const destroy = () => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    container.remove();
  };

  return {
    setItems,
    setScroll,
    setActiveIndex,
    setPosition,
    setHeadingColors,
    destroy,
    element: container
  };
}
