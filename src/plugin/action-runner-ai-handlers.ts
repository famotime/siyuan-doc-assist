import { showMessage } from "siyuan";
import { AiServiceConfig } from "@/core/ai-service-config-core";
import {
  buildAiSummaryBlockMarkdown,
  resolveAiSummaryInsertTarget,
} from "@/core/ai-summary-core";
import {
  generateDocumentConceptMap,
  generateDocumentSummary,
} from "@/services/ai-summary";
import { recognizeDocImages } from "@/services/ai-image-ocr";
import { NetworkLensPluginLike, loadFreshNetworkLensDocumentSummary } from "@/services/network-lens-ai-index";
import {
  detectIrrelevantParagraphMarks,
  detectKeyContentParagraphHighlights,
} from "@/services/ai-slop-marker";
import {
  appendBlock,
  createDocWithMd,
  getBlockAttrs,
  getChildBlocksByParentId,
  getDocMetaByID,
  getRootDocRawMarkdown,
  insertBlockBefore,
  setBlockAttrs,
  updateBlockMarkdown,
} from "@/services/kernel";
import { PartialActionHandlerMap } from "@/plugin/action-runner-dispatcher";
import type { ConfirmDetailItem } from "@/plugin/action-runner";

type CreateAiActionHandlersOptions = {
  getAiSummaryConfig?: () => AiServiceConfig | undefined;
  askConfirmWithVisibleDialog?: (
    title: string,
    text: string,
    detailItems?: ConfirmDetailItem[]
  ) => Promise<boolean>;
  resolveNetworkLensPlugin?: () => NetworkLensPluginLike | null | undefined;
  setBusy?: (busy: boolean) => void;
};

type RelatedSuggestion = {
  targetDocumentId: string;
  targetTitle: string;
  confidence?: string;
  reason?: string;
  tagSuggestions: Array<{
    tag: string;
    source?: string;
    reason?: string;
  }>;
};

type RelatedSuggestionPayload = {
  summary: string;
  suggestions: RelatedSuggestion[];
};

