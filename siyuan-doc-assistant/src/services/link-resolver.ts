import {
  buildBacklinkListMarkdown,
  dedupeDocRefs,
  extractSiyuanBlockIdsFromMarkdown,
} from "@/core/link-core";
import {
  exportMdContent,
  getDocMetasByIDs,
  getBacklink2,
  getForwardRefTargetBlockIds,
  getRootDocRawMarkdown,
  mapBlockIdsToRootDocIds,
} from "@/services/kernel";
import { DocRefItem } from "@/types/link-tool";

function basename(hPath: string): string {
  const parts = hPath.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : hPath;
}

function buildIdLineEvidence(markdown: string, ids: string[]): Array<{ id: string; lines: string[] }> {
  if (!markdown || !ids.length) {
    return [];
  }
  const lines = markdown.split(/\r?\n/);
  const evidence: Array<{ id: string; lines: string[] }> = [];
  for (const id of ids) {
    const matched = lines
      .filter((line) => line.includes(id))
      .slice(0, 3)
      .map((line) => line.trim());
    evidence.push({ id, lines: matched });
  }
  return evidence;
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
  const debugPrefix = "[DocAssistant][ForwardLinks]";

  const resolveForwardDocIds = async (
    candidateBlockIds: string[],
    source: "refs" | "markdown"
  ): Promise<string[]> => {
    if (!candidateBlockIds.length) {
      return [];
    }
    const [rootIds, docMetas] = await Promise.all([
      mapBlockIdsToRootDocIds(candidateBlockIds),
      getDocMetasByIDs(candidateBlockIds),
    ]);
    console.info(`${debugPrefix} ${source}MappedRootIds`, {
      count: rootIds.length,
      rootIds,
    });
    console.info(`${debugPrefix} ${source}DocMetaFallbackIds`, {
      count: docMetas.length,
      docMetaIds: docMetas.map((item) => item.id),
    });

    const set = new Set<string>();
    for (const id of rootIds) {
      if (id && id !== docId) {
        set.add(id);
      }
    }
    for (const meta of docMetas) {
      if (meta.id && meta.id !== docId) {
        set.add(meta.id);
      }
    }

    if (!set.size) {
      for (const id of candidateBlockIds) {
        if (id && id !== docId) {
          set.add(id);
        }
      }
      console.warn(`${debugPrefix} ${source}FallbackToRawBlockIds`, {
        count: set.size,
        ids: [...set],
      });
    }
    const result = [...set];
    console.info(`${debugPrefix} ${source}FinalForwardDocIds`, {
      count: result.length,
      ids: result,
    });
    return result;
  };

  const refTargetBlockIds = await getForwardRefTargetBlockIds(docId);
  console.info(`${debugPrefix} refsTargetBlockIds`, {
    count: refTargetBlockIds.length,
    ids: refTargetBlockIds,
  });
  let idsFromRefs: string[] = [];
  if (refTargetBlockIds.length) {
    idsFromRefs = await resolveForwardDocIds(refTargetBlockIds, "refs");
  }

  const [md, rawRootMarkdown] = await Promise.all([
    exportMdContent(docId, {
      // Keep reference syntax stable for forward-link extraction.
      refMode: 3,
      embedMode: 0,
      addTitle: false,
      yfm: false,
    }),
    getRootDocRawMarkdown(docId),
  ]);

  console.info(`${debugPrefix} exportMdContent`, {
    docId,
    contentLength: (md.content || "").length,
    preview: (md.content || "").slice(0, 400),
  });
  console.info(`${debugPrefix} rawRootMarkdown`, {
    contentLength: (rawRootMarkdown || "").length,
    preview: (rawRootMarkdown || "").slice(0, 400),
  });

  const fromExport = extractSiyuanBlockIdsFromMarkdown(md.content || "");
  const fromRaw = extractSiyuanBlockIdsFromMarkdown(rawRootMarkdown || "");
  const blockIds = [...new Set([...fromExport, ...fromRaw])];
  console.info(`${debugPrefix} extractedBlockIds`, {
    fromExportCount: fromExport.length,
    fromRawCount: fromRaw.length,
    count: blockIds.length,
    blockIds,
  });
  console.info(`${debugPrefix} rawIdLineEvidence`, {
    evidence: buildIdLineEvidence(rawRootMarkdown || "", blockIds),
  });
  if (!blockIds.length) {
    console.warn(`${debugPrefix} no block ids extracted`);
    return idsFromRefs;
  }
  const idsFromMarkdown = await resolveForwardDocIds(blockIds, "markdown");
  if (!idsFromRefs.length) {
    return idsFromMarkdown;
  }
  if (!idsFromMarkdown.length) {
    return idsFromRefs;
  }

  const refsSet = new Set(idsFromRefs);
  const markdownSet = new Set(idsFromMarkdown);
  const merged = [...new Set([...idsFromRefs, ...idsFromMarkdown])];
  const markdownOnly = idsFromMarkdown.filter((id) => !refsSet.has(id));
  const refsOnly = idsFromRefs.filter((id) => !markdownSet.has(id));
  console.info(`${debugPrefix} refsMarkdownMerge`, {
    refsCount: idsFromRefs.length,
    markdownCount: idsFromMarkdown.length,
    mergedCount: merged.length,
    refsOnly,
    markdownOnly,
  });
  return merged;
}
