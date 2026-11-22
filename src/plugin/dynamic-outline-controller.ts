import { ClipboardHistoryItem } from "@/core/clipboard-core";
import { createGenerationGuard } from "@/core/generation-guard-core";
import {
  buildDynamicOutlineItems,
  DynamicOutlineConfig,
  DynamicOutlineItem,
  DynamicOutlinePosition,
  DynamicOutlineViewMode,
  estimateGlobalDocumentProgress,
  findActiveOutlineItemIndex,
  normalizeDynamicOutlineViewModes,
  OpenDocTabItem,
  ProgressAnchor,
  RecentDocItem
} from "@/core/dynamic-outline-core";
import { KeyInfoFilter, KeyInfoItem, resolveKeyInfoTypeLabel } from "@/core/key-info-core";
import { ProtyleLike } from "@/plugin/doc-context";
import { OpenDocTabRef } from "@/services/doc-navigation";
import { resolveCurrentHeadingColors } from "@/services/key-info-heading-color";
import {
  createDynamicOutlineView,
  DynamicOutlineViewHandle
} from "@/ui/dynamic-outline/dynamic-outline-view";

export type DynamicOutlineControllerDeps = {
  isMobile: () => boolean;
  getCurrentProtyle: () => ProtyleLike | undefined;
  getCurrentDocId: () => string;
  getKeyInfoFilter?: () => KeyInfoFilter | undefined;
  fetchDocKeyInfo: (docId: string, protyle?: unknown) => Promise<{ items: KeyInfoItem[] }>;
  fetchDocOutline?: (docId: string, protyle?: unknown) => Promise<{ items: KeyInfoItem[] }>;
  navigateBlock: (blockId: string, protyle?: ProtyleLike) => void;
  getOpenDocTabs?: (protyle?: ProtyleLike) => OpenDocTabRef[];
  activateOpenDocTab?: (item: OpenDocTabRef) => Promise<unknown> | void;
  closeOpenDocTab?: (item: OpenDocTabRef) => boolean | Promise<boolean> | void;
  getRecentDocs?: () => Promise<RecentDocItem[]>;
  openRecentDoc?: (item: RecentDocItem) => Promise<unknown> | void;
  setDocSectionsExpanded?: (sections: {
    openDocsExpanded: boolean;
    recentDocsExpanded: boolean;
  }) => Promise<void> | void;
  getConfig: () => DynamicOutlineConfig;
  setPosition?: (position: DynamicOutlinePosition) => Promise<void> | void;
  onFloatSelectedText?: (protyle?: ProtyleLike) => void;
  getClipboardItems?: () => ClipboardHistoryItem[];
  ensureClipboardLoaded?: () => Promise<ClipboardHistoryItem[]>;
  onClipboardCopy?: (item: ClipboardHistoryItem) => Promise<{ ok: boolean; reason?: string }>;
  onClipboardCopyMerged?: (ids: string[]) => Promise<{ ok: boolean; reason?: string; skippedImageCount?: number }>;
  onClipboardAggregate?: (ids: string[]) => Promise<{
    ok: boolean;
    items?: ClipboardHistoryItem[];
    reason?: string;
    skippedImageCount?: number;
  }>;
  onClipboardToggleFavorite?: (id: string) => Promise<ClipboardHistoryItem[]>;
  onClipboardDelete?: (id: string) => Promise<ClipboardHistoryItem[]>;
  onClipboardDeleteBatch?: (ids: string[]) => Promise<ClipboardHistoryItem[]>;
  onClipboardClearNonFavorites?: () => Promise<ClipboardHistoryItem[]>;
  onClipboardOpenFileLocation?: (filePath: string) => Promise<{ ok: boolean; reason?: string }>;
  resolveClipboardImageUrl?: (imageFileName?: string) => string | null;
};

