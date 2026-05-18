import { getActiveEditor, showMessage } from "siyuan";
import { DocMenuRegistrationState } from "@/core/doc-menu-registration-core";
import { buildKeyInfoMarkdown, KeyInfoFilter, KeyInfoItem } from "@/core/key-info-core";
import {
  buildKeyInfoControllerDockActionState,
  cloneKeyInfoDockFilter,
  createKeyInfoControllerDockCallbacks,
} from "@/plugin/key-info-controller-dock";
import {
  buildKeyInfoRefreshFailureState,
  buildKeyInfoRefreshPendingState,
  buildKeyInfoRefreshSuccessState,
  buildKeyInfoUnavailableState,
  shouldSkipReadonlyStateSync,
} from "@/plugin/key-info-controller-refresh";
import { createKeyInfoNavigation } from "@/plugin/key-info-navigation";
import { ActionConfig, ActionKey } from "@/plugin/actions";
import { ProtyleLike } from "@/plugin/doc-context";
import { getDocReadonlyState } from "@/services/kernel";
import { getDocKeyInfo } from "@/services/key-info";
import { createKeyInfoDock, KeyInfoDockHandle } from "@/ui/key-info-dock";

type KeyInfoControllerDeps = {
  isMobile: () => boolean;
  getCurrentDocId: () => string;
  getCurrentProtyle: () => ProtyleLike | undefined;
  getKeyInfoFilter?: () => KeyInfoFilter | undefined;
  setKeyInfoFilter?: (filter: KeyInfoFilter) => Promise<void> | void;
  resolveDocId: (explicitId?: string, protyle?: ProtyleLike) => string;
  runAction: (action: ActionKey, explicitId?: string, protyle?: ProtyleLike) => Promise<void>;
  actions: () => ActionConfig[];
  getDocMenuRegistrationState: () => DocMenuRegistrationState;
  setAllDocMenuRegistration: (enabled: boolean) => Promise<void> | void;
  setSingleDocMenuRegistration: (key: ActionKey, enabled: boolean) => Promise<void> | void;
  setDocActionOrder: (order: ActionKey[]) => Promise<void> | void;
  resetDocActionOrder: () => Promise<void> | void;
  getDocFavoriteActionKeys: () => ActionKey[];
  setDocActionFavorite: (key: ActionKey, favorited: boolean) => Promise<void> | void;
  setDocFavoriteActionOrder: (order: ActionKey[]) => Promise<void> | void;
};

