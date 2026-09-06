import { showMessage } from "siyuan";
import {
  removeTrailingWhitespaceFromDom,
  removeTrailingWhitespaceFromMarkdown,
} from "@/core/markdown-cleanup-core";
import { getBlockDOMs, getBlockKramdowns, getChildBlocksByParentId, updateBlockDom, updateBlockMarkdown, renderKramdownToBlockDOM } from "@/services/kernel";
import { createDocAssistantLogger as createLogger } from "@/core/logger-core";
import { IOperation, resolveSubmitBlockElement, runProtyleTransaction } from "@/plugin/transaction-runner";
import { ProtyleLike } from "@/plugin/doc-context";

const trailingWhitespaceLogger = createLogger("TrailingWhitespace");
type TrimTrailingWhitespaceDeps = {
  askConfirmWithVisibleDialog: (title: string, text: string) => Promise<boolean>;
  setBusy?: (busy: boolean) => void;
};

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

export async function handleTrimTrailingWhitespace(
  deps: TrimTrailingWhitespaceDeps,
  docId: string,
  protyle?: ProtyleLike
) {
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

  const ok = await deps.askConfirmWithVisibleDialog(
    "确认清理行尾空格",
    `将更新 ${updates.length} 个块，清理 ${affectedLineCount} 行行尾空格，是否继续？`
  );
  if (!ok) {
    return;
  }
  deps.setBusy?.(true);

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
        let appliedTransaction = false;
        if (protyle) {
          const liveDom = resolveSubmitBlockElement(protyle, item.id);
          if (liveDom) {
            let newHtml = "";
            if (item.dataType === "dom") {
              newHtml = currentData;
            } else {
              newHtml = (await renderKramdownToBlockDOM(currentData, protyle)) || "";
            }
            if (newHtml) {
              const doOperations: IOperation[] = [{ action: "update", id: item.id, data: newHtml }];
              const undoOperations: IOperation[] = [{ action: "update", id: item.id, data: liveDom.outerHTML }];
              if (runProtyleTransaction(protyle, doOperations, undoOperations)) {
                appliedTransaction = true;
                applied = true;
              }
            }
          }
        }

        if (!appliedTransaction) {
          if (item.dataType === "dom") {
            await updateBlockDom(item.id, currentData);
          } else {
            await updateBlockMarkdown(item.id, currentData);
          }
        }
      } catch (error: unknown) {
        failureMessage = error instanceof Error ? error.message : String(error);
        break;
      }
      if (item.dataType === "dom" || applied) {
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
