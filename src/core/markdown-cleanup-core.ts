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
  findConsecutiveBlockquoteMerges,
  findDeleteFromCurrentBlockIds,
  findDeleteFromStartToCurrentBlockIds,
  findEmptyCodeBlockIds,
  findExtraBlankParagraphIds,
  findHeadingMissingBlankParagraphBeforeIds,
  findSelectFromStartToCurrentBlockIds,
  findSelectFromCurrentToEndBlockIds,
  isBlockquoteBlock,
  isBlockquoteBlockType,
  isCodeBlockType,
  isEmptyCodeBlock,
} from "@/core/markdown-cleanup-block-core";
export type {
  BlankParagraphCleanupResult,
  ClippedBlockquoteMerge,
  ClippedBlockquoteMergeResult,
  ClippedListContinuationMerge,
  ClippedListContinuationMergeResult,
  DeleteFromCurrentBlockResult,
  EmptyCodeBlockCleanupResult,
  HeadingBlankParagraphInsertResult,
  ParagraphBlockMeta,
  SelectBlockRangeResult,
} from "@/core/markdown-cleanup-block-core";

