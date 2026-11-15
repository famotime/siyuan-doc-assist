/**
 * 清理动作确认弹窗预览纯逻辑
 * 原 action-runner-cleanup-handlers.ts 中预览函数的纯搬移，逻辑零改动
 */

import { cleanupAiOutputArtifactsInMarkdown } from "@/core/markdown-cleanup-ai-core";
import { removeStrikethroughMarkedContentFromMarkdown } from "@/core/markdown-cleanup-core";

export type AiOutputCleanupPreview = {
  cleanableBlockCount: number;
  riskyPendingBlockCount: number;
  removedSupCount: number;
  removedCaretCount: number;
  removedInternetLinkCount: number;
  removedHiddenSpanCount: number;
  removedRefCount: number;
  removedDividerCount: number;
};

export type StrikethroughCleanupPreview = {
  cleanableBlockCount: number;
  riskyPendingBlockCount: number;
  removedCount: number;
};

export function isHighRiskForMarkdownWrite(value: string): boolean {
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

export function isThematicBreakBlock(block: { type?: string; markdown?: string }): boolean {
  const type = (block.type || "").trim().toLowerCase();
  if (type === "b" || type === "tb" || type === "thematicbreak" || type === "nodethematicbreak") {
    return true;
  }
  const source = (block.markdown || "").trim();
  return /^(?:(?:\-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(source);
}

export function previewAiOutputCleanup(
  blocks: Array<{ id: string; type?: string; markdown?: string }>
): AiOutputCleanupPreview {
  const preview: AiOutputCleanupPreview = {
    cleanableBlockCount: 0,
    riskyPendingBlockCount: 0,
    removedSupCount: 0,
    removedCaretCount: 0,
    removedInternetLinkCount: 0,
    removedHiddenSpanCount: 0,
    removedRefCount: 0,
    removedDividerCount: 0,
  };

  for (const block of blocks) {
    const source = block.markdown || "";
    const isDivider = isThematicBreakBlock(block);
    if (!source && !isDivider) {
      continue;
    }
    const cleaned = cleanupAiOutputArtifactsInMarkdown(source);
    if (isDivider && cleaned.removedDividerCount === 0) {
      cleaned.removedDividerCount = 1;
      cleaned.removedCount += 1;
      cleaned.markdown = "";
    }
    const hasChanges = cleaned.removedCount > 0 && (cleaned.markdown !== source || isDivider);
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
    preview.removedHiddenSpanCount += cleaned.removedHiddenSpanCount;
    preview.removedRefCount += cleaned.removedRefCount;
    preview.removedDividerCount += cleaned.removedDividerCount;
  }

  return preview;
}

export function previewStrikethroughCleanup(
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
