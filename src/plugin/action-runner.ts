import { showMessage } from "siyuan";
import { AiServiceConfig } from "@/core/ai-service-config-core";
import { KeyInfoFilter } from "@/core/key-info-core";
import { getDocReadonlyState } from "@/services/kernel";
import { ActionConfig, ActionKey, ACTIONS } from "@/plugin/actions";
import { createAiActionHandlers } from "@/plugin/action-runner-ai-handlers";
import { CanvasPluginLike } from "@/services/canvas-plugin-resolver";
import { createCleanupActionHandlers } from "@/plugin/action-runner-cleanup-handlers";
import { createDeleteRangeActionHandlers } from "@/plugin/action-runner-delete-range-handlers";
import { dispatchAction, ActionHandlerMap } from "@/plugin/action-runner-dispatcher";
import { createExportActionHandlers } from "@/plugin/action-runner-export-handlers";
import { createInsertActionHandlers } from "@/plugin/action-runner-insert-handlers";
import { createMediaActionHandlers } from "@/plugin/action-runner-media-handlers";
import { createOrganizeActionHandlers } from "@/plugin/action-runner-organize-handlers";
import { createSelectionActionHandlers } from "@/plugin/action-runner-selection-handlers";
import { ProtyleLike } from "@/plugin/doc-context";
import { NetworkLensPluginLike } from "@/services/network-lens-ai-index";
import { PowerButtonsInvokeContext } from "@/plugin/power-buttons-provider-types";
import { handleTrimTrailingWhitespace } from "@/plugin/action-runner-trim-handlers";

export type ActionRunResult =
  | {
      ok: true;
      alreadyNotified: true;
    }
  | {
      ok: false;
      errorCode: "context-unavailable" | "not-supported" | "execution-failed";
      message: string;
      alreadyNotified: true;
    };

type ActionRunErrorCode = Extract<ActionRunResult, { ok: false }>["errorCode"];

export type ConfirmDetailItem = {
  id?: string;
  label: string;
  description?: string;
  selectable?: boolean;
  selected?: boolean;
  tone?: "link" | "tag";
};

type ActionRunnerDeps = {
  isMobile: () => boolean;
  resolveDocId: (explicitId?: string, protyle?: ProtyleLike) => string;
  askConfirm: (title: string, text: string, detailItems?: ConfirmDetailItem[]) => Promise<boolean>;
  setBusy?: (busy: boolean) => void;
  setBackgroundActionRunning?: (action: ActionKey, docId: string, running: boolean) => void;
  getKeyInfoFilter?: () => KeyInfoFilter | undefined;
  getAiSummaryConfig?: () => AiServiceConfig | undefined;
  resolveNetworkLensPlugin?: () => NetworkLensPluginLike | null | undefined;
  resolveCanvasPlugin?: () => CanvasPluginLike | null | undefined;
};

type ActionRunInput =
  | string
  | PowerButtonsInvokeContext
  | undefined;

export class ActionRunner {
  private isRunning = false;
  private readonly backgroundTaskKeys = new Set<string>();
  private currentInvokeContext?: PowerButtonsInvokeContext;

  private readonly actionHandlers: ActionHandlerMap;

  constructor(private readonly deps: ActionRunnerDeps) {
    this.actionHandlers = {
      ...createExportActionHandlers({
        getKeyInfoFilter: this.deps.getKeyInfoFilter,
      }),
      ...createAiActionHandlers({
        getAiSummaryConfig: this.deps.getAiSummaryConfig,
        askConfirmWithVisibleDialog: (title, text, detailItems) =>
          this.askConfirmWithVisibleDialog(title, text, detailItems),
        resolveNetworkLensPlugin: this.deps.resolveNetworkLensPlugin,
        resolveCanvasPlugin: this.deps.resolveCanvasPlugin,
        setBusy: this.deps.setBusy,
      }),
      ...createInsertActionHandlers(),
      ...createOrganizeActionHandlers({
        askConfirmWithVisibleDialog: (title, text) => this.askConfirmWithVisibleDialog(title, text),
        ensureDocWritable: (docId, actionLabel) => this.ensureDocWritable(docId, actionLabel),
        setBusy: this.deps.setBusy,
      }),
      ...createMediaActionHandlers(),
      ...createSelectionActionHandlers({
        askConfirmWithVisibleDialog: (title, text) => this.askConfirmWithVisibleDialog(title, text),
        setBusy: this.deps.setBusy,
      }),
      ...createCleanupActionHandlers({
        askConfirmWithVisibleDialog: (title, text) => this.askConfirmWithVisibleDialog(title, text),
        setBusy: this.deps.setBusy,
      }),
      "trim-trailing-whitespace": async (docId) => handleTrimTrailingWhitespace({
        askConfirmWithVisibleDialog: (title, text) => this.askConfirmWithVisibleDialog(title, text),
        setBusy: this.deps.setBusy,
      }, docId),
      ...createDeleteRangeActionHandlers({
        askConfirmWithVisibleDialog: (title, text) => this.askConfirmWithVisibleDialog(title, text),
        setBusy: this.deps.setBusy,
      }),
    } as ActionHandlerMap;
  }