export function createAiActionHandlers(
  options: CreateAiActionHandlersOptions = {}
): PartialActionHandlerMap {
  return {
    "create-doc-concept-map": async (docId) => {
      const documentMarkdown = (await getRootDocRawMarkdown(docId)).trim();
      if (!documentMarkdown) {
        showMessage("当前文档没有可供生成概念地图的正文", 5000, "info");
        return;
      }

      const docMeta = await getDocMetaByID(docId).catch(() => null);
      if (!docMeta?.box) {
        throw new Error("未找到当前文档信息，无法生成概念地图");
      }

      const conceptMap = await generateDocumentConceptMap({
        config: options.getAiSummaryConfig?.(),
        documentTitle: docMeta.title,
        documentMarkdown,
      });
      const title = buildConceptMapDocTitle(docMeta.title);
      const path = joinChildDocHPath(docMeta.hPath, title);
      const conceptDocId = await createDocWithMd(docMeta.box, path, conceptMap);
      openDocByProtocol(conceptDocId);
      showMessage("已生成概念地图子文档", 5000, "info");
    },
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

      const marks = await detectIrrelevantParagraphMarks({
        config: options.getAiSummaryConfig?.(),
        documentTitle: docMeta?.title,
        paragraphs,
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
            detailLabels: result.detailLabels.length
              ? result.detailLabels
              : [toConfirmDetailText(paragraph.markdown)],
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
          label: truncateForDisplay(label, 200),
        }))
      );

      const ok = options.askConfirmWithVisibleDialog
        ? await options.askConfirmWithVisibleDialog(
          "确认标记口水内容",
          `AI 判定可标记 ${markedCount} 处，涉及 ${updates.length} 个块。将为对应内容添加删除线，是否继续？`,
          detailItems
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

      const detailItems: ConfirmDetailItem[] = highlightResults
        .filter((item) => paragraphMap.has(item.paragraphId))
        .flatMap((item) => item.highlights.map((highlight) => ({
          label: truncateForDisplay(stripMarkdownMarkersForDisplay(highlight), 200),
        })));

      const ok = options.askConfirmWithVisibleDialog
        ? await options.askConfirmWithVisibleDialog(
          "确认标记关键内容",
          `AI 判定可标记 ${updates.length} 段关键内容。将为 ${updates.length} 个块添加局部加粗，是否继续？`,
          detailItems
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
    "recognize-doc-images": async (docId) => {
      const report = await recognizeDocImages({
        config: options.getAiSummaryConfig?.(),
        docId,
        onProgress: (current, total, assetPath) => {
          const basename = assetPath.split("/").filter(Boolean).pop() || assetPath;
          showMessage(`图片文字识别中（${current}/${total}）：${basename}`, 3000, "info");
        },
      });
      if (report.scannedImageCount <= 0) {
        showMessage("当前文档未发现可识别的本地图片", 5000, "info");
        return;
      }
      if (report.insertedCount <= 0) {
        if (report.failedCount > 0) {
          showMessage(`图片文字识别失败 ${report.failedCount} 张，请检查 AI 服务配置`, 7000, "error");
          return;
        }
        showMessage("图片中未识别出文字内容", 5000, "info");
        return;
      }
      const suffix = report.failedCount > 0 ? `，失败 ${report.failedCount} 张` : "";
      showMessage(
        `图片文字识别完成：识别 ${report.recognizedCount} 张，插入 ${report.insertedCount} 条引用${suffix}`,
        report.failedCount > 0 ? 7000 : 6000,
        report.failedCount > 0 ? "error" : "info",
      );
    },
    "add-related-links-and-tags": async (docId) => {
      const lensPlugin = options.resolveNetworkLensPlugin?.();
      if (!lensPlugin) {
        showMessage("未安装脉络镜插件，无法添加相关链接和标签", 5000, "error");
        return;
      }
      const wikiProvider = lensPlugin.getWikiCommandIntegration?.();
      if (!wikiProvider) {
        showMessage("脉络镜插件版本不支持 AI 关联建议命令，请更新插件", 5000, "error");
        return;
      }

      const result = await wikiProvider.invokeCommand("suggest-orphan-links-and-tags", {
        trigger: "manual",
        sourcePlugin: "siyuan-doc-assist",
        themeDocumentId: docId,
      });
      if (!result.ok) {
        showMessage(result.message || "AI 关联建议生成失败", 5000, "error");
        return;
      }

      const payload = normalizeRelatedSuggestionPayload(result.data);
      const links = dedupeRelatedSuggestions(payload.suggestions);
      const tagItems = dedupeTagSuggestionItems(
        links.flatMap((item) => item.tagSuggestions)
      );
      const tags = tagItems.map((item) => item.tag);
      if (!links.length && !tags.length) {
        showMessage("AI 未返回可添加的相关链接或标签", 5000, "info");
        return;
      }

      const detailItems: ConfirmDetailItem[] = [
        ...links.map((item) => ({
          id: `link:${item.targetDocumentId}`,
          label: `链接：${item.targetTitle}`,
          description: item.reason || item.confidence || undefined,
          selectable: true,
          selected: true,
          tone: "link" as const,
        })),
        ...tagItems.map((item) => ({
          id: `tag:${item.tag}`,
          label: `标签：${item.tag}`,
          description: item.reason || item.source || undefined,
          selectable: true,
          selected: true,
          tone: "tag" as const,
        })),
      ];
      const summary = payload.summary || `AI 建议添加相关链接 ${links.length} 个、标签 ${tags.length} 个。`;
      const ok = options.askConfirmWithVisibleDialog
        ? await options.askConfirmWithVisibleDialog(
          "确认添加相关链接和标签",
          `${summary}\n\n确认后会在当前文档开头插入一个链接段落，并把建议标签写入当前文档。是否继续？`,
          detailItems
        )
        : true;
      if (!ok) {
        return;
      }
      options.setBusy?.(true);

      const selectedIds = new Set(
        detailItems
          .filter((item) => item.selected !== false)
          .map((item) => item.id)
          .filter((id): id is string => Boolean(id))
      );
      const selectedLinks = links.filter((item) => selectedIds.has(`link:${item.targetDocumentId}`));
      const selectedTags = tags.filter((tag) => selectedIds.has(`tag:${tag}`));

      if (!selectedLinks.length && !selectedTags.length) {
        showMessage("未选择要添加的相关链接或标签", 5000, "info");
        return;
      }

      if (selectedLinks.length) {
        const linkMarkdown = selectedLinks
          .map((item) => buildDocRefMarkdown(item.targetDocumentId, item.targetTitle))
          .join("    ");
        const blocks = await getChildBlocksByParentId(docId);
        const firstBlock = blocks[0];
        if (firstBlock?.id) {
          await insertBlockBefore(linkMarkdown, firstBlock.id, docId);
        } else {
          await appendBlock(linkMarkdown, docId);
        }
      }

      if (selectedTags.length) {
        const attrs = await getBlockAttrs(docId);
        const nextTags = mergeTags(parseTagAttr(attrs.tags), selectedTags);
        await setBlockAttrs(docId, { tags: nextTags.join(",") });
      }

      showMessage(`已添加相关链接 ${selectedLinks.length} 个、标签 ${selectedTags.length} 个`, 5000, "info");
    },
    "generate-llm-wiki": async (docId) => {
      const lensPlugin = options.resolveNetworkLensPlugin?.();
      if (!lensPlugin) {
        showMessage("未安装脉络镜插件，无法生成 Wiki 文档", 5000, "error");
        return;
      }
      const wikiProvider = lensPlugin.getWikiCommandIntegration?.();
      if (!wikiProvider) {
        showMessage("脉络镜插件版本不支持 Wiki 命令，请更新插件", 5000, "error");
        return;
      }
      const result = await wikiProvider.invokeCommand("generate-llm-wiki", {
        trigger: "manual",
        sourcePlugin: "siyuan-doc-assist",
        themeDocumentId: docId,
      });
      if (!result.ok) {
        showMessage(result.message || "Wiki 文档生成失败", 5000, "error");
        return;
      }
      showMessage(result.message || "Wiki 文档生成完成", 5000, "info");
    },
  };
}

