import { showMessage } from "siyuan";
import { PartialActionHandlerMap } from "@/plugin/action-runner-dispatcher";
import { CreateAiActionHandlersOptions } from "@/plugin/action-runner-ai-types";

export function createAiWikiActionHandlers(
  _options: CreateAiActionHandlersOptions = {}
): PartialActionHandlerMap {
  return {
    "generate-llm-wiki": async (docId) => {
      const lensPlugin = _options.resolveNetworkLensPlugin?.();
      if (!lensPlugin) {
        showMessage("未安装脉络镜插件，无法生成 Wiki 文档", 5000, "error");
        return;
      }
      const wikiProvider = lensPlugin.getWikiCommandIntegration?.();
      if (!wikiProvider) {
        showMessage("脉络镜插件版本不支持 Wiki 命令，请更新插件", 5000, "error");
        return;
      }
      console.log("[DocAssist Wiki] 开始生成，docId:", docId, "时间:", new Date().toISOString());
      let result;
      try {
        result = await wikiProvider.invokeCommand("generate-llm-wiki", {
          trigger: "manual",
          sourcePlugin: "siyuan-doc-assist",
          themeDocumentId: docId,
        });
      } catch (e) {
        console.error("[DocAssist Wiki] invokeCommand 抛出异常:", e);
        showMessage(`Wiki 命令执行异常: ${e instanceof Error ? e.message : String(e)}`, 5000, "error");
        return;
      }
      console.log("[DocAssist Wiki] invokeCommand 返回:", JSON.stringify(result));
      if (!result?.ok) {
        showMessage(result?.message || "Wiki 文档生成失败", 5000, "error");
        return;
      }
      showMessage(result.message || "Wiki 文档生成完成", 5000, "info");
    },
  };
}
