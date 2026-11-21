import {
  buildDynamicOutlineItems,
  DynamicOutlineConfig,
  DynamicOutlineItem,
  DynamicOutlinePosition,
  findActiveOutlineItemIndex
} from "@/core/dynamic-outline-core";
import { KeyInfoFilter, KeyInfoItem } from "@/core/key-info-core";
import { ProtyleLike } from "@/plugin/doc-context";
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
  navigateBlock: (blockId: string, protyle?: ProtyleLike) => void;
  getConfig: () => DynamicOutlineConfig;
  setPosition?: (position: DynamicOutlinePosition) => Promise<void> | void;
};

export class DynamicOutlineController {
  private view?: DynamicOutlineViewHandle;
  private currentProtyleElement?: HTMLElement;
  private scrollContainer?: HTMLElement;
  private additionalScrollContainer?: HTMLElement;
  private onScrollHandler?: () => void;
  private onInputHandler?: () => void;
  private currentItems: DynamicOutlineItem[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshRequestId = 0;

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

    if (this.currentProtyleElement === protyleElement && this.view) {
      void this.refreshData(targetProtyle);
      return;
    }

    this.mount(protyleElement, targetProtyle);
  }

  public notifyDocEdited() {
    const config = this.deps.getConfig();
    if (!config.enabled || this.deps.isMobile() || !this.view) {
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

  public refresh() {
    const config = this.deps.getConfig();
    if (!config.enabled || this.deps.isMobile()) {
      this.destroy();
      return;
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

    this.currentProtyleElement = protyleElement;
    const config = this.deps.getConfig();
    this.view = createDynamicOutlineView(mountContainer, {
      position: config.position,
      onItemClick: (item) => {
        const activeProtyle = protyle || this.deps.getCurrentProtyle();
        this.deps.navigateBlock(item.blockId, activeProtyle);
      },
      onTogglePosition: (nextPos) => {
        void this.deps.setPosition?.(nextPos);
      }
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

    this.onInputHandler = () => {
      this.notifyDocEdited();
    };
    protyleElement.addEventListener("input", this.onInputHandler, { passive: true });

    void this.refreshData(protyle);
  }

  private handleScroll() {
    if (!this.view || !this.scrollContainer) {
      return;
    }

    let target = this.scrollContainer;
    if (this.additionalScrollContainer && this.additionalScrollContainer.scrollTop > 0) {
      target = this.additionalScrollContainer;
    }

    const { scrollTop, scrollHeight, clientHeight } = target;
    this.view.setScroll(scrollTop, scrollHeight, clientHeight);

    if (this.currentItems.length > 0) {
      const maxScroll = scrollHeight - clientHeight;
      const scrollRatio = maxScroll > 0 ? scrollTop / maxScroll : 0;
      const activeIdx = findActiveOutlineItemIndex(this.currentItems, scrollRatio);
      this.view.setActiveIndex(activeIdx);
    }
  }

  public async refreshData(protyle?: ProtyleLike) {
    if (!this.view) {
      return;
    }

    const docId = this.deps.getCurrentDocId();
    if (!docId) {
      this.currentItems = [];
      this.view.setItems([], "文档大纲");
      return;
    }

    const requestId = ++this.refreshRequestId;
    const config = this.deps.getConfig();

    try {
      const result = await this.deps.fetchDocKeyInfo(docId, protyle);
      if (requestId !== this.refreshRequestId || !this.view) {
        return;
      }

      const activeFilter = this.deps.getKeyInfoFilter?.();
      const outlineItems = buildDynamicOutlineItems(result.items || [], {
        followKeyInfo: config.followKeyInfo,
        activeFilter
      });

      this.currentItems = outlineItems;

      let modeLabel = "文档大纲";
      if (config.followKeyInfo) {
        if (activeFilter && activeFilter.length === 1) {
          const typeMap: Record<string, string> = {
            title: "标题",
            bold: "加粗",
            highlight: "高亮",
            remark: "备注",
            italic: "斜体",
            underline: "下划",
            code: "代码",
            tag: "标签",
            link: "链接",
            ref: "引用"
          };
          modeLabel = `关键内容 · ${typeMap[activeFilter[0]] || activeFilter[0]}`;
        } else {
          modeLabel = "关键内容 · 全部";
        }
      }

      const colors = resolveCurrentHeadingColors();
      this.view.setHeadingColors(colors);
      this.view.setPosition(config.position);
      this.view.setItems(outlineItems, modeLabel);
      this.handleScroll();
    } catch (error) {
      console.warn("[doc-assist] refresh dynamic outline failed:", error);
    }
  }

  public destroy() {
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
    this.currentProtyleElement = undefined;
    this.scrollContainer = undefined;
    this.additionalScrollContainer = undefined;
    this.onScrollHandler = undefined;
    this.onInputHandler = undefined;
    this.currentItems = [];
  }
}