  private async askConfirmWithVisibleDialog(
    title: string,
    text: string,
    detailItems?: ConfirmDetailItem[]
  ): Promise<boolean> {
    if (this.shouldAutoConfirm()) {
      return true;
    }
    this.deps.setBusy?.(false);
    try {
      return detailItems?.length
        ? await this.deps.askConfirm(title, text, detailItems)
        : await this.deps.askConfirm(title, text);
    } finally {
      this.deps.setBusy?.(true);
    }
  }

  async runAction(action: ActionKey, explicitIdOrContext?: ActionRunInput, protyle?: ProtyleLike): Promise<ActionRunResult> {
    const invokeContext = this.normalizeInvokeContext(explicitIdOrContext);
    const explicitId = typeof explicitIdOrContext === "string"
      ? explicitIdOrContext
      : invokeContext?.docId;
    const config = ACTIONS.find((item) => item.key === action);
    if (!config) {
      return this.createNotifiedFailure("execution-failed", "未找到对应动作", 4000, "error");
    }
    this.currentInvokeContext = invokeContext;
    const docId = config.noDocRequired ? "" : this.deps.resolveDocId(explicitId, protyle);
    if (!docId && !config.noDocRequired) {
      this.currentInvokeContext = undefined;
      return this.createNotifiedFailure("context-unavailable", "未找到当前文档", 4000, "error");
    }
    if (config.desktopOnly && this.deps.isMobile()) {
      this.currentInvokeContext = undefined;
      return this.createNotifiedFailure("not-supported", "当前设备不支持此命令", 4000, "info");
    }
    if (config.requiresWritableDoc) {
      const writable = await this.ensureDocWritable(docId, config.commandText);
      if (!writable) {
        this.currentInvokeContext = undefined;
        return {
          ok: false,
          errorCode: "context-unavailable",
          message: this.getReadonlyDocMessage(config.commandText),
          alreadyNotified: true,
        };
      }
    }
    if (config.runInBackground) {
      return this.runActionInBackground(action, docId, protyle, config);
    }
    if (this.isRunning) {
      return this.createNotifiedFailure("not-supported", "正在处理中，请等待当前任务完成", 4000, "info");
    }

    try {
      this.isRunning = true;
      this.deps.setBusy?.(true);
      await dispatchAction(action, docId, protyle, this.actionHandlers);
      return { ok: true, alreadyNotified: true };
    } catch (error: unknown) {
      this.showActionError(error);
      return {
        ok: false,
        errorCode: "execution-failed",
        message: this.getErrorMessage(error),
        alreadyNotified: true,
      };
    } finally {
      this.isRunning = false;
      this.deps.setBusy?.(false);
      this.currentInvokeContext = undefined;
    }
  }

  private normalizeInvokeContext(input?: ActionRunInput): PowerButtonsInvokeContext | undefined {
    if (!input || typeof input === "string") {
      return undefined;
    }
    return input;
  }

  private shouldAutoConfirm(): boolean {
    return this.currentInvokeContext?.trigger === "workflow-step";
  }

  registerCommands(register: (config: ActionConfig, run: () => void) => void) {
    for (const config of ACTIONS) {
      register(config, () => {
        void this.runAction(config.key);
      });
    }
  }

  private async ensureDocWritable(docId: string, actionLabel: string): Promise<boolean> {
    if (!docId) {
      return true;
    }
    const readonly = await getDocReadonlyState(docId);
    if (!readonly) {
      return true;
    }
    showMessage(this.getReadonlyDocMessage(actionLabel), 5000, "info");
    return false;
  }

  private runActionInBackground(
    action: ActionKey,
    docId: string,
    protyle: ProtyleLike | undefined,
    config: ActionConfig
  ): ActionRunResult {
    const taskKey = `${action}:${docId}`;
    if (this.backgroundTaskKeys.has(taskKey)) {
      return this.createNotifiedFailure(
        "not-supported",
        `“${config.commandText}”正在后台处理中，请稍候`,
        4000,
        "info",
      );
    }

    this.backgroundTaskKeys.add(taskKey);
    this.deps.setBackgroundActionRunning?.(action, docId, true);
    showMessage(`已开始在后台执行“${config.commandText}”`, 3000, "info");

    void (async () => {
      try {
        await dispatchAction(action, docId, protyle, this.actionHandlers);
      } catch (error: unknown) {
        this.showActionError(error);
      } finally {
        this.backgroundTaskKeys.delete(taskKey);
        this.deps.setBackgroundActionRunning?.(action, docId, false);
      }
    })();

    return { ok: true, alreadyNotified: true };
  }

  private showActionError(error: unknown) {
    showMessage(this.getErrorMessage(error), 7000, "error");
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private getReadonlyDocMessage(actionLabel: string): string {
    return `当前文档已锁定，无法执行“${actionLabel}”。请先解除文档锁定后再试。`;
  }

  private createNotifiedFailure(
    errorCode: ActionRunErrorCode,
    message: string,
    duration: number,
    type: "info" | "error",
  ): ActionRunResult {
    showMessage(message, duration, type);
    return {
      ok: false,
      errorCode,
      message,
      alreadyNotified: true,
    };
  }

}
