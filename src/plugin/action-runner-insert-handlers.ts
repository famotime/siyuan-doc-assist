import { showMessage } from "siyuan";
import { appendBlock } from "@/services/kernel";
import {
  filterDocRefsByExistingLinks,
  getBacklinkDocs,
  getChildDocs,
  toBacklinkMarkdown,
  toChildDocMarkdown,
} from "@/services/link-resolver";
import { createMonthlyDiaryDoc } from "@/services/monthly-diary";
import { PartialActionHandlerMap } from "@/plugin/action-runner-dispatcher";

type CreateInsertActionHandlersOptions = {
  getMonthlyDiaryTemplate?: () => string | undefined;
};

export function createInsertActionHandlers(
  options: CreateInsertActionHandlersOptions = {}
): PartialActionHandlerMap {
  return {
    "insert-backlinks": async (docId) => {
      const backlinks = await getBacklinkDocs(docId);
      if (!backlinks.length) {
        showMessage("当前文档没有可插入的反向链接文档", 5000, "info");
        return;
      }
      const filtered = await filterDocRefsByExistingLinks(docId, backlinks);
      if (!filtered.items.length) {
        showMessage("当前文档已包含所有反向链接文档", 5000, "info");
        return;
      }
      const markdown = toBacklinkMarkdown(filtered.items);
      await appendBlock(markdown, docId);
      const skipSuffix = filtered.skipped.length ? `，跳过已存在 ${filtered.skipped.length} 个` : "";
      showMessage(`已插入 ${filtered.items.length} 个反链文档链接${skipSuffix}`, 5000, "info");
    },
    "insert-child-docs": async (docId) => {
      const childDocs = await getChildDocs(docId);
      if (!childDocs.length) {
        showMessage("当前文档没有可插入的子文档", 5000, "info");
        return;
      }
      const filtered = await filterDocRefsByExistingLinks(docId, childDocs);
      if (!filtered.items.length) {
        showMessage("当前文档已包含所有子文档链接", 5000, "info");
        return;
      }
      const markdown = toChildDocMarkdown(filtered.items);
      await appendBlock(markdown, docId);
      const skipSuffix = filtered.skipped.length ? `，跳过已存在 ${filtered.skipped.length} 个` : "";
      showMessage(`已插入 ${filtered.items.length} 个子文档链接${skipSuffix}`, 5000, "info");
    },
    "create-monthly-diary": async (docId) => {
      const result = await createMonthlyDiaryDoc({
        currentDocId: docId,
        template: options.getMonthlyDiaryTemplate?.(),
      });
      showMessage(`已创建本月日记：${result.title}（${result.dayCount} 天）`, 5000, "info");
    },
  };
}
