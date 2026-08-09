import { showMessage } from "siyuan";
import {
  buildDocRefMarkdown,
  dedupeRelatedSuggestions,
  dedupeTagSuggestionItems,
  mergeTags,
  normalizeRelatedSuggestionPayload,
  parseTagAttr,
} from "@/core/ai-related-suggestions-core";
import { getBlockAttrs, getChildBlocksByParentId, insertBlockBefore, appendBlock, setBlockAttrs } from "@/services/kernel";
import { PartialActionHandlerMap } from "@/plugin/action-runner-dispatcher";
import { CreateAiActionHandlersOptions } from "@/plugin/action-runner-ai-types";
import { ConfirmDetailItem } from "@/plugin/action-runner";

export function createAiRelatedActionHandlers(
  options: CreateAiActionHandlersOptions = {}
): PartialActionHandlerMap {
  return {
    "add-related-links-and-tags": async (docId) => {
      const lensPlugin = options.resolveNetworkLensPlugin?.();
      if (!lensPlugin) {
        showMessage("未安装脉络镜插件，无法添加相关链接和标签", 5000, "error");
        return;
      }
      const wikiProvider = lensPlugin.getWikiCommandIntegration?.();
      if (!wikiProvider) {
        showMessage("脉络镜插件版本不支持 AI 关联建议命令，请更新插件", 5000, "error");
        return;
      }

      const result = await wikiProvider.invokeCommand("suggest-orphan-links-and-tags", {
        trigger: "manual",
        sourcePlugin: "siyuan-doc-assist",
        themeDocumentId: docId,
      });
      if (!result.ok) {
        showMessage(result.message || "AI 关联建议生成失败", 5000, "error");
        return;
      }

      const payload = normalizeRelatedSuggestionPayload(result.data);
      const links = dedupeRelatedSuggestions(payload.suggestions);
      const tagItems = dedupeTagSuggestionItems([
        ...(payload.tagSuggestions ?? []),
        ...links.flatMap((item) => item.tagSuggestions),
      ]);
      const tags = tagItems.map((item) => item.tag);
      if (!links.length && !tags.length) {
        showMessage("AI 未返回可添加的相关链接或标签", 5000, "info");
        return;
      }

      const detailItems: ConfirmDetailItem[] = [
        ...links.map((item) => ({
          id: `link:${item.targetDocumentId}`,
          label: `链接：${item.targetTitle}`,
          description: item.reason || item.confidence || undefined,
          selectable: true,
          selected: true,
          tone: "link" as const,
        })),
        ...tagItems.map((item) => ({
          id: `tag:${item.tag}`,
          label: `标签：${item.tag}`,
          description: item.reason || item.source || undefined,
          selectable: true,
          selected: true,
          tone: "tag" as const,
        })),
      ];
      const summary = payload.summary || `AI 建议添加相关链接 ${links.length} 个、标签 ${tags.length} 个。`;
      const ok = options.askConfirmWithVisibleDialog
        ? await options.askConfirmWithVisibleDialog(
          "确认添加相关链接和标签",
          `${summary}\n\n确认后会在当前文档开头插入一个链接段落，并把建议标签写入当前文档。是否继续？`,
          detailItems
        )
        : true;
      if (!ok) {
        return;
      }
      options.setBusy?.(true);

      const selectedIds = new Set(
        detailItems
          .filter((item) => item.selected !== false)
          .map((item) => item.id)
          .filter((id): id is string => Boolean(id))
      );
      const selectedLinks = links.filter((item) => selectedIds.has(`link:${item.targetDocumentId}`));
      const selectedTags = tags.filter((tag) => selectedIds.has(`tag:${tag}`));

      if (!selectedLinks.length && !selectedTags.length) {
        showMessage("未选择要添加的相关链接或标签", 5000, "info");
        return;
      }

      if (selectedLinks.length) {
        const linkMarkdown = selectedLinks
          .map((item) => buildDocRefMarkdown(item.targetDocumentId, item.targetTitle))
          .join("    ");
        const blocks = await getChildBlocksByParentId(docId);
        const firstBlock = blocks[0];
        if (firstBlock?.id) {
          await insertBlockBefore(linkMarkdown, firstBlock.id, docId);
        } else {
          await appendBlock(linkMarkdown, docId);
        }
      }

      if (selectedTags.length) {
        const attrs = await getBlockAttrs(docId);
        const nextTags = mergeTags(parseTagAttr(attrs.tags), selectedTags);
        await setBlockAttrs(docId, { tags: nextTags.join(",") });
      }

      showMessage(`已添加相关链接 ${selectedLinks.length} 个、标签 ${selectedTags.length} 个`, 5000, "info");
    },
  };
}
