import { showMessage } from "siyuan";
import { recognizeDocImages } from "@/services/ai-image-ocr";
import { translateDocParagraphs } from "@/services/ai-paragraph-translation";
import { PartialActionHandlerMap } from "@/plugin/action-runner-dispatcher";
import { CreateAiActionHandlersOptions } from "@/plugin/action-runner-ai-types";
import {
  getSelectedBlockIds,
  getSelectedImageAssetPaths,
} from "@/plugin/action-runner-context";

export function createAiMediaActionHandlers(
  options: CreateAiActionHandlersOptions = {}
): PartialActionHandlerMap {
  return {
    "recognize-doc-images": async (docId, protyle) => {
      const selectedBlockIds = getSelectedBlockIds(protyle);
      const selectedAssetPaths = getSelectedImageAssetPaths(protyle);
      const report = await recognizeDocImages({
        config: options.getAiSummaryConfig?.(),
        docId,
        targetBlockIds: selectedBlockIds,
        targetAssetPaths: selectedAssetPaths,
        onProgress: (current, total, assetPath) => {
          const basename = assetPath.split("/").filter(Boolean).pop() || assetPath;
          showMessage(`图片文字识别中（${current}/${total}）：${basename}`, 3000, "info");
        },
      });
      if (report.scannedImageCount <= 0) {
        showMessage("当前文档未发现可识别的本地图片", 5000, "info");
        return;
      }
      if (report.insertedCount <= 0) {
        if (report.failedCount > 0) {
          showMessage(`图片文字识别失败 ${report.failedCount} 张，请检查 AI 服务配置`, 7000, "error");
          return;
        }
        showMessage("图片中未识别出文字内容", 5000, "info");
        return;
      }
      const suffix = report.failedCount > 0 ? `，失败 ${report.failedCount} 张` : "";
      showMessage(
        `图片文字识别完成：识别 ${report.recognizedCount} 张，插入 ${report.insertedCount} 条引用${suffix}`,
        report.failedCount > 0 ? 7000 : 6000,
        report.failedCount > 0 ? "error" : "info",
      );
    },
    "translate-doc-paragraphs": async (docId) => {
      const report = await translateDocParagraphs({
        config: options.getAiSummaryConfig?.(),
        docId,
        onProgress: (current, total) => {
          showMessage(`段落翻译中（${current}/${total}）`, 3000, "info");
        },
      });
      if (report.scannedParagraphCount <= 0) {
        showMessage("当前文档未发现可翻译的段落", 5000, "info");
        return;
      }
      if (report.translatableParagraphCount <= 0) {
        showMessage("当前文档未发现包含英文内容的段落", 5000, "info");
        return;
      }
      if (report.insertedCount <= 0) {
        if (report.failedCount > 0) {
          showMessage(`段落翻译失败 ${report.failedCount} 段，请检查 AI 服务配置`, 7000, "error");
          return;
        }
        showMessage("AI 未返回可插入的翻译内容", 5000, "info");
        return;
      }
      const suffix = report.failedCount > 0 ? `，失败 ${report.failedCount} 段` : "";
      showMessage(
        `逐段翻译完成：翻译 ${report.translatedCount} 段，插入 ${report.insertedCount} 个译文块${suffix}`,
        report.failedCount > 0 ? 7000 : 6000,
        report.failedCount > 0 ? "error" : "info",
      );
    },
  };
}
