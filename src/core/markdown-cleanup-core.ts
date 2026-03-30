export {
  removeExtraBlankLinesFromMarkdown,
  removeTrailingWhitespaceFromDom,
  removeTrailingWhitespaceFromMarkdown,
  removeClippedListPrefixesFromMarkdown,
  splitBilingualParagraphMarkdown,
} from "@/core/markdown-cleanup-text-core";
export type {
  BilingualParagraphSplitResult,
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
  findDeleteFromCurrentBlockIds,
  findExtraBlankParagraphIds,
  findHeadingMissingBlankParagraphBeforeIds,
} from "@/core/markdown-cleanup-block-core";
export type {
  BlankParagraphCleanupResult,
  DeleteFromCurrentBlockResult,
  HeadingBlankParagraphInsertResult,
  ParagraphBlockMeta,
} from "@/core/markdown-cleanup-block-core";
