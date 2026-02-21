import {
  buildBacklinkListMarkdown,
  dedupeDocRefs,
  extractSiyuanBlockIdsFromMarkdown,
} from "@/core/link-core";
import {
  exportMdContent,
  getBacklink2,
  mapBlockIdsToRootDocIds,
} from "@/services/kernel";
import { DocRefItem } from "@/types/link-tool";

function basename(hPath: string): string {
  const parts = hPath.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : hPath;
}

export async function getBacklinkDocs(docId: string): Promise<DocRefItem[]> {
  const res = await getBacklink2(docId, false);
  const docs = res.backlinks
    .filter((item) => item.id && item.id !== docId)
    .map((item) => ({
      id: item.id,
      box: item.box,
      hPath: item.hPath || "",
      name: item.name || basename(item.hPath || item.id),
      updated: item.updated,
      source: "backlink" as const,
    }));
  return dedupeDocRefs(docs);
}

export function toBacklinkMarkdown(items: DocRefItem[]): string {
  return buildBacklinkListMarkdown(items);
}

export async function getForwardLinkedDocIds(docId: string): Promise<string[]> {
  const md = await exportMdContent(docId);
  const blockIds = extractSiyuanBlockIdsFromMarkdown(md.content || "");
  const rootIds = await mapBlockIdsToRootDocIds(blockIds);
  const set = new Set(rootIds.filter((id) => id && id !== docId));
  return [...set];
}
