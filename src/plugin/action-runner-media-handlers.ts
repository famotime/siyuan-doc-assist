import { showMessage } from "siyuan";
import { formatByteSize } from "@/core/byte-format-core";
import { resizeDocImagesToDisplay } from "@/services/image-display-size";
import { removeDocImageLinks } from "@/services/image-remove";
import { convertDocImagesToPng } from "@/services/image-png";
import { convertDocImagesToWebp } from "@/services/image-webp";
import { PartialActionHandlerMap } from "@/plugin/action-runner-dispatcher";

export function createMediaActionHandlers(): PartialActionHandlerMap {
  return {
    "convert-images-to-webp": async (docId) => {
      const report = await convertDocImagesToWebp(docId);
      if (report.scannedImageCount <= 0) {
        showMessage("当前文档未发现可转换的本地图片", 5000, "info");
        return;
      }
      if (report.replacedLinkCount <= 0) {
        if (report.failedImageCount > 0 || report.failedBlockCount > 0) {
          const suffix = [
            report.failedImageCount > 0 ? `失败 ${report.failedImageCount} 张图片` : "",
            report.failedBlockCount > 0 ? `跳过 ${report.failedBlockCount} 个块` : "",
          ].filter(Boolean).join("，");
          showMessage(`未完成任何替换${suffix ? `，${suffix}` : ""}`, 7000, "error");
          return;
        }
        showMessage("未完成任何替换（可能已是 WebP 或压缩收益不足）", 5000, "info");
        return;
      }
      const savedText = formatByteSize(report.totalSavedBytes);
      const gifSuffix = report.skippedGifCount > 0 ? `（已忽略 GIF ${report.skippedGifCount} 张）` : "";
      const suffixParts = [
        report.failedImageCount > 0 ? `失败 ${report.failedImageCount} 张` : "",
        report.failedBlockCount > 0 ? `跳过 ${report.failedBlockCount} 个块` : "",
      ].filter(Boolean);
      const suffix = suffixParts.length > 0 ? `，${suffixParts.join("，")}` : "";
      showMessage(
        `图片转换完成：替换 ${report.replacedLinkCount} 处，更新 ${report.updatedBlockCount} 个块，转换 ${report.convertedImageCount} 张，节省 ${savedText}${gifSuffix}${suffix}`,
        suffixParts.length > 0 ? 7000 : 6000,
        suffixParts.length > 0 ? "error" : "info"
      );
    },
    "convert-images-to-png": async (docId) => {
      const report = await convertDocImagesToPng(docId);
      if (report.scannedImageCount <= 0) {
        showMessage("当前文档未发现可转换的本地图片", 5000, "info");
        return;
      }
      if (report.replacedLinkCount <= 0) {
        if (report.failedImageCount > 0 || report.failedBlockCount > 0) {
          const suffix = [
            report.failedImageCount > 0 ? `失败 ${report.failedImageCount} 张图片` : "",
            report.failedBlockCount > 0 ? `跳过 ${report.failedBlockCount} 个块` : "",
          ].filter(Boolean).join("，");
          showMessage(`未完成任何替换${suffix ? `，${suffix}` : ""}`, 7000, "error");
          return;
        }
        showMessage("未完成任何替换（已是 PNG 或仅包含 GIF）", 5000, "info");
        return;
      }
      const suffixParts = [
        report.failedImageCount > 0 ? `失败 ${report.failedImageCount} 张` : "",
        report.failedBlockCount > 0 ? `跳过 ${report.failedBlockCount} 个块` : "",
      ].filter(Boolean);
      const suffix = suffixParts.length > 0 ? `，${suffixParts.join("，")}` : "";
      showMessage(
        `PNG 转换完成：替换 ${report.replacedLinkCount} 处，更新 ${report.updatedBlockCount} 个块，转换 ${report.convertedImageCount} 张（已忽略 GIF）${suffix}`,
        suffixParts.length > 0 ? 7000 : 6000,
        suffixParts.length > 0 ? "error" : "info"
      );
    },
    "resize-images-to-display": async (docId) => {
      const report = await resizeDocImagesToDisplay(docId);
      if (report.scannedImageCount <= 0) {
        showMessage("当前文档未发现带显示尺寸的本地图片", 5000, "info");
        return;
      }
      if (report.replacedLinkCount <= 0) {
        if (report.failedImageCount > 0 || report.failedBlockCount > 0) {
          const suffix = [
            report.failedImageCount > 0 ? `失败 ${report.failedImageCount} 张图片` : "",
            report.failedBlockCount > 0 ? `跳过 ${report.failedBlockCount} 个块` : "",
          ].filter(Boolean).join("，");
          showMessage(`未完成任何替换${suffix ? `，${suffix}` : ""}`, 7000, "error");
          return;
        }
        showMessage("未完成任何替换（可能尺寸未缩小或压缩收益不足）", 5000, "info");
        return;
      }
      const savedText = formatByteSize(report.totalSavedBytes);
      const suffixParts = [
        report.failedImageCount > 0 ? `失败 ${report.failedImageCount} 张` : "",
        report.failedBlockCount > 0 ? `跳过 ${report.failedBlockCount} 个块` : "",
      ].filter(Boolean);
      const suffix = suffixParts.length > 0 ? `，${suffixParts.join("，")}` : "";
      showMessage(
        `图片尺寸调整完成：替换 ${report.replacedLinkCount} 处，更新 ${report.updatedBlockCount} 个块，缩减 ${report.resizedImageCount} 张，节省 ${savedText}${suffix}`,
        suffixParts.length > 0 ? 7000 : 6000,
        suffixParts.length > 0 ? "error" : "info"
      );
    },
    "remove-doc-images": async (docId) => {
      const report = await removeDocImageLinks(docId);
      if (report.scannedImageLinkCount <= 0) {
        showMessage("当前文档未发现可删除的图片链接", 5000, "info");
        return;
      }
      if (report.removedLinkCount <= 0) {
        showMessage(`未删除任何图片链接，失败 ${report.failedBlockCount} 个块`, 7000, "error");
        return;
      }
      const suffix = report.failedBlockCount > 0 ? `，失败 ${report.failedBlockCount} 个块` : "";
      showMessage(
        `图片链接删除完成：删除 ${report.removedLinkCount} 处，更新 ${report.updatedBlockCount} 个块${suffix}`,
        report.failedBlockCount > 0 ? 7000 : 6000,
        report.failedBlockCount > 0 ? "error" : "info"
      );
    },
  };
}
