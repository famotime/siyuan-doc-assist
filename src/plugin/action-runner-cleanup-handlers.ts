import { showMessage } from "siyuan";
import { buildHeadingBoldTogglePreview } from "@/core/heading-bold-toggle-core";
import {
  convertSiyuanLinksAndRefsInMarkdown,
  extractSiyuanBlockIdsFromMarkdown,
  markInvalidSiyuanLinkRefsInMarkdown,
} from "@/core/link-core";
import {
  cleanupAiOutputArtifactsInMarkdown,
  findClippedListContinuationMerges,
  findExtraBlankParagraphIds,
  findHeadingMissingBlankParagraphBeforeIds,
  removeClippedListPrefixesFromMarkdown,
  removeStrikethroughMarkedContentFromMarkdown,
  splitBilingualParagraphMarkdown,
} from "@/core/markdown-cleanup-core";
import {
  appendBlock,
  deleteBlocksByIds,
  getChildBlocksByParentId,
  getDocMetaByID,
  insertBlockBefore,
  updateBlockMarkdown,
} from "@/services/kernel";
import { applyMarkdownTransformToBlocks } from "@/plugin/action-runner-block-transform";
import { PartialActionHandlerMap } from "@/plugin/action-runner-dispatcher";

type CreateCleanupActionHandlersDeps = {
  askConfirmWithVisibleDialog: (title: string, text: string) => Promise<boolean>;
  setBusy?: (busy: boolean) => void;
};

type AiOutputCleanupPreview = {
  cleanableBlockCount: number;
  riskyPendingBlockCount: number;
  removedSupCount: number;
  removedCaretCount: number;
  removedInternetLinkCount: number;
};

type StrikethroughCleanupPreview = {
  cleanableBlockCount: number;
  riskyPendingBlockCount: number;
  removedCount: number;
};

const DELETE_BLOCK_CONCURRENCY = 6;

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

function isSafeBilingualSplitBlockType(type: string): boolean {
  const normalized = (type || "").trim().toLowerCase();
  return normalized === "p" || normalized === "paragraph" || normalized === "nodeparagraph";
}

function previewAiOutputCleanup(
  blocks: Array<{ id: string; markdown?: string }>
): AiOutputCleanupPreview {
  const preview: AiOutputCleanupPreview = {
    cleanableBlockCount: 0,
    riskyPendingBlockCount: 0,
    removedSupCount: 0,
    removedCaretCount: 0,
    removedInternetLinkCount: 0,
  };

  for (const block of blocks) {
    const source = block.markdown || "";
    if (!source) {
      continue;
    }
    const cleaned = cleanupAiOutputArtifactsInMarkdown(source);
    const hasChanges = cleaned.removedCount > 0 && cleaned.markdown !== source;
    if (!hasChanges) {
      continue;
    }
    if (isHighRiskForMarkdownWrite(source)) {
      preview.riskyPendingBlockCount += 1;
      continue;
    }
    preview.cleanableBlockCount += 1;
    preview.removedSupCount += cleaned.removedSupCount;
    preview.removedCaretCount += cleaned.removedCaretCount;
    preview.removedInternetLinkCount += cleaned.removedInternetLinkCount;
  }

  return preview;
}

function previewStrikethroughCleanup(
  blocks: Array<{ id: string; markdown?: string }>
): StrikethroughCleanupPreview {
  const preview: StrikethroughCleanupPreview = {
    cleanableBlockCount: 0,
    riskyPendingBlockCount: 0,
    removedCount: 0,
  };

  for (const block of blocks) {
    const source = block.markdown || "";
    if (!source) {
      continue;
    }
    const cleaned = removeStrikethroughMarkedContentFromMarkdown(source);
    const hasChanges = cleaned.removedCount > 0 && cleaned.markdown !== source;
    if (!hasChanges) {
      continue;
    }
    if (isHighRiskForMarkdownWrite(source)) {
      preview.riskyPendingBlockCount += 1;
      continue;
    }
    preview.cleanableBlockCount += 1;
    preview.removedCount += cleaned.removedCount;
  }

  return preview;
}

