import { showMessage } from "siyuan";
import {
  applyBoldToParagraphHighlights,
  applyStrikethroughToIrrelevantSegments,
  isFullyStruckParagraph,
  isParagraphLikeBlockType,
  resolveBlocksAfterOpeningSeparator,
  stripMarkdownMarkersForDisplay,
  toConfirmDetailText,
  truncateForDisplay
} from "@/core/ai-marker-action-core";
import {
  detectIrrelevantParagraphMarks,
  detectKeyContentParagraphHighlights
} from "@/services/ai-slop-marker";
import {
  getChildBlocksByParentId,
  getDocMetaByID,
  updateBlockMarkdown
} from "@/services/kernel";
import { PartialActionHandlerMap } from "@/plugin/action-runner-dispatcher";
import type { ConfirmDetailItem } from "@/plugin/action-runner";
import { CreateAiActionHandlersOptions } from "@/plugin/action-runner-ai-types";

export function createAiMarkerActionHandlers(
  options: CreateAiActionHandlersOptions = {}
): PartialActionHandlerMap {
  return {
    "mark-irrelevant-paragraphs": async (docId) => {
      const blocks = await getChildBlocksByParentId(docId);
      const scopedBlocks = resolveBlocksAfterOpeningSeparator(blocks);
      const paragraphs = scopedBlocks
        .filter((block) => isParagraphLikeBlockType(block.type))
        .filter((block) => Boolean((block.markdown || "").trim()))
        .filter((block) => !isFullyStruckParagraph(block.markdown || ""))
        .map((block) => ({
          id: block.id,
          markdown: (block.markdown || "").trim()
        }));
      if (!paragraphs.length) {
        showMessage("当前文档没有可供筛选的段落", 5000, "info");
        return;
      }

      let docMeta: Awaited<ReturnType<typeof getDocMetaByID>> = null;
      try {
        docMeta = await getDocMetaByID(docId);
      } catch {
        docMeta = null;
      }

      const marks = await detectIrrelevantParagraphMarks({
        config: options.getAiSummaryConfig?.(),
        documentTitle: docMeta?.title,
        paragraphs
      });
      const paragraphMap = new Map(paragraphs.map((item) => [item.id, item]));
      const updates = marks
        .map((mark) => {
          const paragraph = paragraphMap.get(mark.paragraphId);
          if (!paragraph) {
            return null;
          }
          const result = applyStrikethroughToIrrelevantSegments(paragraph.markdown, mark.segments);
          return {
            id: paragraph.id,
            markdown: result.markdown,
            markedCount: result.markedCount,
            detailLabels: result.detailLabels.length ?
              result.detailLabels :
                [toConfirmDetailText(paragraph.markdown)]
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .filter((item) => item.markdown && item.markdown !== paragraphMap.get(item.id)?.markdown && item.markedCount > 0);

      if (!updates.length) {
        showMessage("AI 未识别出需要标记的口水内容", 5000, "info");
        return;
      }

      const markedCount = updates.reduce((sum, item) => sum + item.markedCount, 0);
      const detailItems: ConfirmDetailItem[] = updates.flatMap((item) =>
        item.detailLabels.map((label) => ({
          label: truncateForDisplay(label, 200)
        }))
      );

      const ok = options.askConfirmWithVisibleDialog ?
          await options.askConfirmWithVisibleDialog(
            "确认标记口水内容",
            `AI 判定可标记 ${markedCount} 处，涉及 ${updates.length} 个块。将为对应内容添加删除线，是否继续？`,
            detailItems
          ) :
        true;
      if (!ok) {
        return;
      }
      options.setBusy?.(true);

      let updatedBlockCount = 0;
      let failedBlockCount = 0;
      for (const item of updates) {
        try {
          await updateBlockMarkdown(item.id, item.markdown);
          updatedBlockCount += 1;
        } catch {
          failedBlockCount += 1;
        }
      }

      if (!updatedBlockCount) {
        showMessage("口水内容标记失败，请稍后重试", 7000, "error");
        return;
      }

      const summary = `已标记口水内容 ${markedCount} 处，共更新 ${updatedBlockCount} 个块`;
      if (failedBlockCount > 0) {
        showMessage(`${summary}，失败 ${failedBlockCount} 个块`, 7000, "error");
        return;
      }
      showMessage(summary, 5000, "info");
    },
    "mark-key-content": async (docId) => {
      const blocks = await getChildBlocksByParentId(docId);
      const scopedBlocks = resolveBlocksAfterOpeningSeparator(blocks);
      const paragraphs = scopedBlocks
        .filter((block) => isParagraphLikeBlockType(block.type))
        .filter((block) => Boolean((block.markdown || "").trim()))
        .map((block) => ({
          id: block.id,
          markdown: (block.markdown || "").trim()
        }));
      if (!paragraphs.length) {
        showMessage("当前文档没有可供识别的段落", 5000, "info");
        return;
      }

      let docMeta: Awaited<ReturnType<typeof getDocMetaByID>> = null;
      try {
        docMeta = await getDocMetaByID(docId);
      } catch {
        docMeta = null;
      }

      const highlightResults = await detectKeyContentParagraphHighlights({
        config: options.getAiSummaryConfig?.(),
        documentTitle: docMeta?.title,
        paragraphs
      });
      const paragraphMap = new Map(paragraphs.map((item) => [item.id, item]));
      const updates = highlightResults
        .map((item) => {
          const paragraph = paragraphMap.get(item.paragraphId);
          if (!paragraph) {
            return null;
          }
          return {
            id: paragraph.id,
            markdown: applyBoldToParagraphHighlights(paragraph.markdown, item.highlights)
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .filter((item) => item.markdown && item.markdown !== paragraphMap.get(item.id)?.markdown);

      if (!updates.length) {
        showMessage("AI 未识别出可加粗的关键内容", 5000, "info");
        return;
      }

      const detailItems: ConfirmDetailItem[] = highlightResults
        .filter((item) => paragraphMap.has(item.paragraphId))
        .flatMap((item) => item.highlights.map((highlight) => ({
          label: truncateForDisplay(stripMarkdownMarkersForDisplay(highlight), 200)
        })));

      const ok = options.askConfirmWithVisibleDialog ?
          await options.askConfirmWithVisibleDialog(
            "确认标记关键内容",
            `AI 判定可标记 ${updates.length} 段关键内容。将为 ${updates.length} 个块添加局部加粗，是否继续？`,
            detailItems
          ) :
        true;
      if (!ok) {
        return;
      }
      options.setBusy?.(true);

      let updatedBlockCount = 0;
      let failedBlockCount = 0;
      for (const item of updates) {
        try {
          await updateBlockMarkdown(item.id, item.markdown);
          updatedBlockCount += 1;
        } catch {
          failedBlockCount += 1;
        }
      }

      if (!updatedBlockCount) {
        showMessage("关键内容标记失败，请稍后重试", 7000, "error");
        return;
      }

      const summary = `已标记关键内容 ${updatedBlockCount} 段，共更新 ${updatedBlockCount} 个块`;
      if (failedBlockCount > 0) {
        showMessage(`${summary}，失败 ${failedBlockCount} 个块`, 7000, "error");
        return;
      }
      showMessage(summary, 5000, "info");
    }
  };
}
