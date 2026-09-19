import { showMessage } from "siyuan";
import { deleteDocsByIds, findDuplicateCandidates } from "@/services/dedupe";
import { appendBlock, exportMdContent, getChildBlocksByParentId } from "@/services/kernel";
import { getBacklinkDocs, getForwardLinkedDocIds } from "@/services/link-resolver";
import { createTop100LargeDocumentsReport } from "@/services/large-documents-report";
import { moveDocsAsChildren } from "@/services/mover";
import { createOpenedDocsSummaryDoc } from "@/services/open-doc-summary";
import { PartialActionHandlerMap } from "@/plugin/action-runner-dispatcher";
import { openDedupeDialog } from "@/ui/dialogs";
import { splitDocByHeadings } from "@/services/split-doc-by-headings";
import { splitDocByHeadingsCore } from "@/core/split-doc-by-headings-core";
import { floatingTextService } from "@/services/floating-text/floating-text-service";
import { extractFloatingMarkdownFromSelection } from "@/services/floating-text/floating-selection-helper";
import { extractWebLinksFromMarkdown, sanitizeDocTitle } from "@/core/link-to-doc-core";
import {
  clipWebLinksToDocs,
  fetchLinkTitles,
  type WebLinkItemWithTitle,
} from "@/services/link-to-doc-service";
import { openLinkToDocDialog } from "@/ui/link-to-doc-dialog";

type CreateOrganizeActionHandlersOptions = {
  askConfirmWithVisibleDialog: (title: string, text: string) => Promise<boolean>;
  ensureDocWritable: (docId: string, actionLabel: string) => Promise<boolean>;
  setBusy?: (busy: boolean) => void;
};

function openDocByProtocol(blockId: string) {
  const url = `siyuan://blocks/${blockId}`;
  try {
    window.open(url);
  } catch {
    window.location.href = url;
  }
}

function openDocsByProtocol(ids: string[]) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) {
    showMessage("没有可打开的文档", 4000, "info");
    return;
  }

  unique.forEach((id, index) => {
    window.setTimeout(() => {
      openDocByProtocol(id);
    }, index * 120);
  });
  showMessage(`已尝试打开 ${unique.length} 篇文档`, 5000, "info");
}

async function insertDocLinks(
  docId: string,
  docs: Array<{ id: string; title: string }>,
  ensureDocWritable: CreateOrganizeActionHandlersOptions["ensureDocWritable"]
) {
  const writable = await ensureDocWritable(docId, "插入重复候选文档链接");
  if (!writable) {
    return;
  }
  const unique = new Map<string, { id: string; title: string }>();
  for (const doc of docs) {
    if (!doc?.id || unique.has(doc.id)) {
      continue;
    }
    unique.set(doc.id, { id: doc.id, title: doc.title || doc.id });
  }

  const items = Array.from(unique.values());
  if (!items.length) {
    showMessage("没有可插入的文档链接", 4000, "info");
    return;
  }

  const lines = items.map((item) => `- [${item.title}](siyuan://blocks/${item.id})`);
  const markdown = `## 重复候选文档\n\n${lines.join("\n")}`;
  await appendBlock(markdown, docId);
  showMessage(`已插入 ${items.length} 个文档链接`, 5000, "info");
}

