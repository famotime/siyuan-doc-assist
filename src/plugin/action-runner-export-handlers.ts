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
import { exportMdContent, getDocMetaByID } from "@/services/kernel";
import { getBacklinkDocs, getChildDocs, getForwardLinkedDocIds } from "@/services/link-resolver";
import { PartialActionHandlerMap } from "@/plugin/action-runner-dispatcher";

type CreateExportActionHandlersOptions = {
  getKeyInfoFilter?: () => KeyInfoFilter | undefined;
};

const forwardLinksLogger = createDocAssistantLogger("ForwardLinks");

function buildSkippedSummary(result: {
  skippedDocCount?: number;
  skippedAssetCount?: number;
}): string {
  const parts: string[] = [];
  if ((result.skippedDocCount || 0) > 0) {
    parts.push(`跳过 ${result.skippedDocCount} 篇缺失文档`);
  }
  if ((result.skippedAssetCount || 0) > 0) {
    parts.push(`跳过 ${result.skippedAssetCount} 个缺失资源`);
  }
  return parts.length ? `，${parts.join("，")}` : "";
}

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
  showMessage(`导出完成（${displayName}）：${displayZip}${buildSkippedSummary(result)}`, 9000, "info");
}

export function createExportActionHandlers(
  options: CreateExportActionHandlersOptions = {}
): PartialActionHandlerMap {
  return {
    "export-current": async (docId) => {
      const result = await exportCurrentDocMarkdown(docId);
      if (result.mode === "zip") {
        showMessage(
          `导出完成（含媒体）：${result.fileName}${result.zipPath ? `，路径 ${result.zipPath}` : ""}${buildSkippedSummary(result)}`,
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
      showMessage(
        `导出完成：${result.docCount} 篇文档${displayName ? `（${displayName}）` : ""}${buildSkippedSummary(result)}`,
        6000,
        "info"
      );
    },
    "export-child-key-info-zip": async (docId, protyle) => {
      const result = await exportDocAndChildKeyInfoAsZip({
        docId,
        filter: options.getKeyInfoFilter?.(),
        protyle,
      });
      showMessage(
        `导出完成：${result.docCount} 篇文档，${result.itemCount} 条关键内容${buildSkippedSummary(result)}`,
        6000,
        "info"
      );
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
    "extract-web-links": async (docId) => {
      try {
        const result = await exportMdContent(docId);
        const content = result.content;

        // 匹配 web 链接的正则表达式
        const urlRegex = /https?:\/\/[^\s<>)\]>"',;]+/gi;
        const matches = content.match(urlRegex) || [];

        if (matches.length === 0) {
          showMessage("本文档未找到任何 Web 链接", 3000, "info");
          return;
        }

        // 去重并排序
        const uniqueUrls = [...new Set(matches)].sort();

        // 复制到剪贴板
        await navigator.clipboard.writeText(uniqueUrls.join("\n"));
        showMessage(`已提取 ${uniqueUrls.length} 个链接并复制到剪贴板`, 5000, "info");
      } catch (error) {
        console.error("提取链接失败:", error);
        showMessage("提取链接失败", 5000, "error");
      }
    },
  };
}
