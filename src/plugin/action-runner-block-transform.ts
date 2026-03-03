type TransformableBlock = {
  id: string;
  markdown?: string;
};

type BlockTransformBaseResult = {
  markdown: string;
  changedCount: number;
};

type ApplyBlockMarkdownTransformOptions<T extends BlockTransformBaseResult> = {
  blocks: TransformableBlock[];
  isHighRisk: (source: string, block: TransformableBlock) => boolean;
  transform: (source: string, block: TransformableBlock) => T;
  updateBlockMarkdown: (id: string, markdown: string) => Promise<void>;
  onUpdated?: (result: T, block: TransformableBlock) => void;
};

export type ApplyBlockMarkdownTransformReport = {
  changedCount: number;
  updatedBlockCount: number;
  failedBlockCount: number;
  skippedRiskyIds: string[];
};

export async function applyMarkdownTransformToBlocks<T extends BlockTransformBaseResult>(
  options: ApplyBlockMarkdownTransformOptions<T>
): Promise<ApplyBlockMarkdownTransformReport> {
  const {
    blocks,
    isHighRisk,
    transform,
    updateBlockMarkdown,
    onUpdated,
  } = options;

  let changedCount = 0;
  let updatedBlockCount = 0;
  let failedBlockCount = 0;
  const skippedRiskyIds: string[] = [];

  for (const block of blocks) {
    const source = block.markdown || "";
    if (!source) {
      continue;
    }
    if (isHighRisk(source, block)) {
      skippedRiskyIds.push(block.id);
      continue;
    }
    const transformed = transform(source, block);
    if (transformed.changedCount <= 0 || transformed.markdown === source) {
      continue;
    }
    try {
      await updateBlockMarkdown(block.id, transformed.markdown);
      updatedBlockCount += 1;
      changedCount += transformed.changedCount;
      onUpdated?.(transformed, block);
    } catch {
      failedBlockCount += 1;
    }
  }

  return {
    changedCount,
    updatedBlockCount,
    failedBlockCount,
    skippedRiskyIds,
  };
}
