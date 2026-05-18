import {
  confirm,
  Dialog,
  getActiveEditor,
  getFrontend,
  Plugin,
  showMessage,
} from "siyuan";
import pluginInfo from "@/../plugin.json";
import { AiServiceConfig } from "@/core/ai-service-config-core";
import {
  DocMenuRegistrationState,
} from "@/core/doc-menu-registration-core";
import { buildDefaultKeyInfoFilter, KeyInfoFilter } from "@/core/key-info-core";
import { ActionRunner, ConfirmDetailItem } from "@/plugin/action-runner";
import { ACTIONS, ActionKey } from "@/plugin/actions";
import {
  ALPHA_FEATURE_HIDE_CONFIG,
  filterVisibleActions,
  getHiddenPluginSettingKeys,
} from "@/plugin/alpha-feature-config";
import { getProtyleDocId, ProtyleLike } from "@/plugin/doc-context";
import { KeyInfoController } from "@/plugin/key-info-controller";
import {
  bindPluginLifecycleEvents,
  unbindPluginLifecycleEvents,
} from "@/plugin/plugin-lifecycle-events";
import {
  populateEditorTitleMenu,
  registerPluginCommands,
} from "@/plugin/plugin-lifecycle-menu";
import {
  buildDefaultPluginDocMenuState,
  getOrderedPluginActions,
  PluginDocMenuState,
  normalizePluginDocMenuState,
  reorderPluginDocFavoriteActions,
  resetPluginDocActionOrder,
  serializePluginDocMenuState,
  setKeepNewDocAfterPinnedTabs,
  setAllPluginDocMenuRegistration,
  setAiSummaryConfig,
  setMonthlyDiaryTemplate,
  setPluginDocActionFavorite,
  setPluginDocActionOrder,
  setPluginKeyInfoFilter,
  setSinglePluginDocMenuRegistration,
} from "@/plugin/plugin-lifecycle-state";
import { createPinnedTabPlacementManager } from "@/plugin/plugin-pinned-tab-manager";
import { createPluginSettings } from "@/ui/plugin-settings";
import {
  destroyActionProcessingOverlay,
  hideActionProcessingOverlay,
  showActionProcessingOverlay,
} from "@/ui/action-processing-overlay";
import { resolveNetworkLensPluginFromPlugins } from "@/services/network-lens-ai-index";
import { createPowerButtonsProvider } from "@/plugin/power-buttons-provider";
import type { PowerButtonsCommandProvider } from "@/plugin/power-buttons-provider-types";

