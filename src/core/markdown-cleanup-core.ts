export {
  removeStrikethroughMarkedContentFromMarkdown,
  removeExtraBlankLinesFromMarkdown,
  removeTrailingWhitespaceFromDom,
  removeTrailingWhitespaceFromMarkdown,
  removeClippedListPrefixesFromMarkdown,
  splitBilingualParagraphMarkdown,
} from "@/core/markdown-cleanup-text-core";
export type {
  BilingualParagraphSplitResult,
  StrikethroughCleanupResult,
  TrailingWhitespaceCleanupResult,
  TrailingWhitespaceDomCleanupResult,
} from "@/core/markdown-cleanup-text-core";

export {
  cleanupAiOutputArtifactsInMarkdown,
} from "@/core/markdown-cleanup-ai-core";
export type {
  AiOutputCleanupResult,
} from "@/core/markdown-cleanup-ai-core";

export {
  findClippedListContinuationMerges,
  findDeleteFromCurrentBlockIds,
  findDeleteFromStartToCurrentBlockIds,
  findExtraBlankParagraphIds,
  findHeadingMissingBlankParagraphBeforeIds,
  findSelectFromStartToCurrentBlockIds,
  findSelectFromCurrentToEndBlockIds,
} from "@/core/markdown-cleanup-block-core";
export type {
  BlankParagraphCleanupResult,
  ClippedListContinuationMerge,
  ClippedListContinuationMergeResult,
  DeleteFromCurrentBlockResult,
  HeadingBlankParagraphInsertResult,
  ParagraphBlockMeta,
  SelectBlockRangeResult,
} from "@/core/markdown-cleanup-block-core";
