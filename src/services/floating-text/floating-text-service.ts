import { exportMdContent, getDocMetaByID } from "@/services/kernel";
import { openFloatingTextWindow } from "@/services/floating-text/floating-window-adapter";
import { showMessage } from "siyuan";
import { stripKramdownBlockAttributes } from "@/core/floating-text-core";

export class FloatingTextService {
  /**
   * 悬浮指定的文本片段
   */
  async openFloatingText(text: string, title?: string): Promise<void> {
    const cleanText = stripKramdownBlockAttributes(text || "");
    if (!cleanText) {
      showMessage("没有可悬浮的文本内容", 4000, "info");
      return;
    }
    const windowTitle = title || "悬浮窗";
    await openFloatingTextWindow({
      title: windowTitle,
      text: cleanText,
    });
    showMessage("已开启桌面置顶悬浮窗", 3000, "info");
  }

  /**
   * 悬浮整篇文档的 Markdown 内容
   */
  async openFloatingDoc(docId: string): Promise<void> {
    if (!docId) {
      showMessage("未找到当前文档", 4000, "error");
      return;
    }

    try {
      const [mdRes, meta] = await Promise.all([
        exportMdContent(docId, { addTitle: true }).catch(() => null),
        getDocMetaByID(docId).catch(() => null),
      ]);

      const title = meta?.title || mdRes?.hPath?.split("/").pop() || "悬浮文档";
      const content = stripKramdownBlockAttributes(mdRes?.content || "");

      if (!content) {
        showMessage("文档内容为空，无法悬浮", 4000, "info");
        return;
      }

      await openFloatingTextWindow({
        title,
        text: content,
      });
      showMessage(`已将文档《${title}》置顶悬浮`, 3000, "info");
    } catch (error) {
      console.error("[DocAssistant][FloatingText] openFloatingDoc error:", error);
      showMessage("读取文档内容失败", 5000, "error");
    }
  }
}

export const floatingTextService = new FloatingTextService();
