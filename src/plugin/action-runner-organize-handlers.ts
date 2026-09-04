import { showMessage } from "siyuan";
import { deleteDocsByIds, findDuplicateCandidates } from "@/services/dedupe";
import { appendBlock, getBlockKramdowns, getChildBlocksByParentId } from "@/services/kernel";
import { getBacklinkDocs, getForwardLinkedDocIds } from "@/services/link-resolver";
import { createTop100LargeDocumentsReport } from "@/services/large-documents-report";
import { moveDocsAsChildren } from "@/services/mover";
import { createOpenedDocsSummaryDoc } from "@/services/open-doc-summary";
import { PartialActionHandlerMap } from "@/plugin/action-runner-dispatcher";
import { openDedupeDialog } from "@/ui/dialogs";
import { splitDocByHeadings } from "@/services/split-doc-by-headings";
import { splitDocByHeadingsCore } from "@/core/split-doc-by-headings-core";
import { floatingTextService } from "@/services/floating-text/floating-text-service";
import { getSelectedBlockIds } from "@/plugin/action-runner-context";
import { stripKramdownBlockAttributes } from "@/core/floating-text-core";

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
      // 1. 优先获取行内选中文本（优先读取浮动工具栏绑定的 range）
      let selectedText = "";
      const toolbarRange =
        (protyle as any)?.toolbar?.range ||
        (protyle as any)?.protyle?.toolbar?.range;
      if (toolbarRange && typeof toolbarRange.toString === "function") {
        selectedText = toolbarRange.toString().trim();
      }

      if (!selectedText && typeof window !== "undefined") {
        selectedText = window.getSelection()?.toString()?.trim() || "";
      }

      if (!selectedText && protyle?.wysiwyg?.element) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          selectedText = sel.getRangeAt(0).toString().trim();
        }
      }

      // 2. 若无行内选中文本，检查是否存在块级多选（选区覆盖完整块）
      if (!selectedText) {
        const selectedBlockIds = getSelectedBlockIds(protyle);
        if (selectedBlockIds.length > 0) {
          try {
            const kramdowns = await getBlockKramdowns(selectedBlockIds);
            const rawContent = kramdowns
              .map((item) => (item?.kramdown || "").trim())
              .filter(Boolean)
              .join("\n\n");
            const content = stripKramdownBlockAttributes(rawContent);
            if (content) {
              selectedText = content;
            }
          } catch (e) {
            console.warn("[DocAssistant][FloatingText] getBlockKramdowns failed:", e);
          }

          // 降级策略：若 API 获取失败，从 DOM 提取文本
          if (!selectedText && protyle?.wysiwyg?.element) {
            const domText = Array.from(
              protyle.wysiwyg.element.querySelectorAll<HTMLElement>(
                ".protyle-wysiwyg--select"
              )
            )
              .map((el) => (el.innerText || el.textContent || "").trim())
              .filter(Boolean)
              .join("\n\n");
            if (domText) {
              selectedText = domText;
            }
          }
        }
      }

      // 3. 若存在选区或选中块，则悬浮选中文本
      if (selectedText) {
        await floatingTextService.openFloatingText(selectedText);
        return;
      }

      // 4. 未选中文本且未选中任何块时，自动降级为悬浮整篇文档
      if (docId) {
        await floatingTextService.openFloatingDoc(docId);
      } else {
        showMessage("未选中文本且未找到当前文档", 4000, "info");
      }
    },
  };
}
