import { buildDuplicateGroups, suggestKeepDocId } from "@/core/dedupe-core";
import {
  getDocMetaByID,
  listDocsByParentSubtree,
  removeDocByID,
} from "@/services/kernel";
import { DedupeCandidate, DedupeDocItem, OperationReport } from "@/types/link-tool";

function basename(hPath: string): string {
  const parts = hPath.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : hPath;
}

function toParentPrefix(path: string): string {
  const normalized = path.endsWith(".sy") ? path.slice(0, -3) : path;
  const index = normalized.lastIndexOf("/");
  if (index <= 0) {
    return "/";
  }
  return `${normalized.slice(0, index + 1)}`;
}

export async function findDuplicateCandidates(
  docId: string,
  threshold = 0.85
): Promise<DedupeCandidate[]> {
  const current = await getDocMetaByID(docId);
  if (!current) {
    throw new Error("Current document not found");
  }

  const parentPrefix = toParentPrefix(current.path);
  const rows = await listDocsByParentSubtree(current.box, parentPrefix);
  const docs: DedupeDocItem[] = rows.map((row) => ({
    id: row.id,
    title: basename(row.hpath),
    updated: row.updated,
    hPath: row.hpath,
  }));
  const docHPathMap = new Map(docs.map((doc) => [doc.id, doc.hPath]));

  const groups = buildDuplicateGroups(docs, threshold);
  return groups.map((group, index) => ({
    groupId: `group-${index + 1}`,
    score: group.score,
    docs: group.docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      updated: doc.updated,
      hPath: docHPathMap.get(doc.id) || "",
    })),
  }));
}

export function buildDefaultDeleteSelection(
  candidates: DedupeCandidate[]
): string[] {
  const ids: string[] = [];
  for (const candidate of candidates) {
    const keepId = suggestKeepDocId(candidate.docs);
    for (const doc of candidate.docs) {
      if (doc.id !== keepId) {
        ids.push(doc.id);
      }
    }
  }
  return ids;
}

export async function deleteDocsByIds(ids: string[]): Promise<OperationReport> {
  const report: OperationReport = {
    successIds: [],
    skippedIds: [],
    renamed: [],
    failed: [],
  };

  const uniqueIds = [...new Set(ids)].filter(Boolean);
  for (const id of uniqueIds) {
    try {
      await removeDocByID(id);
      report.successIds.push(id);
    } catch (error: any) {
      report.failed.push({
        id,
        error: error?.message || String(error),
      });
    }
  }

  return report;
}
