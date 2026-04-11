import { showMessage } from "siyuan";
import { AiServiceConfig } from "@/core/ai-service-config-core";
import { KeyInfoFilter } from "@/core/key-info-core";
import { createDocAssistantLogger } from "@/core/logger-core";
import {
  findDeleteFromCurrentBlockIds,
  removeTrailingWhitespaceFromDom,
  removeTrailingWhitespaceFromMarkdown,
} from "@/core/markdown-cleanup-core";
import { resolveDocDirectChildBlockId } from "@/services/block-lineage";
import {
  deleteBlocksByIds,
  getBlockDOMs,
  getBlockKramdowns,
  getChildBlocksByParentId,
  getChildBlockRefsByParentId,
  getDocReadonlyState,
  updateBlockDom,
  updateBlockMarkdown,
} from "@/services/kernel";
import { ActionConfig, ActionKey, ACTIONS } from "@/plugin/actions";
import { resolveCurrentBlockId } from "@/plugin/action-runner-context";
import { createAiActionHandlers } from "@/plugin/action-runner-ai-handlers";
import { createCleanupActionHandlers } from "@/plugin/action-runner-cleanup-handlers";
import { dispatchAction, ActionHandlerMap } from "@/plugin/action-runner-dispatcher";
import { createExportActionHandlers } from "@/plugin/action-runner-export-handlers";
import { createInsertActionHandlers } from "@/plugin/action-runner-insert-handlers";
import { createMediaActionHandlers } from "@/plugin/action-runner-media-handlers";
import { createOrganizeActionHandlers } from "@/plugin/action-runner-organize-handlers";
import { createSelectionActionHandlers } from "@/plugin/action-runner-selection-handlers";
import { ProtyleLike } from "@/plugin/doc-context";
import { NetworkLensPluginLike } from "@/services/network-lens-ai-index";

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

type ActionRunnerDeps = {
  isMobile: () => boolean;
  resolveDocId: (explicitId?: string, protyle?: ProtyleLike) => string;
  askConfirm: (title: string, text: string) => Promise<boolean>;
  setBusy?: (busy: boolean) => void;
  getKeyInfoFilter?: () => KeyInfoFilter | undefined;
  getAiSummaryConfig?: () => AiServiceConfig | undefined;
  getMonthlyDiaryTemplate?: () => string | undefined;
  resolveNetworkLensPlugin?: () => NetworkLensPluginLike | null | undefined;
};

const trailingWhitespaceLogger = createDocAssistantLogger("TrailingWhitespace");
const deleteFromCurrentLogger = createDocAssistantLogger("DeleteFromCurrent");
const DELETE_BLOCK_CONCURRENCY = 6;

function extractBlockLevelIal(kramdown: string): string | null {
  if (!kramdown) return null;
  const lines = kramdown.split(/\r?\n/);
  const ialLines: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed === "") continue;
    if (/^\{:/.test(trimmed)) {
      ialLines.unshift(trimmed);
    } else {
      break;
    }
  }
  return ialLines.length > 0 ? ialLines.join("\n") : null;
}

function isHighRiskForMarkdownWrite(value: string): boolean {
  if (!value) {
    return false;
  }
  return (
    /inline-memo/i.test(value) ||
    /data-inline-memo-content/i.test(value) ||
    /data-memo-content/i.test(value) ||
    /data-memo=/i.test(value) ||
    /\(\([^)]+\)\)\{:/.test(value)
  );
}

export class ActionRunner {
  private isRunning = false;
  private readonly backgroundTaskKeys = new Set<string>();

  private readonly actionHandlers: ActionHandlerMap;

  constructor(private readonly deps: ActionRunnerDeps) {
    this.actionHandlers = {
      ...createExportActionHandlers({
        getKeyInfoFilter: this.deps.getKeyInfoFilter,
      }),
      ...createAiActionHandlers({
        getAiSummaryConfig: this.deps.getAiSummaryConfig,
        askConfirmWithVisibleDialog: (title, text) => this.askConfirmWithVisibleDialog(title, text),
        resolveNetworkLensPlugin: this.deps.resolveNetworkLensPlugin,
        setBusy: this.deps.setBusy,
      }),
      ...createInsertActionHandlers({
        getMonthlyDiaryTemplate: this.deps.getMonthlyDiaryTemplate,
      }),
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
      "trim-trailing-whitespace": async (docId) => this.handleTrimTrailingWhitespace(docId),
      "delete-from-current-to-end": async (docId, protyle) =>
        this.handleDeleteFromCurrentToEnd(docId, protyle),
    } as ActionHandlerMap;
  }