export function createOrganizeActionHandlers(
  options: CreateOrganizeActionHandlersOptions
): PartialActionHandlerMap {
  return {
    "move-backlinks": async (docId) => {
      const backlinks = await getBacklinkDocs(docId);
      if (!backlinks.length) {
        showMessage("当前文档没有反向链接文档可移动", 5000, "info");
        return;
      }
      const ok = await options.askConfirmWithVisibleDialog(
        "确认移动",
        `将尝试把 ${backlinks.length} 篇反链文档移动为当前文档子文档，是否继续？`
      );
      if (!ok) {
        return;
      }
      options.setBusy?.(true);

      const report = await moveDocsAsChildren(
        docId,
        backlinks.map((item) => item.id)
      );
      const message = [
        `移动完成：成功 ${report.successIds.length}`,
        `跳过 ${report.skippedIds.length}`,
        `重命名 ${report.renamed.length}`,
        `失败 ${report.failed.length}`,
      ].join("，");
      showMessage(message, 9000, report.failed.length ? "error" : "info");
    },
    "move-forward-links": async (docId) => {
      const forwardLinkedIds = await getForwardLinkedDocIds(docId);
      if (!forwardLinkedIds.length) {
        showMessage("当前文档没有正链文档可移动", 5000, "info");
        return;
      }
      const ok = await options.askConfirmWithVisibleDialog(
        "确认移动",
        `将尝试把 ${forwardLinkedIds.length} 篇正链文档移动为当前文档子文档，是否继续？`
      );
      if (!ok) {
        return;
      }
      options.setBusy?.(true);

      const report = await moveDocsAsChildren(docId, forwardLinkedIds);
      const message = [
        `移动完成：成功 ${report.successIds.length}`,
        `跳过 ${report.skippedIds.length}`,
        `重命名 ${report.renamed.length}`,
        `失败 ${report.failed.length}`,
      ].join("，");
      showMessage(message, 9000, report.failed.length ? "error" : "info");
    },
    "create-open-docs-summary": async (docId) => {
      const summary = await createOpenedDocsSummaryDoc(docId);
      openDocByProtocol(summary.id);
      showMessage(`已生成汇总页，包含 ${summary.docCount} 篇已打开文档`, 5000, "info");
    },
    "create-top100-large-documents-report": async (docId) => {
      const result = await createTop100LargeDocumentsReport({
        currentDocId: docId,
      });
      openDocByProtocol(result.id);
      showMessage(`已输出 Top100 大文件清单：${result.title}（${result.docCount} 篇）`, 5000, "info");
    },
    dedupe: async (docId) => {
      const candidates = await findDuplicateCandidates(docId, 0.85);
      if (!candidates.length) {
        showMessage("未识别到重复文档", 5000, "info");
        return;
      }

      openDedupeDialog({
        candidates,
        onDelete: async (ids) => deleteDocsByIds(ids),
        onOpenAll: (docs) => {
          openDocsByProtocol(docs.map((doc) => doc.id));
        },
        onInsertLinks: (docs) => insertDocLinks(docId, docs, options.ensureDocWritable),
      });
      showMessage(`识别到 ${candidates.length} 组重复候选`, 5000, "info");
    },
    "split-doc-by-headings": async (docId) => {
      const blocks = await getChildBlocksByParentId(docId);
      const { sections } = splitDocByHeadingsCore(blocks);

      if (sections.length === 0) {
        showMessage("文档中未找到标题，无法拆分", 5000, "info");
        return;
      }
      if (sections.length === 1) {
        showMessage("文档中仅有一个最高级标题，无需拆分", 5000, "info");
        return;
      }

      const ok = await options.askConfirmWithVisibleDialog(
        "按标题拆分文档",
        `将按最高级标题拆分为 ${sections.length} 个子文档，原文档中对应内容将被删除，是否继续？`
      );
      if (!ok) {
        return;
      }

      options.setBusy?.(true);
      try {
        const report = await splitDocByHeadings(docId);
        showMessage(
          `拆分完成：已创建 ${report.sectionCount} 个子文档，从原文档删除 ${report.deletedBlockCount} 个块`,
          9000,
          "info"
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showMessage(`拆分失败：${msg}`, 9000, "error");
      } finally {
        options.setBusy?.(false);
      }
    },
    "float-selected-text": async (docId, protyle) => {
      // 1. 智能提取选中的 Markdown 文本（支持行内选区、多块选中、列表项语法完整保留）
      const selectedText = await extractFloatingMarkdownFromSelection(protyle);

      // 2. 若存在选区或选中块，则悬浮选中文本
      if (selectedText) {
        await floatingTextService.openFloatingText(selectedText);
        return;
      }

      // 3. 未选中文本且未选中任何块时，自动降级为悬浮整篇文档
      if (docId) {
        await floatingTextService.openFloatingDoc(docId);
      } else {
        showMessage("未选中文本且未找到当前文档", 4000, "info");
      }
    },
    "link-to-doc": async (docId) => {
      // 1. 读取当前文档内容
      let content = "";
      try {
        const mdRes = await exportMdContent(docId);
        content = mdRes?.content || "";
      } catch (err: any) {
        showMessage(`读取当前文档内容失败: ${err?.message || err}`, 5000, "error");
        return;
      }

      // 2. 提取外部网页链接
      const links = extractWebLinksFromMarkdown(content);
      if (links.length === 0) {
        showMessage("当前文档未找到可转化的外部网页链接", 4000, "info");
        return;
      }

      // 3. 如果只有一个链接，直接执行剪藏
      if (links.length === 1) {
        options.setBusy?.(true);
        showMessage("正在获取网页内容并剪藏为文档...", 3000, "info");
        try {
          const report = await clipWebLinksToDocs(docId, links);
          if (report.successCount > 0) {
            showMessage("成功剪藏 1 篇网页文档", 4000, "info");
          } else {
            const err = report.errors[0]?.error || "未知错误";
            showMessage(`剪藏失败: ${err}`, 5000, "error");
          }
        } catch (err: any) {
          showMessage(`剪藏失败: ${err?.message || err}`, 5000, "error");
        } finally {
          options.setBusy?.(false);
        }
        return;
      }

      // 4. 多个链接：先获取对应链接的网页标题再弹窗确认
      options.setBusy?.(true);
      showMessage(`检测到 ${links.length} 个链接，正在获取网页标题...`, 3000, "info");

      let itemsWithTitles: WebLinkItemWithTitle[] = [];
      try {
        itemsWithTitles = await fetchLinkTitles(links, 3);
      } catch (err: any) {
        console.error("获取链接标题失败:", err);
        itemsWithTitles = links.map((l) => ({
          ...l,
          title: l.fallbackTitle || sanitizeDocTitle("", l.url),
          hasFetchedTitle: false,
        }));
      } finally {
        options.setBusy?.(false);
      }

      // 弹窗确认
      openLinkToDocDialog({
        items: itemsWithTitles,
        onConfirm: async (selectedItems) => {
          options.setBusy?.(true);
          showMessage(`开始剪藏 ${selectedItems.length} 个网页文档...`, 3000, "info");

          try {
            const report = await clipWebLinksToDocs(
              docId,
              selectedItems,
              (current, total, title) => {
                showMessage(`正在剪藏 (${current}/${total}): ${title}`, 2000, "info");
              }
            );

            if (report.failedCount === 0) {
              showMessage(`链接转文档完成：成功剪藏 ${report.successCount} 篇文档`, 5000, "info");
            } else {
              showMessage(
                `链接转文档完成：成功 ${report.successCount} 篇，失败 ${report.failedCount} 篇`,
                6000,
                "info"
              );
            }
          } catch (err: any) {
            showMessage(`批量剪藏出错: ${err?.message || err}`, 5000, "error");
          } finally {
            options.setBusy?.(false);
          }
        },
      });
    },
  };
}
