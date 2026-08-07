import { showMessage } from "siyuan";
import { createDocAssistantLogger } from "@/core/logger-core";
import {
  findDeleteFromCurrentBlockIds,
  findDeleteFromStartToCurrentBlockIds,
} from "@/core/markdown-cleanup-core";
import { resolveDocDirectChildBlockId } from "@/services/block-lineage";
import {
  deleteBlocksByIds,
  getBlockDOMs,
  getChildBlocksByParentId,
  getChildBlockRefsByParentId,
} from "@/services/kernel";
import { resolveCurrentBlockId } from "@/plugin/action-runner-context";
import { PartialActionHandlerMap } from "@/plugin/action-runner-dispatcher";
import { ProtyleLike } from "@/plugin/doc-context";
import { IOperation, runProtyleTransaction } from "@/plugin/transaction-runner";

const deleteFromCurrentLogger = createDocAssistantLogger("DeleteFromCurrent");
const deleteFromStartToCurrentLogger = createDocAssistantLogger("DeleteFromStartToCurrent");
const DELETE_BLOCK_CONCURRENCY = 6;

type DeleteRangeHandlersDeps = {
  askConfirmWithVisibleDialog: (title: string, text: string) => Promise<boolean>;
  setBusy?: (busy: boolean) => void;
};

export function createDeleteRangeActionHandlers(
  deps: DeleteRangeHandlersDeps
): PartialActionHandlerMap {
  return {
    "delete-from-current-to-end": async (docId, protyle) =>
      handleDeleteFromCurrentToEnd(deps, docId, protyle),
    "delete-from-start-to-current": async (docId, protyle) =>
      handleDeleteFromStartToCurrent(deps, docId, protyle),
  };
}

async function handleDeleteFromCurrentToEnd(
  deps: DeleteRangeHandlersDeps,
  docId: string,
  protyle?: ProtyleLike
) {
  const current = resolveCurrentBlockId(docId, protyle);
  const currentBlockId = current.id;
  if (!currentBlockId) {
    showMessage("未定位到当前段落，请将光标置于正文后重试", 5000, "error");
    return;
  }

  const blocks = await getChildBlockRefsByParentId(docId);
  if (!blocks.length) {
    showMessage("当前文档没有可处理的段落", 4000, "info");
    return;
  }

  const directChildIdSet = new Set(blocks.map((item) => item.id));
  let deleteStartId = currentBlockId;
  let mappedFromNested = false;
  if (!directChildIdSet.has(deleteStartId)) {
    const mapped = await resolveDocDirectChildBlockId(docId, deleteStartId);
    if (mapped) {
      mappedFromNested = true;
      deleteStartId = mapped;
    }
  }
  deleteFromCurrentLogger.debug("resolve start block", {
    docId,
    source: current.source,
    currentBlockIdWasDocId: current.wasDocId,
    currentBlockId,
    deleteStartId,
    mappedFromNested,
    directChildCount: blocks.length,
  });

  const result = findDeleteFromCurrentBlockIds(blocks, deleteStartId);
  if (result.deleteCount === 0) {
    showMessage("未找到从当前段落开始的可删除内容", 5000, "error");
    return;
  }

  const ok = await deps.askConfirmWithVisibleDialog(
    "确认删除后续段落",
    `将删除 ${result.deleteCount} 个段落（含当前段），是否继续？`
  );
  if (!ok) {
    return;
  }
  if (protyle) {
    const doOperations: IOperation[] = [];
    const undoOperations: IOperation[] = [];
    let canUseTransaction = true;
    
    const domRes = await getBlockDOMs(result.deleteIds);
    const domMap = new Map(domRes.map((r) => [r.id, r.dom]));

    for (const deleteId of result.deleteIds) {
      const domStr = domMap.get(deleteId);
      if (!domStr) {
        console.warn(`[doc-assist] Fallback: Block ${deleteId} DOM not returned by backend`);
        canUseTransaction = false;
        break;
      }
      
      const blockIndex = blocks.findIndex(b => b.id === deleteId);
      let previousID: string | undefined = undefined;
      if (blockIndex > 0) {
        previousID = blocks[blockIndex - 1].id;
      }
      
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
      showMessage(`已删除 ${result.deleteCount} 个段落 (支持撤销)`, 5000, "info");
      return;
    }
  }

  const deleteResult = await deleteBlocksByIds(result.deleteIds, {
    concurrency: DELETE_BLOCK_CONCURRENCY,
  });
  const failed = deleteResult.failedIds.length;

  if (failed > 0) {
    showMessage(`已删除 ${deleteResult.deletedCount} 个段落，失败 ${failed} 个`, 6000, "error");
    return;
  }
  showMessage(`已删除 ${result.deleteCount} 个段落`, 5000, "info");
}

