import { showMessage } from "siyuan";
import { deleteDocsByIds, findDuplicateCandidates } from "@/services/dedupe";
import { appendBlock } from "@/services/kernel";
import { getBacklinkDocs, getForwardLinkedDocIds } from "@/services/link-resolver";
import { moveDocsAsChildren } from "@/services/mover";
import { createOpenedDocsSummaryDoc } from "@/services/open-doc-summary";
import { PartialActionHandlerMap } from "@/plugin/action-runner-dispatcher";
import { openDedupeDialog } from "@/ui/dialogs";

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
  };
}
