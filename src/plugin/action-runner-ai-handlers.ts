import { showMessage } from "siyuan";
import { AiServiceConfig } from "@/core/ai-service-config-core";
import {
  buildAiSummaryBlockMarkdown,
  resolveAiSummaryInsertTarget,
} from "@/core/ai-summary-core";
import { generateDocumentSummary } from "@/services/ai-summary";
import { NetworkLensPluginLike, loadFreshNetworkLensDocumentSummary } from "@/services/network-lens-ai-index";
import {
  detectIrrelevantParagraphIds,
  detectKeyContentParagraphHighlights,
} from "@/services/ai-slop-marker";
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
  resolveNetworkLensPlugin?: () => NetworkLensPluginLike | null | undefined;
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
        documentId: docId,
        documentTitle: docMeta?.title,
        documentUpdatedAt: docMeta?.updated,
        documentMarkdown,
        loadFreshDocumentSummary: async (params) => loadFreshNetworkLensDocumentSummary({
          networkLensPlugin: options.resolveNetworkLensPlugin?.(),
          documentId: params.documentId,
          documentUpdatedAt: params.documentUpdatedAt,
        }),
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
      const scopedBlocks = resolveBlocksAfterOpeningSeparator(blocks);
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
    "mark-key-content": async (docId) => {
      const blocks = await getChildBlocksByParentId(docId);
      const scopedBlocks = resolveBlocksAfterOpeningSeparator(blocks);
      const paragraphs = scopedBlocks
        .filter((block) => isParagraphLikeBlockType(block.type))
        .filter((block) => Boolean((block.markdown || "").trim()))
        .map((block) => ({
          id: block.id,
          markdown: (block.markdown || "").trim(),
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
        paragraphs,
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
            markdown: applyBoldToParagraphHighlights(paragraph.markdown, item.highlights),
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .filter((item) => item.markdown && item.markdown !== paragraphMap.get(item.id)?.markdown);

      if (!updates.length) {
        showMessage("AI 未识别出可加粗的关键内容", 5000, "info");
        return;
      }

      const ok = options.askConfirmWithVisibleDialog
        ? await options.askConfirmWithVisibleDialog(
          "确认标记关键内容",
          `AI 判定可标记 ${updates.length} 段关键内容。将为 ${updates.length} 个块添加局部加粗，是否继续？`
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
        showMessage("关键内容标记失败，请稍后重试", 7000, "error");
        return;
      }

      const summary = `已标记关键内容 ${updatedBlockCount} 段，共更新 ${updatedBlockCount} 个块`;
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

function resolveBlocksAfterOpeningSeparator<
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

function applyBoldToParagraphHighlights(markdown: string, highlights: string[]): string {
  const value = markdown || "";
  const normalizedHighlights = Array.isArray(highlights)
    ? highlights.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];
  if (!value || !normalizedHighlights.length) {
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
  const ranges = collectBoldHighlightRanges(content, normalizedHighlights);
  if (!content || !ranges.length) {
    return value;
  }

  let nextContent = content;
  const sortedRanges = [...ranges].sort((left, right) => right.start - left.start);
  for (const range of sortedRanges) {
    nextContent =
      `${nextContent.slice(0, range.start)}**${nextContent.slice(range.start, range.end)}**${nextContent.slice(range.end)}`;
  }

  return ialLines.length ? `${nextContent}\n${ialLines.join("\n")}` : nextContent;
}

type TextRange = {
  start: number;
  end: number;
};

function collectBoldHighlightRanges(content: string, highlights: string[]): TextRange[] {
  if (!content.trim()) {
    return [];
  }

  const existingBoldRanges = collectExistingBoldTextRanges(content);
  const wholeContent = content.trim();
  const candidates: TextRange[] = [];

  for (const highlight of [...new Set(highlights)].sort((left, right) => right.length - left.length)) {
    const highlightRanges = findHighlightRangesInContent(content, highlight);
    for (const range of highlightRanges) {
      const matched = content.slice(range.start, range.end);
      if (
        matched.trim() &&
        matched.trim() !== wholeContent &&
        !hasRangeOverlap(existingBoldRanges, range.start, range.end)
      ) {
        candidates.push(range);
      }
    }
  }

  const selected: TextRange[] = [];
  const sortedCandidates = candidates.sort((left, right) => {
    const lengthDelta = (right.end - right.start) - (left.end - left.start);
    if (lengthDelta !== 0) {
      return lengthDelta;
    }
    return left.start - right.start;
  });

  for (const candidate of sortedCandidates) {
    if (hasRangeOverlap(existingBoldRanges, candidate.start, candidate.end)) {
      continue;
    }
    if (hasRangeOverlap(selected, candidate.start, candidate.end)) {
      continue;
    }
    selected.push(candidate);
  }

  return selected.sort((left, right) => left.start - right.start);
}

function collectExistingBoldTextRanges(content: string): TextRange[] {
  const ranges: TextRange[] = [];
  const pattern = /(?<!\\)\*\*([\s\S]+?)(?<!\\)\*\*/gu;
  let match = pattern.exec(content);
  while (match) {
    const fullMatch = match[0] || "";
    if (fullMatch.length >= 4) {
      ranges.push({
        start: match.index + 2,
        end: match.index + fullMatch.length - 2,
      });
    }
    match = pattern.exec(content);
  }
  return ranges;
}

function hasRangeOverlap(ranges: TextRange[], start: number, end: number): boolean {
  return ranges.some((range) => start < range.end && end > range.start);
}

function findHighlightRangesInContent(content: string, highlight: string): TextRange[] {
  const exactMatches = findExactHighlightRanges(content, highlight);
  if (exactMatches.length > 0) {
    return exactMatches;
  }

  return findLooseHighlightRanges(content, highlight);
}

function findExactHighlightRanges(content: string, highlight: string): TextRange[] {
  const ranges: TextRange[] = [];
  let fromIndex = 0;
  while (fromIndex < content.length) {
    const start = content.indexOf(highlight, fromIndex);
    if (start < 0) {
      break;
    }
    ranges.push({ start, end: start + highlight.length });
    fromIndex = start + Math.max(1, highlight.length);
  }
  return ranges;
}

function findLooseHighlightRanges(content: string, highlight: string): TextRange[] {
  const ranges: TextRange[] = [];
  const normalizedContent = normalizeSearchableText(content);
  const normalizedHighlight = normalizeSearchableText(highlight);
  if (!normalizedHighlight.text) {
    return ranges;
  }

  let fromIndex = 0;
  while (fromIndex < normalizedContent.text.length) {
    const start = normalizedContent.text.indexOf(normalizedHighlight.text, fromIndex);
    if (start < 0) {
      break;
    }
    const startOriginal = normalizedContent.indexMap[start];
    const endOriginalInclusive = normalizedContent.indexMap[
      start + normalizedHighlight.text.length - 1
    ];
    if (startOriginal !== undefined && endOriginalInclusive !== undefined) {
      ranges.push({
        start: startOriginal,
        end: endOriginalInclusive + 1,
      });
    }
    fromIndex = start + Math.max(1, normalizedHighlight.text.length);
  }

  return ranges;
}

function normalizeSearchableText(value: string): { text: string; indexMap: number[] } {
  const textParts: string[] = [];
  const indexMap: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (!char || shouldIgnoreForLooseSearch(value, index)) {
      continue;
    }
    textParts.push(char);
    indexMap.push(index);
  }
  return {
    text: textParts.join(""),
    indexMap,
  };
}

function shouldIgnoreForLooseSearch(value: string, index: number): boolean {
  const char = value[index];
  if (!char) {
    return true;
  }
  if (/\s/u.test(char)) {
    return true;
  }
  if (
    char === "*" &&
    ((index > 0 && value[index - 1] === "*") || (index + 1 < value.length && value[index + 1] === "*"))
  ) {
    return true;
  }
  return false;
}