async function handleDeleteFromStartToCurrent(
  deps: DeleteRangeHandlersDeps,
  docId: string,
  protyle?: ProtyleLike
) {
  const current = resolveCurrentBlockId(docId, protyle);
  const currentBlockId = current.id;
  if (!currentBlockId) {
    showMessage("未定位到当前段落，请将光标置于正文后重试", 5000, "error");
    return;
  }

  const blocks = await getChildBlocksByParentId(docId);
  if (!blocks.length) {
    showMessage("当前文档没有可处理的段落", 4000, "info");
    return;
  }

  const directChildIdSet = new Set(blocks.map((item) => item.id));
  let deleteEndId = currentBlockId;
  let mappedFromNested = false;
  if (!directChildIdSet.has(deleteEndId)) {
    const mapped = await resolveDocDirectChildBlockId(docId, deleteEndId);
    if (mapped) {
      mappedFromNested = true;
      deleteEndId = mapped;
    }
  }
  deleteFromStartToCurrentLogger.debug("resolve end block", {
    docId,
    source: current.source,
    currentBlockIdWasDocId: current.wasDocId,
    currentBlockId,
    deleteEndId,
    mappedFromNested,
    directChildCount: blocks.length,
  });

  const result = findDeleteFromStartToCurrentBlockIds(blocks, deleteEndId);
  if (result.deleteCount === 0) {
    showMessage("未找到当前段落之前可删除的内容", 5000, "error");
    return;
  }

  const ok = await deps.askConfirmWithVisibleDialog(
    "确认删除之前段落",
    `将删除 ${result.deleteCount} 个段落（含当前段，已跳过文首分隔线前的概要内容），是否继续？`
  );
  if (!ok) {
    return;
  }
  if (protyle) {
    const doOperations: IOperation[] = [];
    const undoOperations: IOperation[] = [];
    let canUseTransaction = true;

    const domRes = await getBlockDOMs(result.deleteIds);
    const domMap = new Map(domRes.map((r) => [r.id, r.dom]));

    for (const deleteId of result.deleteIds) {
      const domStr = domMap.get(deleteId);
      if (!domStr) {
        console.warn(`[doc-assist] Fallback: Block ${deleteId} DOM not returned by backend`);
        canUseTransaction = false;
        break;
      }
      
      const blockIndex = blocks.findIndex(b => b.id === deleteId);
      let previousID: string | undefined = undefined;
      if (blockIndex > 0) {
        previousID = blocks[blockIndex - 1].id;
      }
      
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
      showMessage(`已删除 ${result.deleteCount} 个段落 (支持撤销)`, 5000, "info");
      return;
    }
  }

  const deleteResult = await deleteBlocksByIds(result.deleteIds, {
    concurrency: DELETE_BLOCK_CONCURRENCY,
  });
  const failed = deleteResult.failedIds.length;

  if (failed > 0) {
    showMessage(`已删除 ${deleteResult.deletedCount} 个段落，失败 ${failed} 个`, 6000, "error");
    return;
  }
  showMessage(`已删除 ${result.deleteCount} 个段落`, 5000, "info");
}
