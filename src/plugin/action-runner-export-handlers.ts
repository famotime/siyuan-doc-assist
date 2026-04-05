import { showMessage } from "siyuan";
import { KeyInfoFilter } from "@/core/key-info-core";
import { createDocAssistantLogger } from "@/core/logger-core";
import { decodeURIComponentSafe } from "@/core/workspace-path-core";
import {
  exportCurrentDocMarkdown,
  exportDocAndChildDocsAsMarkdownZip,
  exportDocAndChildKeyInfoAsZip,
  exportDocIdsAsMarkdownZip,
} from "@/services/exporter";
import { getDocMetaByID } from "@/services/kernel";
import { getBacklinkDocs, getChildDocs, getForwardLinkedDocIds } from "@/services/link-resolver";
import { PartialActionHandlerMap } from "@/plugin/action-runner-dispatcher";

type CreateExportActionHandlersOptions = {
  getKeyInfoFilter?: () => KeyInfoFilter | undefined;
};

const forwardLinksLogger = createDocAssistantLogger("ForwardLinks");

async function exportDocZip(ids: string[], label: string, currentDocId: string) {
  const docIds = [...new Set([currentDocId, ...ids.filter(Boolean)])];
  if (!docIds.length) {
    showMessage(`未找到可导出的${label}文档`, 5000, "error");
    return;
  }

  const currentDoc = await getDocMetaByID(currentDocId);
  const preferredZipName = currentDoc?.title || currentDocId;
  const result = await exportDocIdsAsMarkdownZip(docIds, preferredZipName);
  const displayName = decodeURIComponentSafe(result.name || "");
  const displayZip = decodeURIComponentSafe(result.zip || "");
  showMessage(`导出完成（${displayName}）：${displayZip}`, 9000, "info");
}

export function createExportActionHandlers(
  options: CreateExportActionHandlersOptions = {}
): PartialActionHandlerMap {
  return {
    "export-current": async (docId) => {
      const result = await exportCurrentDocMarkdown(docId);
      if (result.mode === "zip") {
        showMessage(
          `导出完成（含媒体）：${result.fileName}${result.zipPath ? `，路径 ${result.zipPath}` : ""}`,
          8000,
          "info"
        );
        return;
      }
      showMessage(`导出完成：${result.fileName}`, 5000, "info");
    },
    "export-child-docs-zip": async (docId) => {
      const result = await exportDocAndChildDocsAsMarkdownZip({
        docId,
      });
      const displayName = decodeURIComponentSafe(result.name || "");
      showMessage(`导出完成：${result.docCount} 篇文档${displayName ? `（${displayName}）` : ""}`, 6000, "info");
    },
    "export-child-key-info-zip": async (docId, protyle) => {
      const result = await exportDocAndChildKeyInfoAsZip({
        docId,
        filter: options.getKeyInfoFilter?.(),
        protyle,
      });
      showMessage(`导出完成：${result.docCount} 篇文档，${result.itemCount} 条关键内容`, 6000, "info");
    },
    "export-related-docs-zip": async (docId) => {
      const [forwardIds, backlinks, childDocs] = await Promise.all([
        getForwardLinkedDocIds(docId),
        getBacklinkDocs(docId),
        getChildDocs(docId),
      ]);
      const ids = [
        ...forwardIds,
        ...backlinks.map((item) => item.id),
        ...childDocs.map((item) => item.id),
      ];
      await exportDocZip(ids, "关联", docId);
    },
    "export-backlinks-zip": async (docId) => {
      const backlinks = await getBacklinkDocs(docId);
      const ids = backlinks.map((item) => item.id);
      await exportDocZip(ids, "反链", docId);
    },
    "export-forward-zip": async (docId) => {
      const ids = await getForwardLinkedDocIds(docId);
      forwardLinksLogger.debug("export-forward-zip trigger", {
        currentDocId: docId,
        forwardDocCount: ids.length,
        forwardDocIds: ids,
      });
      await exportDocZip(ids, "正链", docId);
    },
  };
}
