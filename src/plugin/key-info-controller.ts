import { getActiveEditor, showMessage } from "siyuan";
import { buildDockDocActions } from "@/core/dock-panel-core";
import {
  DocMenuRegistrationState,
  isAllDocMenuRegistrationEnabled,
} from "@/core/doc-menu-registration-core";
import { buildKeyInfoMarkdown, KeyInfoItem } from "@/core/key-info-core";
import { getDocKeyInfo } from "@/services/key-info";
import { createKeyInfoDock, KeyInfoDockHandle } from "@/ui/key-info-dock";
import { ActionConfig, ActionKey, isActionKey } from "@/plugin/actions";
import { ProtyleLike } from "@/plugin/doc-context";
import { resolveKeyInfoItems } from "@/plugin/key-info-state";

type KeyInfoControllerDeps = {
  isMobile: () => boolean;
  getCurrentDocId: () => string;
  getCurrentProtyle: () => ProtyleLike | undefined;
  resolveDocId: (explicitId?: string, protyle?: ProtyleLike) => string;
  runAction: (action: ActionKey, explicitId?: string, protyle?: ProtyleLike) => Promise<void>;
  actions: () => ActionConfig[];
  getDocMenuRegistrationState: () => DocMenuRegistrationState;
  setAllDocMenuRegistration: (enabled: boolean) => Promise<void> | void;
  setSingleDocMenuRegistration: (key: ActionKey, enabled: boolean) => Promise<void> | void;
  setDocActionOrder: (order: ActionKey[]) => Promise<void> | void;
  resetDocActionOrder: () => Promise<void> | void;
};

export class KeyInfoController {
  private keyInfoDock?: KeyInfoDockHandle;
  private keyInfoRequestId = 0;
  private keyInfoJumpId = 0;
  private lastProtocolOpenId = "";
  private lastProtocolOpenAt = 0;
  private keyInfoDocId = "";

  constructor(private readonly deps: KeyInfoControllerDeps) {}

  registerDock(plugin: { addDock: (config: unknown) => void }) {
    plugin.addDock({
      type: "doc-assistant-keyinfo",
      data: {},
      config: {
        title: "文档助手",
        icon: "iconList",
        position: "RightTop",
        size: {
          width: 320,
          height: null,
        },
      },
      init: (dock: { element: HTMLElement }) => {
        this.keyInfoDock = createKeyInfoDock(dock.element, {
          onExport: () => this.exportKeyInfoMarkdown(),
          onRefresh: () => {
            void this.refresh();
          },
          onItemClick: (item) => {
            this.handleKeyInfoItemClick(item);
          },
          onDocActionClick: (actionKey) => {
            if (!isActionKey(actionKey)) {
              return;
            }
            const currentDocId = this.deps.getCurrentDocId();
            const currentProtyle = this.deps.getCurrentProtyle();
            void this.deps.runAction(actionKey, currentDocId, currentProtyle);
          },
          onDocMenuToggleAll: (enabled) => {
            void this.deps.setAllDocMenuRegistration(enabled);
          },
          onDocActionMenuToggle: (actionKey, enabled) => {
            if (!isActionKey(actionKey)) {
              return;
            }
            void this.deps.setSingleDocMenuRegistration(actionKey, enabled);
          },
          onDocActionReorder: (order) => {
            const normalized = order.filter((key): key is ActionKey =>
              isActionKey(key)
            );
            void this.deps.setDocActionOrder(normalized);
          },
          onDocActionOrderReset: () => {
            void this.deps.resetDocActionOrder();
          },
        });
        this.syncDocActions();
        const active = getActiveEditor()?.protyle as ProtyleLike | undefined;
        void this.refresh(undefined, active);
      },
      update: () => {
        void this.refresh();
      },
      destroy: () => {
        this.destroy();
      },
    });
  }

  destroy() {
    this.keyInfoDock?.destroy();
    this.keyInfoDock = undefined;
  }

  syncDocActions() {
    if (!this.keyInfoDock) {
      return;
    }
    const registration = this.deps.getDocMenuRegistrationState();
    this.keyInfoDock.setState({
      docMenuRegisterAll: isAllDocMenuRegistrationEnabled(registration),
      docActions: buildDockDocActions(
        this.deps.actions(),
        this.deps.isMobile(),
        registration
      ),
    });
  }