export function createCleanupActionHandlers(
  deps: CreateCleanupActionHandlersDeps
): PartialActionHandlerMap {
  const handleRemoveExtraBlankLines = async (docId: string) => {
    const blocks = await getChildBlocksByParentId(docId);
    if (!blocks.length) {
      showMessage("当前文档没有可处理的段落", 4000, "info");
      return;
    }

    const result = findExtraBlankParagraphIds(blocks);
    if (result.removedCount === 0) {
      showMessage("未发现需要去除的空段落", 4000, "info");
      return;
    }

    const ok = await deps.askConfirmWithVisibleDialog(
      "确认去除空行",
      `将删除 ${result.removedCount} 个空段落，是否继续？`
    );
    if (!ok) {
      return;
    }
    deps.setBusy?.(true);

    const deleteResult = await deleteBlocksByIds(result.deleteIds, {
      concurrency: DELETE_BLOCK_CONCURRENCY,
    });
    const failed = deleteResult.failedIds.length;

    if (failed > 0) {
      showMessage(`已去除 ${deleteResult.deletedCount} 个空段落，失败 ${failed} 个`, 6000, "error");
      return;
    }
    showMessage(`已去除 ${result.removedCount} 个空段落`, 5000, "info");
  };

  const handleInsertBlankBeforeHeadings = async (docId: string) => {
    const blocks = await getChildBlocksByParentId(docId);
    if (!blocks.length) {
      showMessage("当前文档没有可处理的段落", 4000, "info");
      return;
    }

    const result = findHeadingMissingBlankParagraphBeforeIds(blocks);
    if (result.insertCount === 0) {
      showMessage("所有标题前均已有空段落", 4000, "info");
      return;
    }

    const ok = await deps.askConfirmWithVisibleDialog(
      "确认补空段落",
      `将为 ${result.insertCount} 个标题前插入空段落，是否继续？`
    );
    if (!ok) {
      return;
    }
    deps.setBusy?.(true);

    let failed = 0;
    for (const headingId of result.insertBeforeIds) {
      try {
        await insertBlockBefore("<br />", headingId, docId);
      } catch {
        failed += 1;
      }
    }

    if (failed > 0) {
      showMessage(`已为 ${result.insertCount - failed} 个标题补充空段落，失败 ${failed} 个`, 6000, "error");
      return;
    }
    showMessage(`已为 ${result.insertCount} 个标题补充空段落`, 5000, "info");
  };

  const handleToggleHeadingBold = async (docId: string) => {
    const blocks = await getChildBlocksByParentId(docId);
    const preview = buildHeadingBoldTogglePreview(blocks);
    if (preview.totalHeadingCount === 0) {
      showMessage("当前文档没有标题块", 4000, "info");
      return;
    }
    if (preview.updateCount === 0) {
      showMessage("未发现可处理的标题块", 4000, "info");
      return;
    }

    const operationText = preview.mode === "remove-bold" ? "取消所有标题块加粗" : "加粗所有标题块";
    const ok = await deps.askConfirmWithVisibleDialog(
      "确认标题块加粗状态切换",
      [
        `标题总数 ${preview.totalHeadingCount} 个`,
        `含加粗 ${preview.boldHeadingCount} 个`,
        `未加粗 ${preview.plainHeadingCount} 个`,
        `操作：${operationText}`,
        `预计更新 ${preview.updateCount} 个块`,
        "是否继续？",
      ].join("\n")
    );
    if (!ok) {
      return;
    }
    deps.setBusy?.(true);

    let success = 0;
    let failed = 0;
    for (const item of preview.updates) {
      try {
        await updateBlockMarkdown(item.id, item.next);
        success += 1;
      } catch {
        failed += 1;
      }
    }

    if (failed > 0) {
      showMessage(`标题块处理完成：成功 ${success} 个，失败 ${failed} 个`, 7000, "error");
      return;
    }

    showMessage(
      preview.mode === "remove-bold"
        ? `已取消 ${success} 个标题块的加粗`
        : `已为 ${success} 个标题块加粗`,
      5000,
      "info"
    );
  };

  const handleMarkInvalidLinksRefs = async (docId: string) => {
    const blocks = await getChildBlocksByParentId(docId);
    if (!blocks.length) {
      showMessage("当前文档没有可处理的段落", 4000, "info");
      return;
    }

    const candidateIds = new Set<string>();
    for (const block of blocks) {
      const source = block.markdown || "";
      if (!source) {
        continue;
      }
      const ids = extractSiyuanBlockIdsFromMarkdown(source);
      for (const id of ids) {
        candidateIds.add(id);
      }
    }
    if (!candidateIds.size) {
      showMessage("当前文档未发现思源文档链接或引用", 4000, "info");
      return;
    }

    const invalidIds = new Set<string>();
    await Promise.all(
      [...candidateIds].map(async (id) => {
        try {
          const meta = await getDocMetaByID(id);
          if (!meta) {
            invalidIds.add(id);
          }
        } catch {
          invalidIds.add(id);
        }
      })
    );

    if (!invalidIds.size) {
      showMessage("当前文档未发现无效链接或引用", 4000, "info");
      return;
    }

    const report = await applyMarkdownTransformToBlocks({
      blocks,
      isHighRisk: (source) => isHighRiskForMarkdownWrite(source),
      updateBlockMarkdown,
      transform: (source) => {
        const marked = markInvalidSiyuanLinkRefsInMarkdown(source, invalidIds);
        return {
          markdown: marked.markdown,
          changedCount: marked.markedCount,
        };
      },
    });
    const markedCount = report.changedCount;
    const updatedBlockCount = report.updatedBlockCount;
    const failedBlockCount = report.failedBlockCount;
    const skippedRiskyIds = report.skippedRiskyIds;

    if (!updatedBlockCount) {
      if (skippedRiskyIds.length) {
        showMessage("检测到高风险块，未执行标示（可先移除复杂内联后重试）", 5000, "error");
        return;
      }
      showMessage("当前文档未发现无效链接或引用", 4000, "info");
      return;
    }

    if (failedBlockCount > 0) {
      showMessage(
        `已标示 ${markedCount} 处无效链接/引用，共更新 ${updatedBlockCount} 个块，失败 ${failedBlockCount} 个块`,
        7000,
        "error"
      );
      return;
    }
    showMessage(`已标示 ${markedCount} 处无效链接/引用，共更新 ${updatedBlockCount} 个块`, 5000, "info");
  };

  const handleCleanAiOutput = async (docId: string) => {
    const blocks = await getChildBlocksByParentId(docId);
    if (!blocks.length) {
      showMessage("当前文档没有可处理的段落", 4000, "info");
      return;
    }

    const preview = previewAiOutputCleanup(blocks);
    if (!preview.cleanableBlockCount) {
      if (preview.riskyPendingBlockCount > 0) {
        showMessage("检测到高风险块，未执行清理（可先移除复杂内联后重试）", 5000, "error");
        return;
      }
      showMessage("未发现可清理的 AI 输出内容", 4000, "info");
      return;
    }

    const confirmLines = [
      `已找到待清理内容：上标 ${preview.removedSupCount} 处，^^ ${preview.removedCaretCount} 处，互联网链接 ${preview.removedInternetLinkCount} 处。`,
      `预计将更新 ${preview.cleanableBlockCount} 个块，是否继续？`,
    ];
    if (preview.riskyPendingBlockCount > 0) {
      confirmLines.push(`另有 ${preview.riskyPendingBlockCount} 个高风险块包含可清理内容，本次将跳过。`);
    }
    const ok = await deps.askConfirmWithVisibleDialog("确认清理AI输出内容", confirmLines.join("\n"));
    if (!ok) {
      return;
    }
    deps.setBusy?.(true);

    let removedSupCount = 0;
    let removedCaretCount = 0;
    let removedInternetLinkCount = 0;
    const report = await applyMarkdownTransformToBlocks({
      blocks,
      isHighRisk: (source) => isHighRiskForMarkdownWrite(source),
      updateBlockMarkdown,
      transform: (source) => {
        const cleaned = cleanupAiOutputArtifactsInMarkdown(source);
        return {
          ...cleaned,
          changedCount: cleaned.removedCount,
        };
      },
      onUpdated: (cleaned) => {
        removedSupCount += cleaned.removedSupCount;
        removedCaretCount += cleaned.removedCaretCount;
        removedInternetLinkCount += cleaned.removedInternetLinkCount;
      },
    });
    const updatedBlockCount = report.updatedBlockCount;
    const failedBlockCount = report.failedBlockCount;
    const skippedRiskyIds = report.skippedRiskyIds;

    if (!updatedBlockCount) {
      if (skippedRiskyIds.length) {
        showMessage("检测到高风险块，未执行清理（可先移除复杂内联后重试）", 5000, "error");
        return;
      }
      showMessage("未发现可清理的 AI 输出内容", 4000, "info");
      return;
    }

    const summary = `已清理 AI 输出残留：上标 ${removedSupCount} 处，^^ ${removedCaretCount} 处，互联网链接 ${removedInternetLinkCount} 处，共更新 ${updatedBlockCount} 个块`;
    if (failedBlockCount > 0) {
      showMessage(`${summary}，失败 ${failedBlockCount} 个块`, 7000, "error");
      return;
    }
    showMessage(summary, 5000, "info");
  };

  const handleCleanClippedListPrefixes = async (docId: string) => {
    const blocks = await getChildBlocksByParentId(docId);
    if (!blocks.length) {
      showMessage("当前文档没有可处理的段落", 4000, "info");
      return;
    }

    const continuationMergeResult = findClippedListContinuationMerges(blocks);
    const continuationMergeByMarkerId = new Map(
      continuationMergeResult.merges.map((item) => [item.markerBlockId, item])
    );
    const continuationContentIdSet = new Set(
      continuationMergeResult.merges.map((item) => item.contentBlockId)
    );
    const continuationMergeCount = continuationMergeResult.mergeCount;
    let listCleanupBlockCount = 0;
    let bilingualSplitBlockCount = 0;
    for (const block of blocks) {
      if (continuationContentIdSet.has(block.id)) {
        continue;
      }
      const source = block.markdown || "";
      const continuationMerge = continuationMergeByMarkerId.get(block.id);
      const targetMarkdown = continuationMerge?.mergedMarkdown || source;
      if (!targetMarkdown) {
        continue;
      }
      const listCleanup = removeClippedListPrefixesFromMarkdown(targetMarkdown);
      if (listCleanup.removedCount > 0) {
        listCleanupBlockCount += 1;
      }
      if (isSafeBilingualSplitBlockType(block.type)) {
        const splitResult = splitBilingualParagraphMarkdown(listCleanup.markdown);
        if (splitResult.changed) {
          bilingualSplitBlockCount += 1;
        }
      }
    }

    const cleanableCount = continuationMergeCount + listCleanupBlockCount + bilingualSplitBlockCount;
    if (!cleanableCount) {
      showMessage("未发现可清理的剪藏内容", 4000, "info");
      return;
    }

    const confirmLines: string[] = [];
    if (continuationMergeCount > 0) {
      confirmLines.push(`合并断开的列表项 ${continuationMergeCount} 处`);
    }
    if (listCleanupBlockCount > 0) {
      confirmLines.push(`清理重复列表前缀 ${listCleanupBlockCount} 个块`);
    }
    if (bilingualSplitBlockCount > 0) {
      confirmLines.push(`拆分中英双语段落 ${bilingualSplitBlockCount} 个`);
    }
    confirmLines.push("是否继续？");
    const ok = await deps.askConfirmWithVisibleDialog("确认清理剪藏内容", confirmLines.join("\n"));
    if (!ok) {
      return;
    }
    deps.setBusy?.(true);

    let updatedBlockCount = 0;
    let splitParagraphCount = 0;
    let failedBlockCount = 0;
    const deleteIds: string[] = [];
    for (const [index, block] of blocks.entries()) {
      if (continuationContentIdSet.has(block.id)) {
        continue;
      }
      const continuationMerge = continuationMergeByMarkerId.get(block.id);
      const source = continuationMerge?.mergedMarkdown || block.markdown || "";
      if (!source) {
        continue;
      }
      const listCleanup = removeClippedListPrefixesFromMarkdown(source);
      const splitResult = isSafeBilingualSplitBlockType(block.type)
        ? splitBilingualParagraphMarkdown(listCleanup.markdown)
        : { parts: [listCleanup.markdown], changed: false };
      if (!continuationMerge && listCleanup.removedCount === 0 && !splitResult.changed) {
        continue;
      }

      try {
        if (splitResult.changed) {
          const trailingBlock = splitResult.parts[1] || "";
          const nextBlockId = blocks[index + 1]?.id || "";
          if (nextBlockId) {
            await insertBlockBefore(trailingBlock, nextBlockId, docId);
          } else {
            await appendBlock(trailingBlock, docId);
          }
          await updateBlockMarkdown(block.id, splitResult.parts[0] || listCleanup.markdown);
          if (continuationMerge) {
            deleteIds.push(continuationMerge.contentBlockId);
          }
          splitParagraphCount += 1;
          updatedBlockCount += 1;
          continue;
        }

        await updateBlockMarkdown(block.id, listCleanup.markdown);
        if (continuationMerge) {
          deleteIds.push(continuationMerge.contentBlockId);
        }
        updatedBlockCount += 1;
      } catch {
        failedBlockCount += 1;
      }
    }

    if (deleteIds.length > 0) {
      const deleteResult = await deleteBlocksByIds(deleteIds, {
        concurrency: DELETE_BLOCK_CONCURRENCY,
      });
      failedBlockCount += deleteResult.failedIds.length;
    }

    if (!updatedBlockCount && !splitParagraphCount) {
      showMessage("清理完成，未更新任何块", 4000, "info");
      return;
    }

    const summary = splitParagraphCount > 0
      ? `已清理剪藏内容：更新 ${updatedBlockCount} 个块，拆分 ${splitParagraphCount} 个双语段落`
      : `已清理剪藏内容，共更新 ${updatedBlockCount} 个块`;
    if (failedBlockCount > 0) {
      showMessage(`${summary}，失败 ${failedBlockCount} 个块`, 7000, "error");
      return;
    }
    showMessage(summary, 5000, "info");
  };

  const handleRemoveStrikethroughMarkedContent = async (docId: string) => {
    const blocks = await getChildBlocksByParentId(docId);
    if (!blocks.length) {
      showMessage("当前文档没有可处理的段落", 4000, "info");
      return;
    }

    const preview = previewStrikethroughCleanup(blocks);
    if (!preview.cleanableBlockCount) {
      if (preview.riskyPendingBlockCount > 0) {
        showMessage("检测到高风险块，未执行清理（可先移除复杂内联后重试）", 5000, "error");
        return;
      }
      showMessage("未发现删除线标记内容", 4000, "info");
      return;
    }

    const confirmLines = [
      `已找到删除线标记内容 ${preview.removedCount} 处。`,
      `预计更新 ${preview.cleanableBlockCount} 个块，是否继续？`,
    ];
    if (preview.riskyPendingBlockCount > 0) {
      confirmLines.push(`另有 ${preview.riskyPendingBlockCount} 个高风险块将跳过。`);
    }
    const ok = await deps.askConfirmWithVisibleDialog("确认清理预删除内容", confirmLines.join("\n"));
    if (!ok) {
      return;
    }
    deps.setBusy?.(true);

    let removedCount = 0;
    const report = await applyMarkdownTransformToBlocks({
      blocks,
      isHighRisk: (source) => isHighRiskForMarkdownWrite(source),
      updateBlockMarkdown,
      transform: (source) => {
        const cleaned = removeStrikethroughMarkedContentFromMarkdown(source);
        return {
          ...cleaned,
          changedCount: cleaned.removedCount,
        };
      },
      onUpdated: (cleaned) => {
        removedCount += cleaned.removedCount;
      },
    });
    const updatedBlockCount = report.updatedBlockCount;
    const failedBlockCount = report.failedBlockCount;
    const skippedRiskyIds = report.skippedRiskyIds;

    if (!updatedBlockCount) {
      if (skippedRiskyIds.length) {
        showMessage("检测到高风险块，未执行清理（可先移除复杂内联后重试）", 5000, "error");
        return;
      }
      showMessage("未发现删除线标记内容", 4000, "info");
      return;
    }

    const summary = `已清理删除线标记内容 ${removedCount} 处，共更新 ${updatedBlockCount} 个块`;
    if (failedBlockCount > 0) {
      showMessage(`${summary}，失败 ${failedBlockCount} 个块`, 7000, "error");
      return;
    }
    showMessage(summary, 5000, "info");
  };

  const handleToggleLinksRefs = async (docId: string) => {
    const blocks = await getChildBlocksByParentId(docId);
    if (!blocks.length) {
      showMessage("当前文档没有可处理的段落", 4000, "info");
      return;
    }

    const docMarkdown = blocks.map((block) => block.markdown || "").join("\n");
    const modeResult = convertSiyuanLinksAndRefsInMarkdown(docMarkdown);
    if (modeResult.mode === "none" || modeResult.convertedCount <= 0) {
      showMessage("当前文档未发现可互转的思源文档链接或引用", 4000, "info");
      return;
    }
    const preferredMode = modeResult.mode === "link-to-ref" ? "link-to-ref" : "ref-to-link";

    let previewConvertedCount = 0;
    let previewUpdatableBlockCount = 0;
    let previewRiskyBlockCount = 0;
    for (const block of blocks) {
      const source = block.markdown || "";
      if (!source) {
        continue;
      }
      const converted = convertSiyuanLinksAndRefsInMarkdown(source, preferredMode);
      const hasChanges = converted.convertedCount > 0 && converted.markdown !== source;
      if (!hasChanges) {
        continue;
      }
      if (isHighRiskForMarkdownWrite(source)) {
        previewRiskyBlockCount += 1;
        continue;
      }
      previewUpdatableBlockCount += 1;
      previewConvertedCount += converted.convertedCount;
    }

    if (!previewUpdatableBlockCount) {
      if (previewRiskyBlockCount > 0) {
        showMessage("检测到高风险块，未执行互转（可先移除复杂内联后重试）", 5000, "error");
        return;
      }
      showMessage("当前文档未发现可互转的思源文档链接或引用", 4000, "info");
      return;
    }

    const actionLabel = preferredMode === "link-to-ref" ? "文档链接转换为引用" : "引用转换为文档链接";
    const confirmLines = [
      `互转方向：${actionLabel}`,
      `预计转换 ${previewConvertedCount} 处，共更新 ${previewUpdatableBlockCount} 个块。`,
    ];
    if (previewRiskyBlockCount > 0) {
      confirmLines.push(`另有 ${previewRiskyBlockCount} 个高风险块将跳过。`);
    }
    confirmLines.push("是否继续？");
    const ok = await deps.askConfirmWithVisibleDialog("确认链接/引用互转", confirmLines.join("\n"));
    if (!ok) {
      return;
    }
    deps.setBusy?.(true);

    const report = await applyMarkdownTransformToBlocks({
      blocks,
      isHighRisk: (source) => isHighRiskForMarkdownWrite(source),
      updateBlockMarkdown,
      transform: (source) => {
        const converted = convertSiyuanLinksAndRefsInMarkdown(source, preferredMode);
        return {
          markdown: converted.markdown,
          changedCount: converted.convertedCount,
        };
      },
    });
    const convertedCount = report.changedCount;
    const updatedBlockCount = report.updatedBlockCount;
    const failedBlockCount = report.failedBlockCount;
    const skippedRiskyIds = report.skippedRiskyIds;

    if (!updatedBlockCount) {
      if (skippedRiskyIds.length) {
        showMessage("检测到高风险块，未执行互转（可先移除复杂内联后重试）", 5000, "error");
        return;
      }
      showMessage("当前文档未发现可互转的思源文档链接或引用", 4000, "info");
      return;
    }

    if (failedBlockCount > 0) {
      showMessage(
        `已将 ${convertedCount} 处${actionLabel}，共更新 ${updatedBlockCount} 个块，失败 ${failedBlockCount} 个块`,
        7000,
        "error"
      );
      return;
    }
    showMessage(`已将 ${convertedCount} 处${actionLabel}，共更新 ${updatedBlockCount} 个块`, 5000, "info");
  };

  return {
    "remove-extra-blank-lines": handleRemoveExtraBlankLines,
    "insert-blank-before-headings": handleInsertBlankBeforeHeadings,
    "toggle-heading-bold": handleToggleHeadingBold,
    "mark-invalid-links-refs": handleMarkInvalidLinksRefs,
    "clean-ai-output": handleCleanAiOutput,
    "clean-clipped-list-prefixes": handleCleanClippedListPrefixes,
    "remove-strikethrough-marked-content": handleRemoveStrikethroughMarkedContent,
    "toggle-links-refs": handleToggleLinksRefs,
  };
}
