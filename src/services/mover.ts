import { planMoveWithConflictHandling } from "@/core/move-core";
import {
  getChildDocTitles,
  getDocMetaByID,
  getDocMetasByIDs,
  moveDocsByID,
  renameDocByID
} from "@/services/kernel";
import { OperationReport } from "@/types/link-tool";

function trimDocPathSuffix(path: string): string {
  const value = (path || "").trim();
  return value.endsWith(".sy") ? value.slice(0, -3) : value;
}

function isDescendantDocPath(
  currentDocMeta: { box: string; path: string } | null,
  candidateMeta: { box: string; path: string }
): boolean {
  if (!currentDocMeta) {
    return false;
  }
  const currentBox = (currentDocMeta.box || "").trim();
  const candidateBox = (candidateMeta.box || "").trim();
  if (!currentBox || !candidateBox || currentBox !== candidateBox) {
    return false;
  }
  const currentPath = trimDocPathSuffix(currentDocMeta.path || "");
  const candidatePath = trimDocPathSuffix(candidateMeta.path || "");
  if (!currentPath || !candidatePath || currentPath === candidatePath) {
    return false;
  }
  const prefix = currentPath.endsWith("/") ? currentPath : `${currentPath}/`;
  return candidatePath.startsWith(prefix);
}

export async function moveDocsAsChildren(
  currentDocId: string,
  sourceDocIds: string[]
): Promise<OperationReport> {
  const report: OperationReport = {
    successIds: [],
    skippedIds: [],
    renamed: [],
    failed: []
  };

  const sourceIds = [...new Set(sourceDocIds)].filter(Boolean);
  const [currentDocMeta, metas] = await Promise.all([
    getDocMetaByID(currentDocId),
    getDocMetasByIDs(sourceIds)
  ]);
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
    if (isDescendantDocPath(currentDocMeta, meta)) {
      report.skippedIds.push(docId);
      continue;
    }

    let renamedTitle: string | null = null;
    try {
      const movePlan = planMoveWithConflictHandling({
        sourceDoc: {
          id: meta.id,
          title: meta.title,
          parentId: meta.parentId
        },
        targetParentId: currentDocId,
        existingChildTitles: [...existingChildTitles]
      });

      if (movePlan.action === "skip") {
        report.skippedIds.push(docId);
        continue;
      }

      let titleForTarget = meta.title;
      if (movePlan.action === "rename-and-move") {
        await renameDocByID(docId, movePlan.newTitle);
        titleForTarget = movePlan.newTitle;
        renamedTitle = movePlan.newTitle;
      }

      await moveDocsByID([docId], currentDocId);
      existingChildTitles.add(titleForTarget);
      // 重命名只在 rename+move 都成功后计入报告，避免「已重命名却出现在失败列表」的矛盾报告
      if (renamedTitle) {
        report.renamed.push({ id: docId, title: renamedTitle });
      }
      report.successIds.push(docId);
    } catch (error: any) {
      const message = error?.message || String(error);
      // rename 已成功但 move 失败时，新标题已实际存在，必须加入占用集合，
      // 否则后续同名文档会被规划出重复的 newTitle（审计 2.5）
      if (renamedTitle) {
        existingChildTitles.add(renamedTitle);
        report.failed.push({
          id: docId,
          error: `已重命名为“${renamedTitle}”，但移动失败：${message}`
        });
      } else {
        report.failed.push({ id: docId, error: message });
      }
    }
  }

  return report;
}
