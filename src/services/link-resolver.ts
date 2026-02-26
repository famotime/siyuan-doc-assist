import {
  buildBacklinkListMarkdown,
  buildChildDocListMarkdown,
  dedupeDocRefs,
  extractSiyuanBlockIdsFromMarkdown,
} from "@/core/link-core";
import { createDocAssistantLogger } from "@/core/logger-core";
import {
  exportMdContent,
  getDocMetasByIDs,
  getBacklink2,
  getPathByID,
  getForwardRefTargetBlockIds,
  getRootDocRawMarkdown,
  listDocsByPath,
  mapBlockIdsToRootDocIds,
} from "@/services/kernel";
import { DocRefItem } from "@/types/link-tool";

const forwardLinksLogger = createDocAssistantLogger("ForwardLinks");

function basename(hPath: string): string {
  const parts = hPath.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : hPath;
}

function stripDocSuffix(name: string): string {
  return name.endsWith(".sy") ? name.slice(0, -3) : name;
}

function docName(name: string, path: string, id: string): string {
  const byName = stripDocSuffix((name || "").trim());
  if (byName) {
    return byName;
  }
  const byPath = stripDocSuffix(path.split("/").filter(Boolean).pop() || "");
  return byPath || id;
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

export async function filterDocRefsByExistingLinks(
  docId: string,
  items: DocRefItem[]
): Promise<{ items: DocRefItem[]; skipped: DocRefItem[]; existingIds: string[] }> {
  if (!docId || !items.length) {
    return { items, skipped: [], existingIds: [] };
  }
  const markdown = await getRootDocRawMarkdown(docId);
  const extracted = extractSiyuanBlockIdsFromMarkdown(markdown || "");
  if (!extracted.length) {
    return { items, skipped: [], existingIds: [] };
  }
  const mappedRootIds = await mapBlockIdsToRootDocIds(extracted);
  const existingSet = new Set<string>([...extracted, ...mappedRootIds]);
  const kept: DocRefItem[] = [];
  const skipped: DocRefItem[] = [];
  for (const item of items) {
    if (item?.id && existingSet.has(item.id)) {
      skipped.push(item);
    } else {
      kept.push(item);
    }
  }
  return { items: kept, skipped, existingIds: [...existingSet] };
}

export function toBacklinkMarkdown(items: DocRefItem[]): string {
  return buildBacklinkListMarkdown(items);
}

export async function getChildDocs(parentId: string): Promise<DocRefItem[]> {
  const parentPath = await getPathByID(parentId);
  const box = parentPath?.notebook || "";
  const rootPath = parentPath?.path || "";
  if (!box || !rootPath) {
    return [];
  }

  const visited = new Set<string>();
  const result: DocRefItem[] = [];

  const walk = async (path: string, depth: number): Promise<void> => {
    const docs = await listDocsByPath(box, path);
    for (const item of docs) {
      if (!item?.id || visited.has(item.id)) {
        continue;
      }
      visited.add(item.id);
      result.push({
        id: item.id,
        box,
        hPath: "",
        name: docName(item.name || "", item.path || "", item.id),
        source: "child" as const,
        depth,
      });
      if (item.path && (item.subFileCount === undefined || item.subFileCount > 0)) {
        await walk(item.path, depth + 1);
      }
    }
  };

  await walk(rootPath, 0);
  return result;
}

export function toChildDocMarkdown(items: DocRefItem[]): string {
  return buildChildDocListMarkdown(items);
}

export async function getForwardLinkedDocIds(docId: string): Promise<string[]> {
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
    forwardLinksLogger.debug(`${source}MappedRootIds`, {
      count: rootIds.length,
      rootIds,
    });
    forwardLinksLogger.debug(`${source}DocMetaFallbackIds`, {
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
      forwardLinksLogger.debug(`${source}FallbackToRawBlockIds`, {
        count: set.size,
        ids: [...set],
      });
    }
    const result = [...set];
    forwardLinksLogger.debug(`${source}FinalForwardDocIds`, {
      count: result.length,
      ids: result,
    });
    return result;
  };

  const refTargetBlockIds = await getForwardRefTargetBlockIds(docId);
  forwardLinksLogger.debug("refsTargetBlockIds", {
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

  forwardLinksLogger.debug("exportMdContent", {
    docId,
    contentLength: (md.content || "").length,
    preview: (md.content || "").slice(0, 400),
  });
  forwardLinksLogger.debug("rawRootMarkdown", {
    contentLength: (rawRootMarkdown || "").length,
    preview: (rawRootMarkdown || "").slice(0, 400),
  });

  const fromExport = extractSiyuanBlockIdsFromMarkdown(md.content || "");
  const fromRaw = extractSiyuanBlockIdsFromMarkdown(rawRootMarkdown || "");
  const blockIds = [...new Set([...fromExport, ...fromRaw])];
  forwardLinksLogger.debug("extractedBlockIds", {
    fromExportCount: fromExport.length,
    fromRawCount: fromRaw.length,
    count: blockIds.length,
    blockIds,
  });
  forwardLinksLogger.debug("rawIdLineEvidence", {
    evidence: buildIdLineEvidence(rawRootMarkdown || "", blockIds),
  });
  if (!blockIds.length) {
    forwardLinksLogger.debug("no block ids extracted");
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
  forwardLinksLogger.debug("refsMarkdownMerge", {
    refsCount: idsFromRefs.length,
    markdownCount: idsFromMarkdown.length,
    mergedCount: merged.length,
    refsOnly,
    markdownOnly,
  });
  return merged;
}