export class DynamicOutlineController {
  private view?: DynamicOutlineViewHandle;
  private activeProtyle?: ProtyleLike;
  private currentProtyleElement?: HTMLElement;
  private scrollContainer?: HTMLElement;
  private additionalScrollContainer?: HTMLElement;
  private onScrollHandler?: () => void;
  private onInputHandler?: (event: Event) => void;
  private currentItems: DynamicOutlineItem[] = [];
  private posRatioByBlockId = new Map<string, number>();
  private allItemsAreHeadings = true;
  private scrollRafId: number | null = null;
  private currentOpenDocRefs: OpenDocTabRef[] = [];
  private viewMode: DynamicOutlineViewMode = "outline";
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly refreshGuard = createGenerationGuard();
  private readonly recentDocsGuard = createGenerationGuard();
  private readonly clipboardGuard = createGenerationGuard();
  private lastDocId = "";

  constructor(private readonly deps: DynamicOutlineControllerDeps) {}

  public syncActiveEditor(protyle?: ProtyleLike) {
    if (this.deps.isMobile()) {
      this.destroy();
      return;
    }

    const config = this.deps.getConfig();
    if (!config.enabled) {
      this.destroy();
      return;
    }

    const targetProtyle = protyle || this.deps.getCurrentProtyle();
    const protyleElement = (targetProtyle as any)?.element as HTMLElement | undefined;
    if (!protyleElement) {
      this.destroy();
      return;
    }

    this.activeProtyle = targetProtyle;
    if (this.currentProtyleElement === protyleElement && this.view) {
      void this.refreshData(targetProtyle);
      return;
    }

    this.mount(protyleElement, targetProtyle);
  }

