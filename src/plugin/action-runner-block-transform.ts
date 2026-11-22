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
    protyle
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
    skippedRiskyIds
  };
}

export type DeleteBlocksWithTransactionFallbackOptions = {
  docId: string;
  protyle?: ProtyleLike;
  blocks: Array<{ id: string }>;
  deleteIds: string[];
  getBlockDOMs: (ids: string[]) => Promise<Array<{ id: string; dom: string }>>;
  deleteBlocksByIds: (
    ids: string[],
    options?: { concurrency?: number }
  ) => Promise<{ deletedCount: number; failedIds: string[] }>;
  concurrency?: number;
};

export type DeleteBlocksWithTransactionFallbackResult = {
  usedTransaction: boolean;
  deletedCount: number;
  failedCount: number;
};

export async function deleteBlocksWithTransactionFallback(
  options: DeleteBlocksWithTransactionFallbackOptions
): Promise<DeleteBlocksWithTransactionFallbackResult> {
  const {
    docId,
    protyle,
    blocks,
    deleteIds,
    getBlockDOMs,
    deleteBlocksByIds,
    concurrency
  } = options;

  if (protyle) {
    const doOperations: IOperation[] = [];
    const undoOperations: IOperation[] = [];
    let canUseTransaction = true;

    const domRes = await getBlockDOMs(deleteIds);
    const domMap = new Map(domRes.map((r) => [r.id, r.dom]));

    for (const deleteId of deleteIds) {
      const domStr = domMap.get(deleteId);
      if (!domStr) {
        console.warn(`[doc-assist] Fallback: Block ${deleteId} DOM not returned by backend`);
        canUseTransaction = false;
        break;
      }

      const blockIndex = blocks.findIndex((b) => b.id === deleteId);
      const previousID = blockIndex > 0 ? blocks[blockIndex - 1].id : undefined;

      doOperations.push({ action: "delete", id: deleteId });
      undoOperations.push({
        action: "insert",
        id: deleteId,
        data: domStr,
        previousID,
        parentID: docId
      });
    }

    if (canUseTransaction && runProtyleTransaction(protyle, doOperations, undoOperations)) {
      return {
        usedTransaction: true,
        deletedCount: deleteIds.length,
        failedCount: 0
      };
    }
  }

  const deleteResult = await deleteBlocksByIds(
    deleteIds,
    concurrency !== undefined ? { concurrency } : undefined
  );
  return {
    usedTransaction: false,
    deletedCount: deleteResult.deletedCount,
    failedCount: deleteResult.failedIds.length
  };
}