function normalizeRelatedSuggestionPayload(value: unknown): RelatedSuggestionPayload {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const suggestions = Array.isArray(source.suggestions)
    ? source.suggestions
      .map(normalizeRelatedSuggestion)
      .filter((item): item is RelatedSuggestion => Boolean(item))
    : [];
  return {
    summary: typeof source.summary === "string" ? source.summary.trim() : "",
    suggestions,
  };
}

function normalizeRelatedSuggestion(value: unknown): RelatedSuggestion | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Record<string, unknown>;
  const targetDocumentId = typeof source.targetDocumentId === "string" ? source.targetDocumentId.trim() : "";
  const targetTitle = typeof source.targetTitle === "string" ? source.targetTitle.trim() : "";
  if (!targetDocumentId || !targetTitle) {
    return null;
  }
  const tagSuggestions = Array.isArray(source.tagSuggestions)
    ? source.tagSuggestions
      .map(normalizeTagSuggestion)
      .filter((item): item is RelatedSuggestion["tagSuggestions"][number] => Boolean(item))
    : [];
  return {
    targetDocumentId,
    targetTitle,
    confidence: typeof source.confidence === "string" ? source.confidence.trim() : undefined,
    reason: typeof source.reason === "string" ? source.reason.trim() : undefined,
    tagSuggestions,
  };
}

function normalizeTagSuggestion(value: unknown): RelatedSuggestion["tagSuggestions"][number] | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Record<string, unknown>;
  const tag = typeof source.tag === "string" ? source.tag.trim() : "";
  if (!tag) {
    return null;
  }
  return {
    tag,
    source: typeof source.source === "string" ? source.source.trim() : undefined,
    reason: typeof source.reason === "string" ? source.reason.trim() : undefined,
  };
}

function dedupeRelatedSuggestions(suggestions: RelatedSuggestion[]): RelatedSuggestion[] {
  const seen = new Set<string>();
  const result: RelatedSuggestion[] = [];
  for (const suggestion of suggestions) {
    if (seen.has(suggestion.targetDocumentId)) {
      continue;
    }
    seen.add(suggestion.targetDocumentId);
    result.push(suggestion);
  }
  return result;
}

