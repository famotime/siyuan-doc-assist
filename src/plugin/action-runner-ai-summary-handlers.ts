import { showMessage } from "siyuan";
import { buildConceptMapDocTitle, joinChildDocHPath } from "@/core/ai-concept-map-core";
import {
  buildAiSummaryBlockMarkdown,
  resolveAiSummaryInsertTarget,
} from "@/core/ai-summary-core";
import {
  generateDocumentConceptMap,
  generateDocumentSummary,
} from "@/services/ai-summary";
import {
  appendBlock,
  createDocWithMd,
  exportMdContent,
  getChildBlocksByParentId,
  getDocMetaByID,
  getDocMetasByIDs,
  getRootDocRawMarkdown,
  insertBlockBefore,
} from "@/services/kernel";
import {
  getBacklinkDocs,
  getChildDocs,
  getForwardLinkedDocIds,
} from "@/services/link-resolver";
import { loadFreshNetworkLensDocumentSummary } from "@/services/network-lens-ai-index";
import { PartialActionHandlerMap } from "@/plugin/action-runner-dispatcher";
import { openDocByProtocol } from "@/plugin/action-runner-ai-shared";
import { CreateAiActionHandlersOptions } from "@/plugin/action-runner-ai-types";

export function createAiSummaryActionHandlers(
  options: CreateAiActionHandlersOptions = {}
): PartialActionHandlerMap {
  return {
    "create-doc-concept-map": async (docId) => {
      const documentMarkdown = (await getRootDocRawMarkdown(docId)).trim();

      const docMeta = await getDocMetaByID(docId).catch(() => null);
      if (!docMeta?.box) {
        throw new Error("未找到当前文档信息，无法生成概念地图");
      }

      const [childDocs, forwardDocIds, backlinkDocs] = await Promise.all([
        getChildDocs(docId).catch(() => []),
        getForwardLinkedDocIds(docId).catch(() => []),
        getBacklinkDocs(docId).catch(() => []),
      ]);

      const relatedIdSet = new Set<string>();
      for (const item of childDocs) {
        if (item.id && item.id !== docId) relatedIdSet.add(item.id);
      }
      for (const id of forwardDocIds) {
        if (id && id !== docId) relatedIdSet.add(id);
      }
      for (const item of backlinkDocs) {
        if (item.id && item.id !== docId) relatedIdSet.add(item.id);
      }

      const relatedDocIds = [...relatedIdSet];
      let relatedDocuments: Array<{ title: string; markdown: string }> = [];
      if (relatedDocIds.length) {
        const metas = await getDocMetasByIDs(relatedDocIds).catch(() => []);
        const metaMap = new Map(metas.map((m) => [m.id, m]));
        const settled = await Promise.allSettled(
          relatedDocIds.map(async (id) => {
            const md = await exportMdContent(id);
            const meta = metaMap.get(id);
            const title = meta?.title || id;
            return { title, markdown: (md.content || "").trim() };
          })
        );
        relatedDocuments = settled
          .filter((r): r is PromiseFulfilledResult<{ title: string; markdown: string }> =>
            r.status === "fulfilled" && !!r.value.markdown
          )
          .map((r) => r.value);
      }

      if (!documentMarkdown && !relatedDocuments.length) {
        showMessage("当前文档及关联文档均没有可供生成概念地图的正文", 5000, "info");
        return;
      }

      const conceptMap = await generateDocumentConceptMap({
        config: options.getAiSummaryConfig?.(),
        documentTitle: docMeta.title,
        documentMarkdown,
        relatedDocuments,
      });

      if (!documentMarkdown) {
        await appendBlock(conceptMap, docId);
        showMessage("已将概念地图写入当前文档", 5000, "info");
      } else {
        const title = buildConceptMapDocTitle(docMeta.title);
        const path = joinChildDocHPath(docMeta.hPath, title);
        const conceptDocId = await createDocWithMd(docMeta.box, path, conceptMap);
        openDocByProtocol(conceptDocId);
        showMessage("已生成概念地图子文档", 5000, "info");
      }
    },
    "insert-doc-summary": async (docId) => {
      const documentMarkdown = (await getRootDocRawMarkdown(docId)).trim();
      if (!documentMarkdown) {
        showMessage("当前文档没有可供摘要的正文", 5000, "info");
        return;
      }

      let docMeta: Awaited<ReturnType<typeof getDocMetaByID>> = null;
      try {
        docMeta = await getDocMetaByID(docId);
      } catch {
        docMeta = null;
      }
      const summary = await generateDocumentSummary({
        config: options.getAiSummaryConfig?.(),
        documentId: docId,
        documentTitle: docMeta?.title,
        documentUpdatedAt: docMeta?.updated,
        documentMarkdown,
        loadFreshDocumentSummary: async (params) => loadFreshNetworkLensDocumentSummary({
          networkLensPlugin: options.resolveNetworkLensPlugin?.(),
          documentId: params.documentId,
          documentUpdatedAt: params.documentUpdatedAt,
        }),
      });
      const blocks = await getChildBlocksByParentId(docId);
      const summaryMarkdown = buildAiSummaryBlockMarkdown(summary);
      const target = resolveAiSummaryInsertTarget(blocks);

      if (target.mode === "append") {
        await appendBlock(summaryMarkdown, docId);
      } else {
        await insertBlockBefore(summaryMarkdown, target.nextId, docId);
      }

      showMessage("已插入 AI 文档摘要", 5000, "info");
    },
  };
}
