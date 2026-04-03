import { showMessage } from "siyuan";
import { AiServiceConfig } from "@/core/ai-service-config-core";
import {
  buildAiSummaryBlockMarkdown,
  resolveAiSummaryInsertTarget,
} from "@/core/ai-summary-core";
import { generateDocumentSummary } from "@/services/ai-summary";
import { detectIrrelevantParagraphIds } from "@/services/ai-slop-marker";
import {
  appendBlock,
  getChildBlocksByParentId,
  getDocMetaByID,
  getRootDocRawMarkdown,
  insertBlockBefore,
  updateBlockMarkdown,
} from "@/services/kernel";
import { PartialActionHandlerMap } from "@/plugin/action-runner-dispatcher";

type CreateAiActionHandlersOptions = {
  getAiSummaryConfig?: () => AiServiceConfig | undefined;
  askConfirmWithVisibleDialog?: (title: string, text: string) => Promise<boolean>;
  setBusy?: (busy: boolean) => void;
};

export function createAiActionHandlers(
  options: CreateAiActionHandlersOptions = {}
): PartialActionHandlerMap {
  return {
    "insert-doc-summary": async (docId) => {
      const documentMarkdown = (await getRootDocRawMarkdown(docId)).trim();
      if (!documentMarkdown) {
        showMessage("当前文档没有可供摘要的正文", 5000, "info");
        return;
      }

      let docMeta: Awaited<ReturnType<typeof getDocMetaByID>> = null;
      try {
        docMeta = await getDocMetaByID(docId);
      } catch {
        docMeta = null;
      }
      const summary = await generateDocumentSummary({
        config: options.getAiSummaryConfig?.(),
        documentTitle: docMeta?.title,
        documentMarkdown,
      });
      const blocks = await getChildBlocksByParentId(docId);
      const summaryMarkdown = buildAiSummaryBlockMarkdown(summary);
      const target = resolveAiSummaryInsertTarget(blocks);

      if (target.mode === "append") {
        await appendBlock(summaryMarkdown, docId);
      } else {
        await insertBlockBefore(summaryMarkdown, target.nextId, docId);
      }

      showMessage("已插入 AI 文档摘要", 5000, "info");
    },
    "mark-irrelevant-paragraphs": async (docId) => {
      const blocks = await getChildBlocksByParentId(docId);
      const scopedBlocks = resolveBlocksForIrrelevantMarking(blocks);
      const paragraphs = scopedBlocks
        .filter((block) => isParagraphLikeBlockType(block.type))
        .filter((block) => Boolean((block.markdown || "").trim()))
        .filter((block) => !isFullyStruckParagraph(block.markdown || ""))
        .map((block) => ({
          id: block.id,
          markdown: (block.markdown || "").trim(),
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

      const markedIds = await detectIrrelevantParagraphIds({
        config: options.getAiSummaryConfig?.(),
        documentTitle: docMeta?.title,
        paragraphs,
      });
      const paragraphMap = new Map(paragraphs.map((item) => [item.id, item]));
      const updates = markedIds
        .map((id) => paragraphMap.get(id))
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .map((item) => ({
          id: item.id,
          markdown: wrapParagraphWithStrikethrough(item.markdown),
        }))
        .filter((item) => item.markdown && item.markdown !== paragraphMap.get(item.id)?.markdown);

      if (!updates.length) {
        showMessage("AI 未识别出需要标记的口水内容", 5000, "info");
        return;
      }

      const ok = options.askConfirmWithVisibleDialog
        ? await options.askConfirmWithVisibleDialog(
          "确认标记口水内容",
          `AI 判定可标记 ${updates.length} 段。将为 ${updates.length} 个块添加删除线，是否继续？`
        )
        : true;
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

      const summary = `已标记口水内容 ${updatedBlockCount} 段，共更新 ${updatedBlockCount} 个块`;
      if (failedBlockCount > 0) {
        showMessage(`${summary}，失败 ${failedBlockCount} 个块`, 7000, "error");
        return;
      }
      showMessage(summary, 5000, "info");
    },
  };
}

function isParagraphLikeBlockType(type: string): boolean {
  const normalized = (type || "").trim().toLowerCase();
  return (
    normalized === "p" ||
    normalized === "paragraph" ||
    normalized === "nodeparagraph"
  );
}

function isFullyStruckParagraph(markdown: string): boolean {
  return /^\s*~~[\s\S]+~~\s*$/u.test(markdown || "");
}

function wrapParagraphWithStrikethrough(markdown: string): string {
  const value = markdown || "";
  if (!value || isFullyStruckParagraph(value)) {
    return value;
  }

  const lines = value.split(/\r?\n/);
  const ialLines: string[] = [];
  let contentEndIndex = lines.length - 1;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      continue;
    }
    if (/^\{:/.test(trimmed)) {
      ialLines.unshift(lines[index]);
      contentEndIndex = index - 1;
      continue;
    }
    break;
  }

  const content = lines.slice(0, contentEndIndex + 1).join("\n");
  if (!content) {
    return value;
  }

  const wrapped = `~~${content}~~`;
  return ialLines.length ? `${wrapped}\n${ialLines.join("\n")}` : wrapped;
}

function resolveBlocksForIrrelevantMarking<
  T extends { markdown?: string }
>(blocks: T[]): T[] {
  const separatorIndex = blocks
    .slice(0, 10)
    .findIndex((item) => (item.markdown || "").trim() === "---");
  if (separatorIndex < 0) {
    return blocks;
  }
  return blocks.slice(separatorIndex + 1);
}