function dedupeTagSuggestionItems(
  items: RelatedSuggestion["tagSuggestions"]
): RelatedSuggestion["tagSuggestions"] {
  const seen = new Set<string>();
  const result: RelatedSuggestion["tagSuggestions"] = [];
  for (const item of items) {
    const key = item.tag.toLocaleLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

function buildDocRefMarkdown(documentId: string, title: string): string {
  const escaped = title.replace(/"/gu, "\\\"");
  return `((${documentId} "${escaped}"))`;
}

function parseTagAttr(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }
  return value.split(/[,\s#]+/u).map((item) => item.trim()).filter(Boolean);
}

function mergeTags(baseTags: string[], extraTags: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const rawTag of [...baseTags, ...extraTags]) {
    const tag = rawTag.trim();
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(tag);
  }
  return result;
}

function truncateForDisplay(text: string, maxLen: number): string {
  const value = (text || "").replace(/[\r\n]+/gu, " ").trim();
  return value.length > maxLen ? `${value.slice(0, maxLen)}…` : value;
}

function openDocByProtocol(blockId: string) {
  const url = `siyuan://blocks/${blockId}`;
  try {
    window.open(url);
  } catch {
    window.location.href = url;
  }
}

function buildConceptMapDocTitle(docTitle: string, now = new Date()): string {
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const prefix = (docTitle || "").trim();
  return `${prefix ? `${prefix}-` : ""}概念地图-${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

function joinChildDocHPath(parentHPath: string, title: string): string {
  const base = (parentHPath || "").trim().replace(/\/+$/u, "");
  if (!base) {
    return `/${title}`;
  }
  return `${base}/${title}`;
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

function applyStrikethroughToIrrelevantSegments(
  markdown: string,
  segments: string[]
): { markdown: string; markedCount: number; detailLabels: string[] } {
  const normalizedSegments = Array.isArray(segments)
    ? segments.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];
  if (!normalizedSegments.length) {
    const wrapped = wrapParagraphWithStrikethrough(markdown);
    return {
      markdown: wrapped,
      markedCount: wrapped !== markdown ? 1 : 0,
      detailLabels: [],
    };
  }

  const lines = (markdown || "").split(/\r?\n/);
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

  let content = lines.slice(0, contentEndIndex + 1).join("\n");
  const contentText = content.trim();
  let markedCount = 0;
  const detailLabels: string[] = [];

  for (const segment of normalizedSegments) {
    if (isWholeMixedParagraphSegment(contentText, segment)) {
      continue;
    }
    const next = replaceAllPlainSegmentsWithStrikethrough(content, segment);
    if (next.count <= 0) {
      continue;
    }
    content = next.markdown;
    markedCount += next.count;
    for (let index = 0; index < next.count; index += 1) {
      detailLabels.push(stripMarkdownMarkersForDisplay(segment));
    }
  }

  const nextMarkdown = ialLines.length ? `${content}\n${ialLines.join("\n")}` : content;
  return {
    markdown: nextMarkdown,
    markedCount,
    detailLabels,
  };
}

function stripMarkdownMarkersForDisplay(markdown: string): string {
  return (markdown || "")
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/__([^_]+)__/gu, "$1")
    .replace(/~~([^~]+)~~/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .trim();
}

function isWholeMixedParagraphSegment(markdown: string, segment: string): boolean {
  const normalizedMarkdown = (markdown || "").trim();
  const normalizedSegment = (segment || "").trim();
  if (!normalizedMarkdown || normalizedMarkdown !== normalizedSegment) {
    return false;
  }
  return countSentenceLikeUnits(normalizedMarkdown) > 1;
}

function countSentenceLikeUnits(value: string): number {
  const compact = (value || "")
    .replace(/~~/gu, "")
    .replace(/`[^`]*`/gu, "")
    .trim();
  if (!compact) {
    return 0;
  }
  const matches = compact.match(/[。！？!?；;]+/gu);
  if (matches?.length) {
    return matches.length;
  }
  return compact.split(/\s{2,}|\n+/u).filter(Boolean).length;
}

function replaceAllPlainSegmentsWithStrikethrough(
  markdown: string,
  segment: string
): { markdown: string; count: number } {
  if (!markdown || !segment) {
    return { markdown, count: 0 };
  }

  let next = "";
  let cursor = 0;
  let count = 0;
  while (cursor < markdown.length) {
    const index = markdown.indexOf(segment, cursor);
    if (index < 0) {
      next += markdown.slice(cursor);
      break;
    }
    if (isInsideStrikethrough(markdown, index)) {
      next += markdown.slice(cursor, index + segment.length);
      cursor = index + segment.length;
      continue;
    }
    next += `${markdown.slice(cursor, index)}~~${segment}~~`;
    cursor = index + segment.length;
    count += 1;
  }

  return { markdown: next, count };
}

function isInsideStrikethrough(markdown: string, index: number): boolean {
  const before = markdown.slice(0, index).match(/~~/gu)?.length || 0;
  return before % 2 === 1;
}

function toConfirmDetailText(markdown: string): string {
  const value = markdown || "";
  if (!value) {
    return "";
  }

  const lines = value.split(/\r?\n/);
  while (lines.length > 0) {
    const trimmed = lines[lines.length - 1].trim();
    if (!trimmed) {
      lines.pop();
      continue;
    }
    if (/^\{:/.test(trimmed)) {
      lines.pop();
      continue;
    }
    break;
  }

  return stripMarkdownMarkersForDisplay(
    lines.join("\n").trim().replace(/^~~([\s\S]+)~~$/u, "$1").trim()
  );
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
