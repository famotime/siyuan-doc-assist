import { showMessage } from "siyuan";
import { AiServiceConfig } from "@/core/ai-service-config-core";
import { KeyInfoFilter } from "@/core/key-info-core";
import { createDocAssistantLogger } from "@/core/logger-core";
import { getDocReadonlyState } from "@/services/kernel";
import { ActionConfig, ActionKey, ACTIONS } from "@/plugin/actions";
import { createAiActionHandlers } from "@/plugin/action-runner-ai-handlers";
import { CanvasPluginLike } from "@/services/canvas-plugin-resolver";
import { createCleanupActionHandlers } from "@/plugin/action-runner-cleanup-handlers";
import { createDeleteRangeActionHandlers } from "@/plugin/action-runner-delete-range-handlers";
import { createSelectRangeActionHandlers } from "@/plugin/action-runner-select-range-handlers";
import { ACTION_CANCELLED, dispatchAction, ActionHandlerMap } from "@/plugin/action-runner-dispatcher";
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
    message?: string;
    alreadyNotified: true;
  } |
  {
    ok: false;
    errorCode: "context-unavailable" | "not-supported" | "execution-failed" | "cancelled";
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
  | string |
  PowerButtonsInvokeContext |
  undefined;

const actionRunnerLogger = createDocAssistantLogger("ActionRunner");

// 后台任务键残留阈值：超过即视为 handler 悬挂（finally 未执行），入口处清扫，
// 避免「动作+文档」组合被永久拒绝（审计遗留项 2.1）。
const STALE_BACKGROUND_TASK_MS = 10 * 60 * 1000;

export class ActionRunner {
  private isRunning = false;
  private busyDepth = 0;
  // key -> 启动时间戳；任务 finally 删除，入口按阈值清扫悬挂残留。
  private readonly backgroundTaskKeys = new Map<string, number>();

  constructor(private readonly deps: ActionRunnerDeps) {}

  // Handler maps are built per invocation so the invoke context travels with each
  // dispatch instead of living in a shared instance slot that concurrent calls overwrite.
  private buildActionHandlers(
    invokeContext: PowerButtonsInvokeContext | undefined,
    includeGlobalBusy: boolean
  ): ActionHandlerMap {
    const setBusy = includeGlobalBusy ? (busy: boolean) => this.trackBusy(busy) : undefined;
    return {
      ...createExportActionHandlers({
        getKeyInfoFilter: this.deps.getKeyInfoFilter
      }),
      ...createAiActionHandlers({
        getAiSummaryConfig: this.deps.getAiSummaryConfig,
        askConfirmWithVisibleDialog: (title, text, detailItems) =>
          this.askConfirmWithVisibleDialog(title, text, detailItems, invokeContext),
        resolveNetworkLensPlugin: this.deps.resolveNetworkLensPlugin,
        resolveCanvasPlugin: this.deps.resolveCanvasPlugin,
        setBusy
      }),
      ...createInsertActionHandlers({
        shouldAutoConfirm: () => this.shouldAutoConfirm(invokeContext),
        isFullDocScope: () => invokeContext?.scope === "full-doc"
      }),
      ...createOrganizeActionHandlers({
        askConfirmWithVisibleDialog: (title, text) =>
          this.askConfirmWithVisibleDialog(title, text, undefined, invokeContext),
        ensureDocWritable: (docId, actionLabel) => this.ensureDocWritable(docId, actionLabel),
        setBusy
      }),
      ...createMediaActionHandlers(),
      ...createSelectionActionHandlers({
        askConfirmWithVisibleDialog: (title, text) =>
          this.askConfirmWithVisibleDialog(title, text, undefined, invokeContext),
        setBusy
      }),
      ...createCleanupActionHandlers({
        askConfirmWithVisibleDialog: (title, text, detailItems) =>
          this.askConfirmWithVisibleDialog(title, text, detailItems, invokeContext),
        setBusy
      }),
      "trim-trailing-whitespace": async (docId, protyle) => handleTrimTrailingWhitespace({
        askConfirmWithVisibleDialog: (title, text) =>
          this.askConfirmWithVisibleDialog(title, text, undefined, invokeContext),
        setBusy
      }, docId, protyle),
      ...createDeleteRangeActionHandlers({
        askConfirmWithVisibleDialog: (title, text) =>
          this.askConfirmWithVisibleDialog(title, text, undefined, invokeContext),
        setBusy
      }),
      ...createSelectRangeActionHandlers()
    } as ActionHandlerMap;
  }

  private async askConfirmWithVisibleDialog(
    title: string,
    text: string,
    detailItems?: ConfirmDetailItem[],
    invokeContext?: PowerButtonsInvokeContext
  ): Promise<boolean> {
    if (this.shouldAutoConfirm(invokeContext)) {
      return true;
    }
    const wasBusy = this.busyDepth > 0;
    this.trackBusy(false);
    try {
      const ok = detailItems?.length ?
          await this.deps.askConfirm(title, text, detailItems) :
          await this.deps.askConfirm(title, text);
      if (!ok) {
        return false;
      }
      if (wasBusy) {
        this.trackBusy(true);
      }
      return true;
    } catch (error) {
      if (wasBusy) {
        this.trackBusy(true);
      }
      throw error;
    }
  }

  async runAction(action: ActionKey, explicitIdOrContext?: ActionRunInput, protyle?: ProtyleLike): Promise<ActionRunResult> {
    this.sweepStaleBackgroundTasks();
    const invokeContext = this.normalizeInvokeContext(explicitIdOrContext);
    const explicitId = typeof explicitIdOrContext === "string" ?
      explicitIdOrContext :
      invokeContext?.docId;
    const config = ACTIONS.find((item) => item.key === action);
    if (!config) {
      return this.createNotifiedFailure("execution-failed", "未找到对应动作", 4000, "error");
    }
    const docId = config.noDocRequired ? "" : this.deps.resolveDocId(explicitId, protyle);
    if (!docId && !config.noDocRequired) {
      return this.createNotifiedFailure("context-unavailable", "未找到当前文档", 4000, "info");
    }
    if (config.desktopOnly && this.deps.isMobile()) {
      return this.createNotifiedFailure("not-supported", "当前设备不支持此命令", 4000, "info");
    }
    if (config.runInBackground) {
      if (config.requiresWritableDoc) {
        const writable = await this.ensureDocWritable(docId, config.commandText);
        if (!writable) {
          return {
            ok: false,
            errorCode: "context-unavailable",
            message: this.getReadonlyDocMessage(config.commandText),
            alreadyNotified: true
          };
        }
      }
      return this.runActionInBackground(action, docId, protyle, config, invokeContext);
    }
    if (this.isRunning) {
      return this.createNotifiedFailure("not-supported", "正在处理中，请等待当前任务完成", 4000, "info");
    }

    // Acquire the foreground mutex before the first await so check-then-act stays atomic.
    this.isRunning = true;
    this.trackBusy(true);
    try {
      if (config.requiresWritableDoc) {
        const writable = await this.ensureDocWritable(docId, config.commandText);
        if (!writable) {
          return {
            ok: false,
            errorCode: "context-unavailable",
            message: this.getReadonlyDocMessage(config.commandText),
            alreadyNotified: true
          };
        }
      }
      const handlerRes = await dispatchAction(
        action,
        docId,
        protyle,
        this.buildActionHandlers(invokeContext, true)
      );
      if (handlerRes === ACTION_CANCELLED) {
        return {
          ok: false,
          errorCode: "cancelled",
          message: "已取消操作",
          alreadyNotified: true
        };
      }
      if (handlerRes && typeof handlerRes === "object") {
        if (handlerRes.ok === false) {
          return {
            ok: false,
            errorCode: handlerRes.errorCode || "execution-failed",
            message: handlerRes.message || "执行未完成",
            alreadyNotified: true
          };
        }
        if (handlerRes.message) {
          return {
            ok: true,
            alreadyNotified: true,
            message: handlerRes.message
          };
        }
      }
      return { ok: true, alreadyNotified: true };
    } catch (error: unknown) {
      this.showActionError(error);
      return {
        ok: false,
        errorCode: "execution-failed",
        message: this.getErrorMessage(error),
        alreadyNotified: true
      };
    } finally {
      this.isRunning = false;
      this.resetBusy();
    }
  }

  // Busy state is a counter: nested phases each raise/lower it and the overlay only
  // follows the 0 <-> 1 boundary, so concurrent phases cannot hide each other's state.
  private trackBusy(busy: boolean) {
    if (busy) {
      this.busyDepth += 1;
      if (this.busyDepth === 1) {
        this.deps.setBusy?.(true);
      }
      return;
    }
    this.busyDepth = Math.max(0, this.busyDepth - 1);
    if (this.busyDepth === 0) {
      this.deps.setBusy?.(false);
    }
  }

  private resetBusy() {
    if (this.busyDepth === 0) {
      return;
    }
    this.busyDepth = 0;
    this.deps.setBusy?.(false);
  }

  private normalizeInvokeContext(input?: ActionRunInput): PowerButtonsInvokeContext | undefined {
    if (!input || typeof input === "string") {
      return undefined;
    }
    return input;
  }

  private shouldAutoConfirm(invokeContext?: PowerButtonsInvokeContext): boolean {
    if (invokeContext?.skipConfirm === true || invokeContext?.confirmed === true) {
      return true;
    }
    return invokeContext?.trigger === "workflow-step";
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

  // handler 悬挂时其 finally 永远不会执行，残留键只能靠入口清扫回收。
  private sweepStaleBackgroundTasks(now: number = Date.now()): void {
    for (const [key, startedAt] of this.backgroundTaskKeys) {
      if (now - startedAt >= STALE_BACKGROUND_TASK_MS) {
        this.backgroundTaskKeys.delete(key);
        actionRunnerLogger.warn("stale background task key swept", { key, startedAt });
      }
    }
  }

  private runActionInBackground(
    action: ActionKey,
    docId: string,
    protyle: ProtyleLike | undefined,
    config: ActionConfig,
    invokeContext?: PowerButtonsInvokeContext
  ): ActionRunResult {
    const taskKey = `${action}:${docId}`;
    if (this.backgroundTaskKeys.has(taskKey)) {
      return this.createNotifiedFailure(
        "not-supported",
        `“${config.commandText}”正在后台处理中，请稍候`,
        4000,
        "info"
      );
    }

    this.backgroundTaskKeys.set(taskKey, Date.now());
    this.deps.setBackgroundActionRunning?.(action, docId, true);
    showMessage(`已开始在后台执行“${config.commandText}”`, 3000, "info");

    void (async () => {
      try {
        // Background tasks never drive the global blocking overlay.
        const handlerRes = await dispatchAction(
          action,
          docId,
          protyle,
          this.buildActionHandlers(invokeContext, false)
        );
        if (handlerRes === ACTION_CANCELLED) {
          // 后台任务没有调用方可接收结果；取消即静默结束，仅回收状态（finally 统一处理）。
          return;
        }
        if (handlerRes && typeof handlerRes === "object") {
          if (handlerRes.ok === false) {
            return {
              ok: false,
              errorCode: handlerRes.errorCode || "execution-failed",
              message: handlerRes.message || "执行未完成",
              alreadyNotified: true
            };
          }
          if (handlerRes.message) {
            return {
              ok: true,
              alreadyNotified: true,
              message: handlerRes.message
            };
          }
        }
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
    type: "info" | "error"
  ): ActionRunResult {
    showMessage(message, duration, type);
    return {
      ok: false,
      errorCode,
      message,
      alreadyNotified: true
    };
  }

}