function escapeHtml(value: string): string {
  return (value || "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

export default class DocLinkToolkitPlugin extends Plugin {
  public setting?: ReturnType<typeof createPluginSettings>;
  private currentDocId = "";
  private currentProtyle?: ProtyleLike;
  private isMobile = false;
  private readonly docMenuRegistrationStorageName = "doc-menu-registration";
  private docMenuRegistrationState: DocMenuRegistrationState =
    buildDefaultPluginDocMenuState(ACTIONS).docMenuRegistrationState;
  private docActionOrderState: ActionKey[] =
    buildDefaultPluginDocMenuState(ACTIONS).docActionOrderState;
  private docFavoriteActionKeys: ActionKey[] = [];
  private keyInfoFilterState: KeyInfoFilter = buildDefaultKeyInfoFilter();
  private keepNewDocAfterPinnedTabs =
    buildDefaultPluginDocMenuState(ACTIONS).keepNewDocAfterPinnedTabs;
  private aiSummaryConfig = buildDefaultPluginDocMenuState(ACTIONS).aiSummaryConfig;
  private monthlyDiaryTemplate = buildDefaultPluginDocMenuState(ACTIONS).monthlyDiaryTemplate;
  private readonly pinnedTabPlacementManager = createPinnedTabPlacementManager();
  private readonly powerButtonsProvider: PowerButtonsCommandProvider = createPowerButtonsProvider({
    pluginVersion: pluginInfo.version,
    runAction: (action, context) => this.actionRunner.runAction(action, context),
  });

  private readonly actionRunner: ActionRunner = new ActionRunner({
    isMobile: () => this.isMobile,
    resolveDocId: (explicitId?: string, protyle?: ProtyleLike) =>
      this.resolveDocId(explicitId, protyle),
    askConfirm: (title, text, detailItems) => this.askConfirm(title, text, detailItems),
    setBusy: (busy) => this.setActionBusy(busy),
    setBackgroundActionRunning: (action, _docId, running) =>
      this.keyInfoController.setDocActionRunning(action, running),
    getKeyInfoFilter: (): KeyInfoFilter | undefined => this.keyInfoController.getCurrentFilter(),
    getAiSummaryConfig: () => this.aiSummaryConfig,
    getMonthlyDiaryTemplate: () => this.monthlyDiaryTemplate,
    resolveNetworkLensPlugin: () => resolveNetworkLensPluginFromPlugins(this.app?.plugins),
  });

  private readonly keyInfoController: KeyInfoController = new KeyInfoController({
    isMobile: () => this.isMobile,
    getCurrentDocId: () => this.currentDocId,
    getCurrentProtyle: () => this.currentProtyle,
    getKeyInfoFilter: () => this.keyInfoFilterState,
    setKeyInfoFilter: (filter) => this.setKeyInfoFilter(filter),
    resolveDocId: (explicitId?: string, protyle?: ProtyleLike) =>
      this.resolveDocId(explicitId, protyle),
    runAction: async (action, explicitId, protyle): Promise<void> => {
      await this.actionRunner.runAction(action, explicitId, protyle);
    },
    actions: () => this.getOrderedActions(),
    getDocMenuRegistrationState: () => this.docMenuRegistrationState,
    setAllDocMenuRegistration: (enabled) => this.setAllDocMenuRegistration(enabled),
    setSingleDocMenuRegistration: (key, enabled) =>
      this.setSingleDocMenuRegistration(key, enabled),
    setDocActionOrder: (order) => this.setDocActionOrder(order),
    resetDocActionOrder: () => this.resetDocActionOrder(),
    getDocFavoriteActionKeys: () => this.docFavoriteActionKeys,
    setDocActionFavorite: (key, favorited) =>
      this.setDocActionFavorite(key, favorited),
    setDocFavoriteActionOrder: (order) =>
      this.setDocFavoriteActionOrder(order),
  });

  private readonly onSwitchProtyle = (event: CustomEvent<{ protyle?: ProtyleLike }>) => {
    const protyle = event.detail?.protyle;
    const id = getProtyleDocId(protyle);
    if (!id) {
      return;
    }
    this.currentDocId = id;
    this.currentProtyle = protyle;
    this.pinnedTabPlacementManager.handleProtyleSwitch({
      protyle,
      enabled: this.keepNewDocAfterPinnedTabs,
      isMobile: this.isMobile,
    });
    void this.keyInfoController.refresh(id, protyle);
  };

  private readonly onEditorTitleMenu = (event: CustomEvent<{
    menu?: {
      addSeparator: () => void;
      addItem: (config: { icon: string; label: string; click: () => void }) => void;
    };
    data?: { id?: string };
    protyle?: ProtyleLike;
  }>) => {
    const detail = event.detail;
    const menu = detail?.menu;
    const docId = detail?.data?.id;
    if (!menu || !docId) {
      return;
    }
    this.currentDocId = docId;
    if (detail.protyle) {
      this.currentProtyle = detail.protyle;
    }

    populateEditorTitleMenu({
      menu,
      docId,
      protyle: detail.protyle,
      actions: this.getOrderedActions(),
      docMenuRegistrationState: this.docMenuRegistrationState,
      runAction: async (action, explicitId, protyle) => {
        await this.actionRunner.runAction(action, explicitId, protyle);
      },
    });
  };

  async onload() {
    await this.loadDocMenuRegistrationState();
    const frontend = getFrontend();
    this.isMobile = frontend === "mobile" || frontend === "browser-mobile";
    this.seedKnownTabIds();
    this.setting = this.buildPluginSettingPage();

    bindPluginLifecycleEvents(this.eventBus, {
      onSwitchProtyle: this.onSwitchProtyle,
      onEditorTitleMenu: this.onEditorTitleMenu,
    });
    this.keyInfoController.registerDock(this);

    registerPluginCommands({
      actions: this.getOrderedActions(),
      register: (config) => this.addCommand(config),
      runAction: async (action, explicitId, protyle) => {
        await this.actionRunner.runAction(action, explicitId, protyle);
      },
    });
  }

  onunload() {
    this.pinnedTabPlacementManager.clearPendingTasks();
    unbindPluginLifecycleEvents(this.eventBus, {
      onSwitchProtyle: this.onSwitchProtyle,
      onEditorTitleMenu: this.onEditorTitleMenu,
    });
    this.keyInfoController.destroy();
    destroyActionProcessingOverlay();
  }

  openSetting() {
    this.setting = this.buildPluginSettingPage();
    this.setting.open(this.name);
  }

  public getPowerButtonsIntegration(): PowerButtonsCommandProvider {
    return this.powerButtonsProvider;
  }

  private resolveDocId(explicitId?: string, protyle?: ProtyleLike): string {
    if (explicitId) {
      this.currentDocId = explicitId;
      if (protyle) {
        this.currentProtyle = protyle;
      }
      return explicitId;
    }
    const fromProtyle = getProtyleDocId(protyle);
    if (fromProtyle) {
      this.currentDocId = fromProtyle;
      this.currentProtyle = protyle;
      return fromProtyle;
    }
    const activeEditor = getActiveEditor();
    const activeId = getProtyleDocId(activeEditor?.protyle as ProtyleLike | undefined);
    if (activeId) {
      this.currentDocId = activeId;
      if (activeEditor?.protyle) {
        this.currentProtyle = activeEditor.protyle as ProtyleLike;
      }
      return activeId;
    }
    return this.currentDocId;
  }

  private async askConfirm(
    title: string,
    text: string,
    detailItems?: ConfirmDetailItem[]
  ): Promise<boolean> {
    if (!detailItems?.length) {
      return new Promise((resolve) => {
        confirm(
          title,
          text,
          () => resolve(true),
          () => resolve(false)
        );
      });
    }

    return new Promise((resolve) => {
      const listHtml = detailItems
        .map((item, index) => {
          const desc = item.description
            ? `<span class="doc-assistant-confirm-detail__desc">${escapeHtml(item.description)}</span>`
            : "";
          const toneClass = item.tone
            ? ` doc-assistant-confirm-detail__label--${item.tone}`
            : "";
          const labelHtml = `<span class="doc-assistant-confirm-detail__label${toneClass}">${escapeHtml(item.label)}</span>`;
          if (item.selectable) {
            const checked = item.selected !== false ? " checked" : "";
            return `<label class="doc-assistant-confirm-detail__item doc-assistant-confirm-detail__item--selectable"><input class="doc-assistant-confirm-detail__checkbox" type="checkbox" data-detail-index="${index}"${checked}>${labelHtml}${desc}</label>`;
          }
          return `<div class="doc-assistant-confirm-detail__item">${labelHtml}${desc}</div>`;
        })
        .join("");

      const content = `
        <div class="doc-assistant-confirm-detail">
          <div class="doc-assistant-confirm-detail__text">${escapeHtml(text)}</div>
          <details class="doc-assistant-confirm-detail__toggle">
            <summary class="doc-assistant-confirm-detail__summary">打开详情（${detailItems.length} 项）</summary>
            <div class="doc-assistant-confirm-detail__list">${listHtml}</div>
          </details>
        </div>`;

      const dialog = new Dialog({
        title,
        content,
        width: "520px",
      });

      const root = dialog.element.querySelector(".doc-assistant-confirm-detail") as HTMLElement;
      const confirmBtn = document.createElement("button");
      confirmBtn.textContent = "确定";
      confirmBtn.className = "b3-button b3-button--text";
      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "取消";
      cancelBtn.className = "b3-button b3-button--outline";

      const btnRow = document.createElement("div");
      btnRow.className = "doc-assistant-confirm-detail__actions";
      btnRow.append(cancelBtn, confirmBtn);
      root.appendChild(btnRow);

      confirmBtn.addEventListener("click", () => {
        root.querySelectorAll<HTMLInputElement>(".doc-assistant-confirm-detail__checkbox").forEach((checkbox) => {
          const index = Number(checkbox.dataset.detailIndex);
          if (Number.isInteger(index) && detailItems[index]) {
            detailItems[index].selected = checkbox.checked;
          }
        });
        dialog.destroy();
        resolve(true);
      });
      cancelBtn.addEventListener("click", () => {
        dialog.destroy();
        resolve(false);
      });
    });
  }

  private setActionBusy(busy: boolean) {
    if (busy) {
      showActionProcessingOverlay("文档处理中，请稍候...");
      return;
    }
    hideActionProcessingOverlay();
  }

  private buildPluginSettingPage() {
    return createPluginSettings({
      actions: this.getOrderedActions(),
      registration: this.docMenuRegistrationState,
      isMobile: this.isMobile,
      keepNewDocAfterPinnedTabs: this.keepNewDocAfterPinnedTabs,
      aiSummaryConfig: this.aiSummaryConfig,
      monthlyDiaryTemplate: this.monthlyDiaryTemplate,
      hiddenSettingKeys: getHiddenPluginSettingKeys(ALPHA_FEATURE_HIDE_CONFIG),
      onAiSummaryConfigChange: (config) => this.setAiSummaryConfig(config),
      onMonthlyDiaryTemplateChange: (template) => this.setMonthlyDiaryTemplate(template),
      onToggleKeepNewDocAfterPinnedTabs: (enabled) =>
        this.setKeepNewDocAfterPinnedTabs(enabled),
      onToggleAll: (enabled) => this.setAllDocMenuRegistration(enabled),
      onToggleSingle: (key, enabled) =>
        this.setSingleDocMenuRegistration(key, enabled),
    });
  }

  private async loadDocMenuRegistrationState() {
    try {
      const raw = await this.loadData(this.docMenuRegistrationStorageName);
      this.applyDocMenuState(normalizePluginDocMenuState(raw, ACTIONS));
    } catch (error: unknown) {
      this.applyDocMenuState(buildDefaultPluginDocMenuState(ACTIONS));
      const message = error instanceof Error ? error.message : String(error);
      showMessage(`读取菜单注册配置失败：${message}`, 5000, "error");
    }
  }

  private async persistDocMenuRegistrationState() {
    await this.saveData(
      this.docMenuRegistrationStorageName,
      serializePluginDocMenuState(this.snapshotDocMenuState())
    );
  }

  private getOrderedActions() {
    return filterVisibleActions(
      getOrderedPluginActions(ACTIONS, this.snapshotDocMenuState()),
      ALPHA_FEATURE_HIDE_CONFIG
    );
  }

  private snapshotDocMenuState(): PluginDocMenuState {
    return {
      docMenuRegistrationState: this.docMenuRegistrationState,
      docActionOrderState: this.docActionOrderState,
      docFavoriteActionKeys: this.docFavoriteActionKeys,
      keyInfoFilterState: this.keyInfoFilterState,
      keepNewDocAfterPinnedTabs: this.keepNewDocAfterPinnedTabs,
      aiSummaryConfig: this.aiSummaryConfig,
      monthlyDiaryTemplate: this.monthlyDiaryTemplate,
    };
  }

  private applyDocMenuState(state: PluginDocMenuState) {
    this.docMenuRegistrationState = state.docMenuRegistrationState;
    this.docActionOrderState = state.docActionOrderState;
    this.docFavoriteActionKeys = state.docFavoriteActionKeys;
    this.keyInfoFilterState = state.keyInfoFilterState;
    this.keepNewDocAfterPinnedTabs = state.keepNewDocAfterPinnedTabs;
    this.aiSummaryConfig = state.aiSummaryConfig;
    this.monthlyDiaryTemplate = state.monthlyDiaryTemplate;
  }

  async setAllDocMenuRegistration(enabled: boolean) {
    this.applyDocMenuState(
      setAllPluginDocMenuRegistration(this.snapshotDocMenuState(), enabled)
    );
    await this.persistDocMenuRegistrationState();
    this.keyInfoController.syncDocActions();
  }

  async setSingleDocMenuRegistration(key: ActionKey, enabled: boolean) {
    this.applyDocMenuState(
      setSinglePluginDocMenuRegistration(this.snapshotDocMenuState(), key, enabled)
    );
    await this.persistDocMenuRegistrationState();
    this.keyInfoController.syncDocActions();
  }

  async setDocActionOrder(order: ActionKey[]) {
    this.applyDocMenuState(
      setPluginDocActionOrder(this.snapshotDocMenuState(), order, ACTIONS)
    );
    await this.persistDocMenuRegistrationState();
    this.keyInfoController.syncDocActions();
  }

  async resetDocActionOrder() {
    this.applyDocMenuState(
      resetPluginDocActionOrder(this.snapshotDocMenuState(), ACTIONS)
    );
    await this.persistDocMenuRegistrationState();
    this.keyInfoController.syncDocActions();
  }

  async setDocActionFavorite(key: ActionKey, favorited: boolean) {
    this.applyDocMenuState(
      setPluginDocActionFavorite(this.snapshotDocMenuState(), key, favorited)
    );
    await this.persistDocMenuRegistrationState();
    this.keyInfoController.syncDocActions();
  }

  async setDocFavoriteActionOrder(order: ActionKey[]) {
    this.applyDocMenuState(
      reorderPluginDocFavoriteActions(this.snapshotDocMenuState(), order)
    );
    await this.persistDocMenuRegistrationState();
    this.keyInfoController.syncDocActions();
  }

  async setKeyInfoFilter(filter: KeyInfoFilter) {
    this.applyDocMenuState(
      setPluginKeyInfoFilter(this.snapshotDocMenuState(), filter)
    );
    await this.persistDocMenuRegistrationState();
  }

  async setKeepNewDocAfterPinnedTabs(enabled: boolean) {
    this.applyDocMenuState(
      setKeepNewDocAfterPinnedTabs(this.snapshotDocMenuState(), enabled)
    );
    await this.persistDocMenuRegistrationState();
  }

  async setAiSummaryConfig(config: AiServiceConfig) {
    this.applyDocMenuState(
      setAiSummaryConfig(this.snapshotDocMenuState(), config)
    );
    await this.persistDocMenuRegistrationState();
  }

  async setMonthlyDiaryTemplate(template: string) {
    this.applyDocMenuState(
      setMonthlyDiaryTemplate(this.snapshotDocMenuState(), template)
    );
    await this.persistDocMenuRegistrationState();
  }

  private seedKnownTabIds() {
    if (typeof window === "undefined") {
      return;
    }

    this.pinnedTabPlacementManager.seedKnownTabIds((window as Window & {
      siyuan?: {
        layout?: {
          centerLayout?: unknown;
        };
        config?: {
          uiLayout?: {
            layout?: unknown;
          };
        };
      };
    }).siyuan);
  }
}