  public notifyDocEdited(event?: Event) {
    const config = this.deps.getConfig();
    if (!config.enabled || this.deps.isMobile() || !this.view) {
      return;
    }
    if (!this.shouldRefreshOutlineOnInput(event, config.followKeyInfo)) {
      return;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.refreshData();
    }, 1500);
  }

  private shouldRefreshOutlineOnInput(event: Event | undefined, followKeyInfo: boolean): boolean {
    if (followKeyInfo || !event) {
      return true;
    }
    const inputType = typeof (event as InputEvent).inputType === "string" ?
        (event as InputEvent).inputType :
      "";
    const isPlainTextTyping =
      inputType === "insertText" ||
      inputType === "insertCompositionText" ||
      inputType === "insertReplacementText";
    if (!isPlainTextTyping) {
      return true;
    }

    const rawTarget = event.target as Node | null;
    const anchorNode =
      rawTarget ||
      (typeof document !== "undefined" ? document.getSelection?.()?.anchorNode ?? null : null);
    let targetEl: HTMLElement | null = null;
    if (anchorNode) {
      targetEl = anchorNode.nodeType === 1 ? (anchorNode as HTMLElement) : anchorNode.parentElement;
    }
    const blockEl = targetEl?.closest?.("[data-node-id]") as HTMLElement | null;
    if (!blockEl) {
      return true;
    }
    if (blockEl.getAttribute("data-type") === "NodeHeading") {
      return true;
    }
    const blockText = (blockEl.textContent || "").trimStart();
    return blockText.startsWith("#");
  }

  public notifyClipboardChanged(items: ClipboardHistoryItem[]) {
    this.view?.setClipboardItems(items);
  }

  public refresh() {
    const config = this.deps.getConfig();
    if (!config.enabled || this.deps.isMobile()) {
      this.destroy();
      return;
    }
    const allowedModes = normalizeDynamicOutlineViewModes(config.viewModes);
    if (!allowedModes.includes(this.viewMode)) {
      this.viewMode = allowedModes[0];
    }
    if (this.view) {
      this.view.setAvailableViewModes(allowedModes);
      this.view.setQuickSwitchEnabled(Boolean(config.quickSwitchEnabled));
      if (this.view.getViewMode() !== this.viewMode) {
        this.view.setViewMode(this.viewMode);
      }
    }
    this.syncActiveEditor();
  }

  private mount(protyleElement: HTMLElement, protyle?: ProtyleLike) {
    this.destroy();

    // 挂载点必须为最外层 protyleElement（静止视口层），避免挂在可滚动的 .protyle-content 内部导致随正文滚动被滚走
    const mountContainer = protyleElement;

    const computedPos = window.getComputedStyle(mountContainer).position;
    if (computedPos === "static") {
      mountContainer.style.position = "relative";
    }

    this.activeProtyle = protyle || this.activeProtyle || this.deps.getCurrentProtyle();
    this.currentProtyleElement = protyleElement;
    const config = this.deps.getConfig();
    const allowedModes = normalizeDynamicOutlineViewModes(config.viewModes);
    if (!allowedModes.includes(this.viewMode)) {
      this.viewMode = allowedModes[0];
    }
    this.view = createDynamicOutlineView(mountContainer, {
      position: config.position,
      initialViewMode: this.viewMode,
      availableViewModes: allowedModes,
      quickSwitchEnabled: Boolean(config.quickSwitchEnabled),
      initialOpenDocsExpanded: config.openDocsExpanded ?? true,
      initialRecentDocsExpanded: config.recentDocsExpanded ?? false,
      onItemClick: (item) => {
        const activeProtyle = this.activeProtyle || this.deps.getCurrentProtyle();
        this.deps.navigateBlock(item.blockId, activeProtyle);
      },
      onOpenDocClick: (docItem: OpenDocTabItem) => {
        const matchedRef =
          this.currentOpenDocRefs.find(
            (ref) => ref.tabId === docItem.tabId && ref.docId === docItem.docId
          ) || docItem;
        void this.deps.activateOpenDocTab?.(matchedRef);
      },
      onOpenDocClose: (docItem: OpenDocTabItem) => {
        const matchedRef =
          this.currentOpenDocRefs.find(
            (ref) => ref.tabId === docItem.tabId && ref.docId === docItem.docId
          ) || docItem;
        void Promise.resolve(this.deps.closeOpenDocTab?.(matchedRef)).then(() => {
          this.refreshOpenDocs(this.activeProtyle || this.deps.getCurrentProtyle());
        });
      },
      onRecentDocClick: (docItem: RecentDocItem) => {
        void this.deps.openRecentDoc?.(docItem);
      },
      onDocSectionsChange: (sections) => {
        void this.deps.setDocSectionsExpanded?.(sections);
      },
      onViewModeChange: (mode) => {
        this.viewMode = mode;
        if (mode === "open-docs") {
          this.refreshOpenDocs(this.activeProtyle || this.deps.getCurrentProtyle());
        } else if (mode === "clipboard") {
          void this.refreshClipboard();
        }
      },
      onFlyoutOpen: () => {
        if (this.viewMode === "open-docs") {
          this.refreshOpenDocs(this.activeProtyle || this.deps.getCurrentProtyle());
        } else if (this.viewMode === "clipboard") {
          void this.refreshClipboard();
        }
      },
      onTogglePosition: (nextPos) => {
        void this.deps.setPosition?.(nextPos);
      },
      onJumpToTop: () => {
        this.jumpToTop(this.activeProtyle);
      },
      onJumpToBottom: () => {
        this.jumpToBottom(this.activeProtyle);
      },
      onFloatSelectedText: () => {
        this.deps.onFloatSelectedText?.(this.activeProtyle || this.deps.getCurrentProtyle());
      },
      onClipboardCopy: async (item) => {
        return (await this.deps.onClipboardCopy?.(item)) || { ok: false, reason: "剪贴板服务不可用" };
      },
      onClipboardCopyMerged: async (ids) => {
        return (await this.deps.onClipboardCopyMerged?.(ids)) || { ok: false, reason: "剪贴板服务不可用" };
      },
      onClipboardAggregate: async (ids) => {
        const res = await this.deps.onClipboardAggregate?.(ids);
        if (res?.ok && res.items) {
          this.view?.setClipboardItems(res.items);
        }
        return res || { ok: false, reason: "剪贴板服务不可用" };
      },
      onClipboardToggleFavorite: async (id) => {
        const next = await this.deps.onClipboardToggleFavorite?.(id);
        if (next) {
          this.view?.setClipboardItems(next);
        }
      },
      onClipboardDelete: async (id) => {
        const next = await this.deps.onClipboardDelete?.(id);
        if (next) {
          this.view?.setClipboardItems(next);
        }
      },
      onClipboardDeleteBatch: async (ids) => {
        const next = await this.deps.onClipboardDeleteBatch?.(ids);
        if (next) {
          this.view?.setClipboardItems(next);
        }
      },
      onClipboardClearNonFavorites: async () => {
        const next = await this.deps.onClipboardClearNonFavorites?.();
        if (next) {
          this.view?.setClipboardItems(next);
        }
      },
      onClipboardOpenFileLocation: async (filePath) => {
        return (await this.deps.onClipboardOpenFileLocation?.(filePath)) || {
          ok: false,
          reason: "剪贴板服务不可用"
        };
      },
      resolveClipboardImageUrl: (fileName) => this.deps.resolveClipboardImageUrl?.(fileName) || null
    });

    // 真正产生滚动并触发 scroll 事件的是 .protyle-content，部分主题或视图可能在 .protyle-wysiwyg
    const contentEl = protyleElement.querySelector(".protyle-content") as HTMLElement | null;
    const wysiwygEl = protyleElement.querySelector(".protyle-wysiwyg") as HTMLElement | null;
    const scrollContainer = contentEl || wysiwygEl || protyleElement;
    this.scrollContainer = scrollContainer;
    this.additionalScrollContainer =
      contentEl && wysiwygEl && contentEl !== wysiwygEl ? wysiwygEl : undefined;

    this.onScrollHandler = () => {
      this.handleScroll();
    };

    scrollContainer.addEventListener("scroll", this.onScrollHandler, { passive: true });
    if (this.additionalScrollContainer) {
      this.additionalScrollContainer.addEventListener("scroll", this.onScrollHandler, { passive: true });
    }

    this.onInputHandler = (event: Event) => {
      this.notifyDocEdited(event);
    };
    protyleElement.addEventListener("input", this.onInputHandler, { passive: true });

    void this.refreshData(protyle);
  }

  private jumpToTop(protyle?: ProtyleLike) {
    const protyleEl = this.currentProtyleElement;
    const upBtn = protyleEl?.querySelector(".protyle-scroll__up") as HTMLElement | null;
    if (upBtn) {
      upBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      return;
    }

    if (this.scrollContainer) {
      if (typeof this.scrollContainer.scrollTo === "function") {
        this.scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        this.scrollContainer.scrollTop = 0;
      }
    }
    const docId = this.deps.getCurrentDocId();
    const activeProtyle = protyle || this.deps.getCurrentProtyle();
    if (this.currentItems.length > 0) {
      this.deps.navigateBlock(this.currentItems[0].blockId, activeProtyle);
    } else if (docId) {
      this.deps.navigateBlock(docId, activeProtyle);
    }
  }

  private jumpToBottom(protyle?: ProtyleLike) {
    const protyleEl = this.currentProtyleElement;
    const downBtn = protyleEl?.querySelector(".protyle-scroll__down") as HTMLElement | null;
    if (downBtn) {
      downBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      return;
    }

    if (this.currentItems.length > 0) {
      const last = this.currentItems[this.currentItems.length - 1];
      const activeProtyle = protyle || this.deps.getCurrentProtyle();
      this.deps.navigateBlock(last.blockId, activeProtyle);
    } else if (this.scrollContainer) {
      if (typeof this.scrollContainer.scrollTo === "function") {
        this.scrollContainer.scrollTo({
          top: this.scrollContainer.scrollHeight,
          behavior: "smooth"
        });
      } else {
        this.scrollContainer.scrollTop = this.scrollContainer.scrollHeight;
      }
    }
  }

  private handleScroll() {
    if (!this.view || !this.scrollContainer) {
      return;
    }
    if (typeof requestAnimationFrame !== "function") {
      this.updateScrollNow();
      return;
    }
    if (this.scrollRafId !== null) {
      return;
    }
    this.scrollRafId = requestAnimationFrame(() => {
      this.scrollRafId = null;
      this.updateScrollNow();
    });
  }

  private cancelPendingScrollRaf() {
    if (this.scrollRafId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.scrollRafId);
    }
    this.scrollRafId = null;
  }

  private updateScrollNow() {
    if (!this.view || !this.scrollContainer) {
      return;
    }

    let target = this.scrollContainer;
    if (this.additionalScrollContainer && this.additionalScrollContainer.scrollTop > 0) {
      target = this.additionalScrollContainer;
    }

    const { scrollTop, scrollHeight, clientHeight } = target;

    let progressRatio: number | undefined;

    if (this.currentItems.length > 0 && this.currentProtyleElement && this.posRatioByBlockId.size > 0) {
      const wysiwygEl = this.currentProtyleElement.querySelector(".protyle-wysiwyg") as HTMLElement | null;
      if (wysiwygEl) {
        const anchors: ProgressAnchor[] = [];
        const containerRect = target.getBoundingClientRect();
        // 只扫描当前 DOM 中已挂载的节点，避免长文档对数百个未渲染块逐一 querySelector
        const selector = this.allItemsAreHeadings ?
          '[data-type="NodeHeading"][data-node-id]' :
          "[data-node-id]";
        const domNodes = wysiwygEl.querySelectorAll(selector);
        for (let i = 0; i < domNodes.length; i += 1) {
          const el = domNodes[i] as HTMLElement;
          const nodeId = el.getAttribute("data-node-id");
          if (!nodeId) {
            continue;
          }
          const posRatio = this.posRatioByBlockId.get(nodeId);
          if (posRatio === undefined) {
            continue;
          }
          const elRect = el.getBoundingClientRect();
          const domTop = elRect.top - containerRect.top + scrollTop;
          anchors.push({ posRatio, domTop });
        }
        if (anchors.length > 0) {
          progressRatio = estimateGlobalDocumentProgress({
            scrollTop,
            scrollHeight,
            clientHeight,
            anchors
          });
        }
      }
    }

    this.view.setScroll(scrollTop, scrollHeight, clientHeight, progressRatio);

    if (this.currentItems.length > 0) {
      const effectiveRatio =
        typeof progressRatio === "number" ?
          progressRatio :
            (scrollHeight - clientHeight > 0 ? scrollTop / (scrollHeight - clientHeight) : 0);
      const activeIdx = findActiveOutlineItemIndex(this.currentItems, effectiveRatio);
      this.view.setActiveIndex(activeIdx);
    }
  }

  public refreshOpenDocs(protyle?: ProtyleLike) {
    if (!this.view) {
      return;
    }
    const targetProtyle = protyle || this.deps.getCurrentProtyle();
    const refs = this.deps.getOpenDocTabs?.(targetProtyle) || [];
    this.currentOpenDocRefs = refs;
    this.view.setOpenDocs(refs);

    if (!this.deps.getRecentDocs) {
      return;
    }
    const requestId = this.recentDocsGuard.begin();
    void this.deps.getRecentDocs().then(
      (recentDocs) => {
        if (!this.recentDocsGuard.isCurrent(requestId) || !this.view) {
          return;
        }
        this.view.setRecentDocs(recentDocs || []);
      },
      (error) => {
        console.warn("[doc-assist] fetch recent docs failed:", error);
      }
    );
  }

  public async refreshClipboard() {
    if (!this.view) {
      return;
    }
    if (this.deps.ensureClipboardLoaded) {
      const requestId = this.clipboardGuard.begin();
      const items = await this.deps.ensureClipboardLoaded();
      if (!this.clipboardGuard.isCurrent(requestId) || !this.view) {
        return;
      }
      this.view.setClipboardItems(items);
      return;
    }
    if (this.deps.getClipboardItems) {
      this.view.setClipboardItems(this.deps.getClipboardItems());
    }
  }

  public async refreshData(protyle?: ProtyleLike) {
    if (!this.view) {
      return;
    }

    const config = this.deps.getConfig();
    const allowedModes = normalizeDynamicOutlineViewModes(config.viewModes);
    const shouldPrefetchBadges = Boolean(config.quickSwitchEnabled);

    if (
      this.viewMode === "open-docs" ||
      (shouldPrefetchBadges && allowedModes.includes("open-docs"))
    ) {
      this.refreshOpenDocs(protyle);
    }
    if (
      this.viewMode === "clipboard" ||
      (shouldPrefetchBadges && allowedModes.includes("clipboard"))
    ) {
      void this.refreshClipboard();
    }

    const docId = this.deps.getCurrentDocId();
    if (!docId) {
      this.currentItems = [];
      this.posRatioByBlockId.clear();
      this.allItemsAreHeadings = true;
      this.lastDocId = "";
      this.view.resetSearch();
      this.view.setItems([], "文档大纲");
      return;
    }

    if (this.lastDocId && this.lastDocId !== docId) {
      this.view.resetSearch();
    }
    this.lastDocId = docId;

    const requestId = this.refreshGuard.begin();

    try {
      const useOutlineFastPath =
        !config.followKeyInfo && typeof this.deps.fetchDocOutline === "function";
      const result = useOutlineFastPath ?
          await this.deps.fetchDocOutline!(docId, protyle) :
          await this.deps.fetchDocKeyInfo(docId, protyle);
      if (!this.refreshGuard.isCurrent(requestId) || !this.view) {
        return;
      }

      const activeFilter = this.deps.getKeyInfoFilter?.();
      const outlineItems = buildDynamicOutlineItems(result.items || [], {
        followKeyInfo: config.followKeyInfo,
        activeFilter
      });

      this.currentItems = outlineItems;
      this.posRatioByBlockId.clear();
      let onlyHeadings = true;
      for (const item of outlineItems) {
        if (item.blockId && !this.posRatioByBlockId.has(item.blockId)) {
          this.posRatioByBlockId.set(item.blockId, item.posRatio);
        }
        if (item.type !== "title") {
          onlyHeadings = false;
        }
      }
      this.allItemsAreHeadings = onlyHeadings;

      let modeLabel = "文档大纲";
      if (config.followKeyInfo) {
        if (activeFilter && activeFilter.length === 1) {
          const typeName = resolveKeyInfoTypeLabel(activeFilter[0]);
          modeLabel = `关键内容 · ${typeName}`;
        } else {
          modeLabel = "关键内容 · 全部";
        }
      }

      const colors = resolveCurrentHeadingColors();
      this.view.setHeadingColors(colors);
      this.view.setPosition(config.position);
      this.view.setItems(outlineItems, modeLabel);
      this.cancelPendingScrollRaf();
      this.updateScrollNow();
    } catch (error) {
      console.warn("[doc-assist] refresh dynamic outline failed:", error);
    }
  }

  public destroy() {
    this.refreshGuard.invalidateAll();
    this.recentDocsGuard.invalidateAll();
    this.clipboardGuard.invalidateAll();
    this.cancelPendingScrollRaf();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.scrollContainer && this.onScrollHandler) {
      this.scrollContainer.removeEventListener("scroll", this.onScrollHandler);
    }

    if (this.additionalScrollContainer && this.onScrollHandler) {
      this.additionalScrollContainer.removeEventListener("scroll", this.onScrollHandler);
    }

    if (this.currentProtyleElement && this.onInputHandler) {
      this.currentProtyleElement.removeEventListener("input", this.onInputHandler);
    }

    this.view?.destroy();
    this.view = undefined;
    this.activeProtyle = undefined;
    this.currentProtyleElement = undefined;
    this.scrollContainer = undefined;
    this.additionalScrollContainer = undefined;
    this.onScrollHandler = undefined;
    this.onInputHandler = undefined;
    this.currentItems = [];
    this.posRatioByBlockId.clear();
    this.allItemsAreHeadings = true;
    this.lastDocId = "";
  }
}