export class KeyInfoController {
  private keyInfoDock?: KeyInfoDockHandle;
  private keyInfoRequestId = 0;
  private docReadonlyRequestId = 0;
  private keyInfoDocId = "";
  private currentDocReadonly = false;
  private readonly runningDocActionKeys = new Set<ActionKey>();
  private readonly navigation = createKeyInfoNavigation();

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
        this.keyInfoDock = createKeyInfoDock(
          dock.element,
          {
            ...createKeyInfoControllerDockCallbacks({
              deps: this.deps,
              onExport: () => this.exportKeyInfoMarkdown(),
              onRefresh: () => this.refresh(),
              onDocProcessActivate: () => this.syncCurrentDocReadonlyState(),
              onItemClick: (item) => {
                this.handleKeyInfoItemClick(item);
              },
            }),
            onFilterChange: (filter) => {
              void this.deps.setKeyInfoFilter?.(cloneKeyInfoDockFilter(filter) || []);
            },
          }
        );
        const initialFilter = cloneKeyInfoDockFilter(this.deps.getKeyInfoFilter?.());
        if (initialFilter) {
          this.keyInfoDock.setState({ filter: initialFilter });
        }
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
    this.docReadonlyRequestId += 1;
    this.keyInfoDock?.destroy();
    this.keyInfoDock = undefined;
  }

  setDocActionRunning(action: ActionKey, running: boolean) {
    if (running) {
      this.runningDocActionKeys.add(action);
    } else {
      this.runningDocActionKeys.delete(action);
    }
    this.keyInfoDock?.setState({
      runningDocActionKeys: Array.from(this.runningDocActionKeys),
    });
  }

  syncDocActions() {
    if (!this.keyInfoDock) {
      return;
    }
    const registration = this.deps.getDocMenuRegistrationState();
    this.keyInfoDock.setState({
      ...buildKeyInfoControllerDockActionState({
        actions: this.deps.actions(),
        isMobile: this.deps.isMobile(),
        registration,
        favoriteActionKeys: this.deps.getDocFavoriteActionKeys(),
        docReadonly: this.currentDocReadonly,
      }),
      runningDocActionKeys: Array.from(this.runningDocActionKeys),
    });
  }

  getCurrentFilter(): KeyInfoFilter | undefined {
    return cloneKeyInfoDockFilter(this.keyInfoDock?.getState().filter)
      || cloneKeyInfoDockFilter(this.deps.getKeyInfoFilter?.());
  }

  async refresh(explicitId?: string, protyle?: ProtyleLike) {
    if (!this.keyInfoDock) {
      return;
    }
    const docId = this.deps.resolveDocId(explicitId, protyle);
    if (!docId) {
      this.keyInfoDock.setState(buildKeyInfoUnavailableState());
      return;
    }

    const requestId = ++this.keyInfoRequestId;
    const currentState = this.keyInfoDock.getState();
    const currentDocId = this.keyInfoDocId;
    this.keyInfoDock.setState(
      buildKeyInfoRefreshPendingState({
        currentState,
        currentDocId,
        nextDocId: docId,
      })
    );

    try {
      const activeProtyle = protyle || this.deps.getCurrentProtyle() || (getActiveEditor()?.protyle as ProtyleLike | undefined);
      const readonlyPromise = getDocReadonlyState(docId).catch(() => false);
      const data = await getDocKeyInfo(docId, activeProtyle);
      const isReadonly = await readonlyPromise;
      if (requestId !== this.keyInfoRequestId || !this.keyInfoDock) {
        return;
      }
      this.currentDocReadonly = isReadonly;
      this.syncDocActions();
      this.keyInfoDocId = docId;
      this.keyInfoDock.setState(
        buildKeyInfoRefreshSuccessState({
          currentState,
          currentDocId,
          nextDocId: docId,
          docTitle: data.docTitle,
          latestItems: data.items,
        })
      );
    } catch (error: unknown) {
      if (requestId !== this.keyInfoRequestId || !this.keyInfoDock) {
        return;
      }
      this.currentDocReadonly = await getDocReadonlyState(docId).catch(() => false);
      if (requestId !== this.keyInfoRequestId || !this.keyInfoDock) {
        return;
      }
      this.syncDocActions();
      const message = error instanceof Error ? error.message : String(error);
      showMessage(`加载关键内容失败：${message}`, 7000, "error");
      this.keyInfoDock.setState(
        buildKeyInfoRefreshFailureState({
          currentState,
          currentDocId,
          nextDocId: docId,
        })
      );
    }
  }

  private async syncCurrentDocReadonlyState(explicitId?: string, protyle?: ProtyleLike) {
    if (!this.keyInfoDock) {
      return;
    }
    const docId = this.deps.resolveDocId(explicitId, protyle);
    if (!docId) {
      return;
    }
    const requestId = ++this.docReadonlyRequestId;
    const readonly = await getDocReadonlyState(docId).catch(() => false);
    if (requestId !== this.docReadonlyRequestId || !this.keyInfoDock) {
      return;
    }
    if (shouldSkipReadonlyStateSync({
      currentDocId: this.keyInfoDocId,
      nextDocId: docId,
      currentReadonly: this.currentDocReadonly,
      nextReadonly: readonly,
    })) {
      return;
    }
    this.currentDocReadonly = readonly;
    this.syncDocActions();
  }

  private handleKeyInfoItemClick(item: KeyInfoItem) {
    this.navigation.handleItemClick(item, () => {
      return this.deps.getCurrentProtyle() || (getActiveEditor()?.protyle as ProtyleLike | undefined);
    });
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
