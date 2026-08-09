import { showMessage } from "siyuan";
import {
  buildDocRefMarkdown,
  buildRelatedSuggestionSummary,
  convertKeywordsToTagItems,
  dedupeRelatedSuggestions,
  dedupeTagSuggestionItems,
  extractCleanTagsFromTitleAndContent,
  mergeTags,
  normalizeRelatedSuggestionPayload,
  parseTagAttr,
  TagSuggestionItem,
} from "@/core/ai-related-suggestions-core";
import { AiServiceConfig, isAiServiceConfigComplete, normalizeAiServiceConfig } from "@/core/ai-service-config-core";
import { generateDocumentTagSuggestions } from "@/services/ai-summary";
import { loadFreshNetworkLensDocumentSummary } from "@/services/network-lens-ai-index";
import { getBlockAttrs, getChildBlocksByParentId, insertBlockBefore, appendBlock, setBlockAttrs, getDocMetaByID, getRootDocRawMarkdown } from "@/services/kernel";
import { PartialActionHandlerMap } from "@/plugin/action-runner-dispatcher";
import { CreateAiActionHandlersOptions } from "@/plugin/action-runner-ai-types";
import { ConfirmDetailItem } from "@/plugin/action-runner";

export function createAiRelatedActionHandlers(
  options: CreateAiActionHandlersOptions = {}
): PartialActionHandlerMap {
  return {
    "add-related-links-and-tags": async (docId) => {
      console.log("[DocAssistant][AiRelated] ===== 开始执行“添加相关链接和标签” =====", { docId });

      const lensPlugin = options.resolveNetworkLensPlugin?.();
      console.log("[DocAssistant][AiRelated] 脉络镜插件解析结果:", { resolved: Boolean(lensPlugin) });
      if (!lensPlugin) {
        console.warn("[DocAssistant][AiRelated] 未安装或未接入脉络镜插件 (siyuan-network-lens)");
        showMessage("未安装脉络镜插件，无法添加相关链接和标签", 5000, "error");
        return;
      }
      const wikiProvider = lensPlugin.getWikiCommandIntegration?.();
      console.log("[DocAssistant][AiRelated] 脉络镜 WikiCommandIntegration 接入结果:", { available: Boolean(wikiProvider) });
      if (!wikiProvider) {
        console.warn("[DocAssistant][AiRelated] 脉络镜插件未暴露 getWikiCommandIntegration");
        showMessage("脉络镜插件版本不支持 AI 关联建议命令，请更新插件", 5000, "error");
        return;
      }

      console.log("[DocAssistant][AiRelated] 正在调用 suggest-orphan-links-and-tags 命令...");
      let result: any;
      try {
        result = await wikiProvider.invokeCommand("suggest-orphan-links-and-tags", {
          trigger: "manual",
          sourcePlugin: "siyuan-doc-assist",
          themeDocumentId: docId,
        });
        console.log("[DocAssistant][AiRelated] suggest-orphan-links-and-tags 返回原始数据:", result);
      } catch (invokeError) {
        console.error("[DocAssistant][AiRelated] suggest-orphan-links-and-tags 调用发生异常:", invokeError);
        result = { ok: false, message: invokeError instanceof Error ? invokeError.message : String(invokeError) };
      }

      const isLinkFailed = !result?.ok;
      const failureMessage = isLinkFailed ? (result?.message || "AI 补链请求失败") : undefined;

      const rawData = result && "data" in result ? result.data : (result as { data?: unknown })?.data;
      const payload = normalizeRelatedSuggestionPayload(rawData);
      const links = dedupeRelatedSuggestions(result?.ok ? payload.suggestions : []);
      let tagItems = dedupeTagSuggestionItems([
        ...(payload.tagSuggestions ?? []),
        ...links.flatMap((item) => item.tagSuggestions),
      ]);

      console.log("[DocAssistant][AiRelated] 主命令处理结果:", {
        isLinkFailed,
        failureMessage,
        linksCount: links.length,
        primaryTagsCount: tagItems.length,
      });

      if (!tagItems.length && (isLinkFailed || !links.length)) {
        console.log("[DocAssistant][AiRelated] 主命令未返回有效标签，启动降级策略提取标签...");
        tagItems = await fetchFallbackTags({
          wikiProvider,
          lensPlugin,
          docId,
          getAiSummaryConfig: options.getAiSummaryConfig,
        });
        console.log("[DocAssistant][AiRelated] 降级策略完成，获取到的标签总数:", tagItems.length);
      }

      const tags = tagItems.map((item) => item.tag);
      if (!links.length && !tags.length) {
        console.warn("[DocAssistant][AiRelated] 所有途径均未获取到相关链接或标签", { failureMessage });
        showMessage(failureMessage || "AI 未返回可添加的相关链接或标签", 5000, isLinkFailed ? "error" : "info");
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

      const summaryText = buildRelatedSuggestionSummary({
        payloadSummary: payload.summary,
        linkCount: links.length,
        tagCount: tags.length,
        isLinkFailed,
        failureMessage,
      });

      console.log("[DocAssistant][AiRelated] 准备弹出确认对话框:", { summaryText, detailItemsCount: detailItems.length });

      const ok = options.askConfirmWithVisibleDialog
        ? await options.askConfirmWithVisibleDialog(
          "确认添加相关链接和标签",
          `${summaryText}\n\n确认后会写入您勾选的相关内容。是否继续？`,
          detailItems
        )
        : true;
      if (!ok) {
        console.log("[DocAssistant][AiRelated] 用户取消了确认对话框");
        return;
      }

      const selectedIds = new Set(
        detailItems
          .filter((item) => item.selected !== false)
          .map((item) => item.id)
          .filter((id): id is string => Boolean(id))
      );
      const selectedLinks = links.filter((item) => selectedIds.has(`link:${item.targetDocumentId}`));
      const selectedTags = tags.filter((tag) => selectedIds.has(`tag:${tag}`));

      console.log("[DocAssistant][AiRelated] 用户选中的链接与标签:", {
        selectedLinksCount: selectedLinks.length,
        selectedTagsCount: selectedTags.length,
      });

      if (!selectedLinks.length && !selectedTags.length) {
        console.log("[DocAssistant][AiRelated] 用户未勾选任何关联链接或标签");
        showMessage("未选择要添加的相关链接或标签", 5000, "info");
        return;
      }

      if (selectedLinks.length) {
        const linkMarkdown = selectedLinks
          .map((item) => buildDocRefMarkdown(item.targetDocumentId, item.targetTitle))
          .join("    ");
        console.log("[DocAssistant][AiRelated] 正在插入相关链接 Markdown...", { linkMarkdown });
        const blocks = await getChildBlocksByParentId(docId);
        const firstBlock = blocks[0];
        if (firstBlock?.id) {
          await insertBlockBefore(linkMarkdown, firstBlock.id, docId);
        } else {
          await appendBlock(linkMarkdown, docId);
        }
      }

      if (selectedTags.length) {
        console.log("[DocAssistant][AiRelated] 正在写入文档标签属性...", { selectedTags });
        const attrs = await getBlockAttrs(docId);
        const nextTags = mergeTags(parseTagAttr(attrs.tags), selectedTags);
        await setBlockAttrs(docId, { tags: nextTags.join(",") });
      }

      console.log("[DocAssistant][AiRelated] =====“添加相关链接和标签”操作完成 =====");
      if (selectedLinks.length && selectedTags.length) {
        showMessage(`已添加相关链接 ${selectedLinks.length} 个、标签 ${selectedTags.length} 个`, 5000, "info");
      } else if (selectedLinks.length) {
        showMessage(`已添加相关链接 ${selectedLinks.length} 个`, 5000, "info");
      } else {
        showMessage(`已添加相关标签 ${selectedTags.length} 个`, 5000, "info");
      }
    },
  };
}

async function fetchFallbackTags(params: {
  wikiProvider: any;
  lensPlugin: any;
  docId: string;
  getAiSummaryConfig?: () => unknown;
}): Promise<TagSuggestionItem[]> {
  // 策略 1：查询脉络镜导出的可用命令列表，尝试单独的标签推荐命令（排除已失败的主命令）
  try {
    const commands = typeof params.wikiProvider.listCommands === "function"
      ? await params.wikiProvider.listCommands()
      : [];
    console.log("[DocAssistant][AiRelated][Fallback] 降级策略 1：脉络镜暴露的可用命令列表:", commands);
    const tagCmd = Array.isArray(commands)
      ? commands.find((c: any) =>
        c?.id !== "suggest-orphan-links-and-tags" &&
        (c?.id === "suggest-tags" ||
          c?.id === "suggest-orphan-tags" ||
          c?.id === "generate-tags" ||
          (typeof c?.id === "string" && c.id.includes("tag")))
      )
      : undefined;

    if (tagCmd?.id) {
      console.log(`[DocAssistant][AiRelated][Fallback] 正在尝试调用降级标签命令 '${tagCmd.id}'...`);
      const res = await params.wikiProvider.invokeCommand(tagCmd.id, {
        trigger: "manual",
        sourcePlugin: "siyuan-doc-assist",
        themeDocumentId: params.docId,
      });
      console.log(`[DocAssistant][AiRelated][Fallback] 命令 '${tagCmd.id}' 返回结果:`, res);
      if (res?.ok && res?.data) {
        const p = normalizeRelatedSuggestionPayload(res.data);
        const items = dedupeTagSuggestionItems([
          ...(p.tagSuggestions ?? []),
          ...p.suggestions.flatMap((s) => s.tagSuggestions),
        ]);
        if (items.length) {
          console.log(`[DocAssistant][AiRelated][Fallback] 成功通过降级命令 '${tagCmd.id}' 获取到 ${items.length} 个标签:`, items);
          return items;
        }
      }
    } else {
      console.log("[DocAssistant][AiRelated][Fallback] 脉络镜未提供独立的标签生成命令，跳过策略 1");
    }
  } catch (err) {
    console.warn("[DocAssistant][AiRelated][Fallback] 降级策略 1 执行异常:", err);
  }

  // 策略 2：读取 Network Lens 的最新文档摘要和关键词
  try {
    const docMeta = await getDocMetaByID(params.docId).catch(() => null);
    console.log("[DocAssistant][AiRelated][Fallback] 降级策略 2：读取 Network Lens 文档摘要, docMeta:", docMeta);
    const summary = await loadFreshNetworkLensDocumentSummary({
      networkLensPlugin: params.lensPlugin,
      documentId: params.docId,
      documentUpdatedAt: docMeta?.updated || "",
    });
    console.log("[DocAssistant][AiRelated][Fallback] loadFreshNetworkLensDocumentSummary 结果:", summary);
    if (summary?.keywords?.length) {
      const items = convertKeywordsToTagItems(summary.keywords);
      console.log(`[DocAssistant][AiRelated][Fallback] 成功从文档摘要获取到 ${items.length} 个关键词标签:`, items);
      return items;
    }
  } catch (err) {
    console.warn("[DocAssistant][AiRelated][Fallback] 降级策略 2 执行异常:", err);
  }

  // 策略 3：直接读取脉络镜的数据快照存储文件 ai-document-index.json
  try {
    console.log("[DocAssistant][AiRelated][Fallback] 降级策略 3：直接读取 ai-document-index.json 快照文件...");
    const snapshot = await params.lensPlugin?.loadData?.("ai-document-index.json");
    console.log("[DocAssistant][AiRelated][Fallback] ai-document-index.json 快照存在状态:", Boolean(snapshot));
    const profile = snapshot?.documentProfiles?.[params.docId] || snapshot?.semanticProfiles?.[params.docId];
    console.log(`[DocAssistant][AiRelated][Fallback] 文档 ${params.docId} 在快照中的 Profile:`, profile);
    if (profile) {
      const raw = profile.keywordsJson || profile.documentKeywordsJson;
      if (typeof raw === "string" && raw.trim()) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          const items = convertKeywordsToTagItems(parsed.filter((x): x is string => typeof x === "string"));
          console.log(`[DocAssistant][AiRelated][Fallback] 成功从快照 JSON 解析出 ${items.length} 个关键词标签:`, items);
          return items;
        }
      } else if (Array.isArray(profile.keywords) && profile.keywords.length) {
        const items = convertKeywordsToTagItems(profile.keywords);
        console.log(`[DocAssistant][AiRelated][Fallback] 成功从快照 keywords 数组解析出 ${items.length} 个关键词标签:`, items);
        return items;
      }
    }
  } catch (err) {
    console.warn("[DocAssistant][AiRelated][Fallback] 降级策略 3 执行异常:", err);
  }

  // 策略 4：使用可用 AI 配置直接提炼主题标签
  try {
    console.log("[DocAssistant][AiRelated][Fallback] 降级策略 4：尝试解析 AI 参数配置进行标签生成...");
    const aiConfig = await resolveEffectiveAiConfig(params);
    console.log("[DocAssistant][AiRelated][Fallback] 解析到的有效 AI 配置状态:", {
      hasConfig: Boolean(aiConfig),
      model: aiConfig?.model,
      baseUrl: aiConfig?.baseUrl,
    });
    if (aiConfig) {
      const docMeta = await getDocMetaByID(params.docId).catch(() => null);
      const docMarkdown = await getRootDocRawMarkdown(params.docId).catch(() => "");
      const aiTags = await generateDocumentTagSuggestions({
        config: aiConfig,
        documentTitle: docMeta?.title,
        documentMarkdown: docMarkdown,
      });
      if (aiTags.length) {
        const items = convertKeywordsToTagItems(aiTags, "ai-extract", "AI 提炼主题标签");
        console.log(`[DocAssistant][AiRelated][Fallback] 成功使用 AI 服务提炼出 ${items.length} 个标签:`, items);
        return items;
      }
    }
  } catch (err) {
    console.warn("[DocAssistant][AiRelated][Fallback] 降级策略 4 执行异常:", err);
  }

  // 策略 5：从文档标题与正文结构（标题/加粗项）中精细化提取标签
  try {
    const docMeta = await getDocMetaByID(params.docId).catch(() => null);
    const docMarkdown = await getRootDocRawMarkdown(params.docId).catch(() => "");
    const cleanTags = extractCleanTagsFromTitleAndContent(docMeta?.title, docMarkdown);
    if (cleanTags.length) {
      const items = convertKeywordsToTagItems(cleanTags, "doc-title-content", "文档结构主题");
      console.log(`[DocAssistant][AiRelated][Fallback] 降级策略 5：基于文档标题与正文结构提取到 ${items.length} 个标签:`, items);
      return items;
    }
  } catch (err) {
    console.warn("[DocAssistant][AiRelated][Fallback] 降级策略 5 执行异常:", err);
  }

  console.warn("[DocAssistant][AiRelated][Fallback] 所有降级方案均未获取到可用的标签");
  return [];
}

function resolveEffectiveAiConfig(params: {
  getAiSummaryConfig?: () => unknown;
}): AiServiceConfig | null {
  const config = normalizeAiServiceConfig(params.getAiSummaryConfig?.());

  if (!config.enabled) {
    console.log("[DocAssistant][AiRelated][Fallback] 本地 AI 服务未开启 (enabled = false)，跳过策略 4");
    return null;
  }

  if (!isAiServiceConfigComplete(config)) {
    console.log("[DocAssistant][AiRelated][Fallback] 本地 AI 服务配置未完整（请在插件设置中填写 Base URL、API Key 与 Model），跳过策略 4", {
      hasBaseUrl: Boolean(config.baseUrl),
      hasApiKey: Boolean(config.apiKey),
      hasModel: Boolean(config.model),
    });
    return null;
  }

  return config;
}

