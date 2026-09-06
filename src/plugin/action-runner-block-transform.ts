import { ProtyleLike } from "@/plugin/doc-context";
import { IOperation, resolveSubmitBlockElement, runProtyleTransaction } from "@/plugin/transaction-runner";
import { renderKramdownToBlockDOM } from "@/services/kernel";

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
  protyle?: ProtyleLike;
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
    protyle,
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
    
    let appliedTransaction = false;
    if (protyle) {
      const liveDom = resolveSubmitBlockElement(protyle, block.id);
      if (liveDom) {
        const newHtml = await renderKramdownToBlockDOM(transformed.markdown, protyle);
        if (newHtml) {
          const doOperations: IOperation[] = [{ action: "update", id: block.id, data: newHtml }];
          const undoOperations: IOperation[] = [{ action: "update", id: block.id, data: liveDom.outerHTML }];
          if (runProtyleTransaction(protyle, doOperations, undoOperations)) {
            appliedTransaction = true;
          }
        }
      }
    }

    try {
      if (!appliedTransaction) {
        await updateBlockMarkdown(block.id, transformed.markdown);
      }
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
