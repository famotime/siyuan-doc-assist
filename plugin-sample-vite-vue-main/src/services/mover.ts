import { planMoveWithConflictHandling } from "@/core/move-core";
import {
  getChildDocTitles,
  getDocMetasByIDs,
  moveDocsByID,
  renameDocByID,
} from "@/services/kernel";
import { OperationReport } from "@/types/link-tool";

export async function moveDocsAsChildren(
  currentDocId: string,
  sourceDocIds: string[]
): Promise<OperationReport> {
  const report: OperationReport = {
    successIds: [],
    skippedIds: [],
    renamed: [],
    failed: [],
  };

  const sourceIds = [...new Set(sourceDocIds)].filter(Boolean);
  const metas = await getDocMetasByIDs(sourceIds);
  const metaMap = new Map(metas.map((meta) => [meta.id, meta]));
  const existingChildTitles = new Set(await getChildDocTitles(currentDocId));

  for (const docId of sourceIds) {
    if (docId === currentDocId) {
      report.skippedIds.push(docId);
      continue;
    }

    const meta = metaMap.get(docId);
    if (!meta) {
      report.failed.push({ id: docId, error: "Document metadata not found" });
      continue;
    }

    try {
      const movePlan = planMoveWithConflictHandling({
        sourceDoc: {
          id: meta.id,
          title: meta.title,
          parentId: meta.parentId,
        },
        targetParentId: currentDocId,
        existingChildTitles: [...existingChildTitles],
      });

      if (movePlan.action === "skip") {
        report.skippedIds.push(docId);
        continue;
      }

      let titleForTarget = meta.title;
      if (movePlan.action === "rename-and-move") {
        await renameDocByID(docId, movePlan.newTitle);
        titleForTarget = movePlan.newTitle;
        report.renamed.push({ id: docId, title: movePlan.newTitle });
      }

      await moveDocsByID([docId], currentDocId);
      existingChildTitles.add(titleForTarget);
      report.successIds.push(docId);
    } catch (error: any) {
      report.failed.push({
        id: docId,
        error: error?.message || String(error),
      });
    }
  }

  return report;
}
