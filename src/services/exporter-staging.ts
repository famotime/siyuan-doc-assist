import { assetPathBasename, normalizeUploadFileName } from "@/core/export-media-core";
import { createDocAssistantLogger } from "@/core/logger-core";
import { getFileBlob, putBlobFile } from "@/services/kernel";

const exporterLogger = createDocAssistantLogger("Exporter");

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || String(error);
  }
  return String(error || "");
}

function isMissingItemError(error: unknown): boolean {
  const message = toErrorMessage(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("file not exist") ||
    normalized.includes("not exist") ||
    normalized.includes("not found") ||
    normalized.includes("does not exist") ||
    /不存在|未找到/.test(message)
  );
}

export function randomId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function stageAssetsToTempDir(
  assetPaths: string[],
  tempAssetsDir: string
): Promise<{ stagedCount: number; skippedAssetCount: number }> {
  let stagedCount = 0;
  let skippedAssetCount = 0;
  for (const assetPath of assetPaths) {
    const name = normalizeUploadFileName(assetPathBasename(assetPath), "asset.bin");
    try {
      const data = await getFileBlob(assetPath);
      await putBlobFile(`${tempAssetsDir}/${name}`, data, name);
      stagedCount += 1;
    } catch (error) {
      if (!isMissingItemError(error)) {
        throw error;
      }
      skippedAssetCount += 1;
      exporterLogger.warn("skip missing export asset", {
        assetPath,
        reason: toErrorMessage(error),
      });
    }
  }
  return {
    stagedCount,
    skippedAssetCount,
  };
}