  async refresh(explicitId?: string, protyle?: ProtyleLike) {
    if (!this.keyInfoDock) {
      return;
    }
    const docId = this.deps.resolveDocId(explicitId, protyle);
    if (!docId) {
      this.keyInfoDock.setState({
        docTitle: "",
        items: [],
        loading: false,
        isRefreshing: false,
        emptyText: "未找到当前文档",
        scrollContextKey: "",
      });
      return;
    }

    const requestId = ++this.keyInfoRequestId;
    const currentState = this.keyInfoDock.getState();
    const isSameDoc = !!this.keyInfoDocId && this.keyInfoDocId === docId;
    const hasItems = currentState.items.length > 0;
    this.keyInfoDock.setState({
      loading: !hasItems || !isSameDoc,
      isRefreshing: true,
      emptyText: !hasItems || !isSameDoc ? "加载中..." : currentState.emptyText,
      scrollContextKey: docId,
    });

    try {
      const activeProtyle = protyle || this.deps.getCurrentProtyle() || (getActiveEditor()?.protyle as ProtyleLike | undefined);
      const data = await getDocKeyInfo(docId, activeProtyle);
      if (requestId !== this.keyInfoRequestId) {
        return;
      }
      this.keyInfoDocId = docId;
      const nextItems = resolveKeyInfoItems({
        isSameDoc,
        hasItems,
        currentItems: currentState.items,
        latestItems: data.items,
      });
      this.keyInfoDock.setState({
        docTitle: data.docTitle || docId,
        items: nextItems,
        loading: false,
        isRefreshing: false,
        emptyText: "暂无关键内容",
        scrollContextKey: docId,
      });
    } catch (error: unknown) {
      if (requestId !== this.keyInfoRequestId) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      showMessage(`加载关键内容失败：${message}`, 7000, "error");
      const keepItems = isSameDoc && hasItems;
      this.keyInfoDock.setState({
        loading: false,
        isRefreshing: false,
        emptyText: "加载失败",
        scrollContextKey: docId,
        ...(keepItems
          ? {}
          : {
              docTitle: "",
              items: [],
            }),
      });
    }
  }

  private openBlockByProtocol(blockId: string) {
    const url = `siyuan://blocks/${blockId}`;
    try {
      window.open(url);
    } catch {
      window.location.href = url;
    }
  }

  private openBlockByProtocolThrottled(blockId: string) {
    const now = performance.now();
    if (this.lastProtocolOpenId === blockId && now - this.lastProtocolOpenAt < 800) {
      return;
    }
    this.lastProtocolOpenId = blockId;
    this.lastProtocolOpenAt = now;
    this.openBlockByProtocol(blockId);
  }

  private flashBlockElement(target: HTMLElement) {
    const flashClass = "doc-assistant-keyinfo__flash";
    target.classList.remove(flashClass);
    void target.offsetWidth;
    target.classList.add(flashClass);
    window.setTimeout(() => {
      target.classList.remove(flashClass);
    }, 900);
  }

  private scheduleFlashAfterScroll(
    target: HTMLElement,
    jumpId: number,
    onTimeout?: () => void
  ) {
    const start = performance.now();
    const minDelay = 160;
    const maxWait = 2000;
    const check = () => {
      if (jumpId !== this.keyInfoJumpId) {
        return;
      }
      const now = performance.now();
      const viewHeight =
        window.innerHeight || document.documentElement.clientHeight || 0;
      if (!viewHeight) {
        this.flashBlockElement(target);
        return;
      }
      const rect = target.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const delta = Math.abs(center - viewHeight / 2);
      const threshold = Math.min(80, viewHeight * 0.1);
      const ready = delta <= threshold && now - start >= minDelay;
      if (ready) {
        this.flashBlockElement(target);
        return;
      }
      if (now - start >= maxWait) {
        onTimeout?.();
        return;
      }
      window.requestAnimationFrame(check);
    };
    window.requestAnimationFrame(check);
  }

  private handleKeyInfoItemClick(item: KeyInfoItem) {
    const blockId = item.blockId;
    if (!blockId) {
      return;
    }
    const jumpId = ++this.keyInfoJumpId;
    const protyle = this.deps.getCurrentProtyle() || (getActiveEditor()?.protyle as ProtyleLike | undefined);
    const root = protyle?.wysiwyg?.element as HTMLElement | undefined;
    if (root) {
      const target = root.querySelector(
        `[data-node-id="${blockId}"]`
      ) as HTMLElement | null;
      if (target) {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
        this.scheduleFlashAfterScroll(target, jumpId, () => {
          this.openBlockByProtocolThrottled(blockId);
        });
        return;
      }
    }
    this.openBlockByProtocolThrottled(blockId);
  }

  private exportKeyInfoMarkdown() {
    if (!this.keyInfoDock) {
      return;
    }
    const items = this.keyInfoDock.getVisibleItems();
    if (!items.length) {
      showMessage("没有可导出的关键内容", 4000, "info");
      return;
    }

    const state = this.keyInfoDock.getState();
    const docTitle = state.docTitle || this.deps.getCurrentDocId() || "key-info";
    const content = buildKeyInfoMarkdown(items);
    const fileName = this.buildKeyInfoFileName(docTitle);
    this.triggerMarkdownDownload(fileName, content);
    showMessage(`已导出 ${items.length} 条关键内容`, 5000, "info");
  }

  private buildKeyInfoFileName(docTitle: string): string {
    const safeTitle = (docTitle || "key-info").replace(/[\\/:*?"<>|]/g, "_").trim();
    const base = safeTitle || "key-info";
    return `${base}-key-info.md`;
  }

  private triggerMarkdownDownload(fileName: string, content: string) {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }
}