  private async askConfirmWithVisibleDialog(title: string, text: string): Promise<boolean> {
    this.deps.setBusy?.(false);
    try {
      return await this.deps.askConfirm(title, text);
    } finally {
      this.deps.setBusy?.(true);
    }
  }

  async runAction(action: ActionKey, explicitId?: string, protyle?: ProtyleLike): Promise<ActionRunResult> {
    const docId = this.deps.resolveDocId(explicitId, protyle);
    if (!docId) {
      return this.createNotifiedFailure("context-unavailable", "未找到当前文档", 4000, "error");
    }
    const config = ACTIONS.find((item) => item.key === action);
    if (!config) {
      return this.createNotifiedFailure("execution-failed", "未找到对应动作", 4000, "error");
    }
    if (config.desktopOnly && this.deps.isMobile()) {
      return this.createNotifiedFailure("not-supported", "当前设备不支持此命令", 4000, "info");
    }
    if (config.requiresWritableDoc) {
      const writable = await this.ensureDocWritable(docId, config.commandText);
      if (!writable) {
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
    }
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
    showMessage(`已开始在后台执行“${config.commandText}”`, 3000, "info");

    void (async () => {
      try {
        await dispatchAction(action, docId, protyle, this.actionHandlers);
      } catch (error: unknown) {
        this.showActionError(error);
      } finally {
        this.backgroundTaskKeys.delete(taskKey);
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

  private async handleTrimTrailingWhitespace(docId: string) {
    const blocks = await getChildBlocksByParentId(docId);
    const paragraphBlocks = blocks.filter((block) => (block.type || "").toLowerCase() === "p");
    const paragraphBlockIdSet = new Set(paragraphBlocks.map((block) => block.id));
    trailingWhitespaceLogger.debug("scan start", {
      docId,
      blockCount: blocks.length,
      paragraphCount: paragraphBlocks.length,
    });
    if (!paragraphBlocks.length) {
      showMessage("当前文档没有可处理的段落", 4000, "info");
      return;
    }

    const collectUpdatesFromSourceMap = (
      sourceMap: Map<string, string>,
      domMap: Map<string, string>
    ) => {
      const updates: Array<{
        id: string;
        dataType: "markdown" | "dom";
        data: string;
        changedLines: number;
      }> = [];
      const skippedRiskyIds: string[] = [];
      let affectedLineCount = 0;
      for (const block of paragraphBlocks) {
        const sourceFromKramdown = sourceMap.get(block.id);
        const sourceDom = domMap.get(block.id) || "";
        if (block.resolved === false && sourceFromKramdown === undefined) {
          continue;
        }
        const source = sourceFromKramdown === undefined ? block.markdown || "" : sourceFromKramdown;
        const markdownCleaned = removeTrailingWhitespaceFromMarkdown(source);
        const hasHighRiskFormat =
          isHighRiskForMarkdownWrite(source) ||
          isHighRiskForMarkdownWrite(block.markdown || "") ||
          isHighRiskForMarkdownWrite(sourceDom);
        if (hasHighRiskFormat) {
          if (!sourceDom) {
            if (markdownCleaned.changedLines > 0) {
              skippedRiskyIds.push(block.id);
            }
            continue;
          }
          const domCleaned = removeTrailingWhitespaceFromDom(sourceDom);
          if (domCleaned.changedLines <= 0) {
            continue;
          }
          updates.push({
            id: block.id,
            dataType: "dom",
            data: domCleaned.dom,
            changedLines: domCleaned.changedLines,
          });
          affectedLineCount += domCleaned.changedLines;
          continue;
        }
        if (markdownCleaned.changedLines <= 0) {
          continue;
        }
        let markdownForUpdate = markdownCleaned.markdown;
        if (sourceFromKramdown !== undefined && block.resolved !== false) {
          if (/\(\([^)]+\)\)\{:/.test(block.markdown || "")) {
            trailingWhitespaceLogger.debug("skip block with block-ref inline IAL to prevent corruption", {
              id: block.id,
            });
            continue;
          }
          const sqlCleaned = removeTrailingWhitespaceFromMarkdown(block.markdown || "");
          markdownForUpdate = sqlCleaned.markdown;
          const blockIal = extractBlockLevelIal(markdownCleaned.markdown);
          if (blockIal) {
            markdownForUpdate = `${markdownForUpdate}\n${blockIal}`;
          }
        }
        updates.push({
          id: block.id,
          dataType: "markdown",
          data: markdownForUpdate,
          changedLines: markdownCleaned.changedLines,
        });
        affectedLineCount += markdownCleaned.changedLines;
      }
      return { updates, affectedLineCount, skippedRiskyIds };
    };

    const batchRows = (await getBlockKramdowns(paragraphBlocks.map((block) => block.id))) || [];
    const batchMap = new Map(batchRows.map((item) => [item.id, item.kramdown || ""]));
    const domRows = (await getBlockDOMs(paragraphBlocks.map((block) => block.id))) || [];
    const domMap = new Map(domRows.map((item) => [item.id, item.dom || ""]));
    const { updates, affectedLineCount, skippedRiskyIds } = collectUpdatesFromSourceMap(batchMap, domMap);
    trailingWhitespaceLogger.debug("batch scan result", {
      docId,
      batchCount: batchRows.length,
      domCount: domRows.length,
      updateCount: updates.length,
      affectedLineCount,
      skippedRiskyCount: skippedRiskyIds.length,
      skippedRiskySample: skippedRiskyIds.slice(0, 8),
      updateSample: updates.slice(0, 8).map((item) => item.id),
    });

    if (!updates.length) {
      const probeSamples = paragraphBlocks.slice(0, 8).map((block) => {
        const source = (batchMap.get(block.id) ?? block.markdown) || "";
        return {
          id: block.id,
          length: source.length,
          hasWhiteSpacePre: /white-space\s*:\s*pre/i.test(source),
          hasTailWhitespace: /[ \t]+$/.test(source),
          hasEscapedWhitespaceToken: /(?:\\t|\\u0009|\\x09)/i.test(source),
          preview: JSON.stringify(source.slice(0, 200)),
        };
      });
      trailingWhitespaceLogger.debug("no-op source probe", {
        docId,
        sampleCount: probeSamples.length,
        samples: probeSamples,
      });
      showMessage("未发现需要清理的行尾空格", 4000, "info");
      return;
    }

    const ok = await this.askConfirmWithVisibleDialog(
      "确认清理行尾空格",
      `将更新 ${updates.length} 个块，清理 ${affectedLineCount} 行行尾空格，是否继续？`
    );
    if (!ok) {
      return;
    }
    this.deps.setBusy?.(true);

    const maxApplyAttempts = 3;
    const maxVerifyReadAttempts = 3;
    const verifyReadDelayMs = 80;
    const retryDelayMs = 120;
    const sleep = async (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });
    const previewMarkdown = (value: string, max = 160) =>
      JSON.stringify(value.length > max ? `${value.slice(0, max)}…` : value);
    let successBlockCount = 0;
    let successLineCount = 0;
    let failedBlockCount = 0;
    const failedUpdates: Array<{
      id: string;
      attempts: number;
      verifyReads: number;
      message: string;
      lastChangedLines: number;
      persistedPreview: string;
      cleanedPreview: string;
    }> = [];
    for (const item of updates) {
      let currentData = item.data;
      let attempts = 0;
      let applied = false;
      let failureMessage = "";
      let verifyReads = 0;
      let lastChangedLines = 0;
      let lastPersistedPreview = "";
      let lastCleanedPreview = previewMarkdown(currentData);
      for (let attempt = 1; attempt <= maxApplyAttempts; attempt += 1) {
        attempts = attempt;
        try {
          if (item.dataType === "dom") {
            await updateBlockDom(item.id, currentData);
          } else {
            await updateBlockMarkdown(item.id, currentData);
          }
        } catch (error: unknown) {
          failureMessage = error instanceof Error ? error.message : String(error);
          break;
        }
        if (item.dataType === "dom") {
          applied = true;
          break;
        }
        try {
          let verifiedClean = false;
          for (let readAttempt = 1; readAttempt <= maxVerifyReadAttempts; readAttempt += 1) {
            verifyReads = readAttempt;
            const persistedRows = paragraphBlockIdSet.has(item.id)
              ? (await getBlockKramdowns([item.id])) || []
              : [];
            const persistedMarkdown = persistedRows.find((row) => row.id === item.id)?.kramdown;
            if (typeof persistedMarkdown !== "string") {
              applied = true;
              verifiedClean = true;
              break;
            }
            lastPersistedPreview = previewMarkdown(persistedMarkdown);
            const verification = removeTrailingWhitespaceFromMarkdown(persistedMarkdown);
            lastChangedLines = verification.changedLines;
            lastCleanedPreview = previewMarkdown(verification.markdown);
            if (verification.changedLines <= 0) {
              applied = true;
              verifiedClean = true;
              break;
            }
            currentData = verification.markdown;
            failureMessage = `verification-not-clean:${verification.changedLines}`;
            if (readAttempt < maxVerifyReadAttempts) {
              await sleep(verifyReadDelayMs * readAttempt);
            }
          }
          if (verifiedClean) {
            break;
          }
          if (attempt < maxApplyAttempts) {
            await sleep(retryDelayMs * attempt);
          }
        } catch (error: unknown) {
          applied = true;
          failureMessage = `verification-skipped:${error instanceof Error ? error.message : String(error)}`;
          break;
        }
      }
      if (applied) {
        successBlockCount += 1;
        successLineCount += item.changedLines;
      } else {
        failedBlockCount += 1;
        failedUpdates.push({
          id: item.id,
          attempts,
          verifyReads,
          message: failureMessage || "unknown failure",
          lastChangedLines,
          persistedPreview: lastPersistedPreview,
          cleanedPreview: lastCleanedPreview,
        });
      }
    }
    const failedSummary = failedUpdates
      .slice(0, 8)
      .map(
        (item) =>
          `${item.id}|attempts=${item.attempts}|reads=${item.verifyReads}|changed=${item.lastChangedLines}|${item.message}`
      );
    trailingWhitespaceLogger.debug("apply result", {
      docId,
      updateCount: updates.length,
      successBlockCount,
      successLineCount,
      failedBlockCount,
      maxApplyAttempts,
      maxVerifyReadAttempts,
      failedSummary,
      failedSample: failedUpdates.slice(0, 8),
    });

    if (failedBlockCount > 0) {
      showMessage(
        `已清理 ${successBlockCount} 个块、${successLineCount} 行，失败 ${failedBlockCount} 个块`,
        7000,
        "error"
      );
      return;
    }
    showMessage(`已清理 ${successBlockCount} 个块、${successLineCount} 行行尾空格`, 5000, "info");
  }

  private async handleDeleteFromCurrentToEnd(docId: string, protyle?: ProtyleLike) {
    const current = resolveCurrentBlockId(docId, protyle);
    const currentBlockId = current.id;
    if (!currentBlockId) {
      showMessage("未定位到当前段落，请将光标置于正文后重试", 5000, "error");
      return;
    }

    const blocks = await getChildBlockRefsByParentId(docId);
    if (!blocks.length) {
      showMessage("当前文档没有可处理的段落", 4000, "info");
      return;
    }

    const directChildIdSet = new Set(blocks.map((item) => item.id));
    let deleteStartId = currentBlockId;
    let mappedFromNested = false;
    if (!directChildIdSet.has(deleteStartId)) {
      const mapped = await resolveDocDirectChildBlockId(docId, deleteStartId);
      if (mapped) {
        mappedFromNested = true;
        deleteStartId = mapped;
      }
    }
    deleteFromCurrentLogger.debug("resolve start block", {
      docId,
      source: current.source,
      currentBlockIdWasDocId: current.wasDocId,
      currentBlockId,
      deleteStartId,
      mappedFromNested,
      directChildCount: blocks.length,
    });

    const result = findDeleteFromCurrentBlockIds(blocks, deleteStartId);
    if (result.deleteCount === 0) {
      showMessage("未找到从当前段落开始的可删除内容", 5000, "error");
      return;
    }

    const ok = await this.askConfirmWithVisibleDialog(
      "确认删除后续段落",
      `将删除 ${result.deleteCount} 个段落（含当前段），是否继续？`
    );
    if (!ok) {
      return;
    }
    this.deps.setBusy?.(true);

    const deleteResult = await deleteBlocksByIds(result.deleteIds, {
      concurrency: DELETE_BLOCK_CONCURRENCY,
    });
    const failed = deleteResult.failedIds.length;

    if (failed > 0) {
      showMessage(`已删除 ${deleteResult.deletedCount} 个段落，失败 ${failed} 个`, 6000, "error");
      return;
    }
    showMessage(`已删除 ${result.deleteCount} 个段落`, 5000, "info");
  }
}
