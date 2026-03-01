import {
  collectLocalImageAssetPathsFromMarkdown,
  isConvertibleImageAssetPath,
  rewriteMarkdownImageAssetLinks,
} from "@/core/image-webp-core";
import { updateBlockMarkdown } from "@/services/kernel";
import { escapeSqlLiteral, sqlPaged } from "@/services/kernel-shared";
import { convertLocalAssetImageToWebp } from "@/services/image-webp-converter";

type SqlDocBlockRow = {
  id: string;
  markdown: string;
};

export type ConvertDocImagesToWebpReport = {
  scannedImageCount: number;
  convertedImageCount: number;
  skippedImageCount: number;
  skippedGifCount: number;
  failedImageCount: number;
  replacedLinkCount: number;
  updatedBlockCount: number;
  totalSavedBytes: number;
};

const EMPTY_REPORT: ConvertDocImagesToWebpReport = {
  scannedImageCount: 0,
  convertedImageCount: 0,
  skippedImageCount: 0,
  skippedGifCount: 0,
  failedImageCount: 0,
  replacedLinkCount: 0,
  updatedBlockCount: 0,
  totalSavedBytes: 0,
};

function isGifAssetPath(assetPath: string): boolean {
  return /\.gif$/i.test(assetPath || "");
}

export async function convertDocImagesToWebp(docId: string): Promise<ConvertDocImagesToWebpReport> {
  const normalizedDocId = (docId || "").trim();
  if (!normalizedDocId) {
    return { ...EMPTY_REPORT };
  }

  const rows = await sqlPaged<SqlDocBlockRow>(
    `select id, markdown
     from blocks
     where root_id='${escapeSqlLiteral(normalizedDocId)}'
       and type != 'd'
     order by sort asc`
  );
  const blocks = (rows || []).filter((row) => row?.id && typeof row.markdown === "string");
  if (!blocks.length) {
    return { ...EMPTY_REPORT };
  }

  const allImagePathSet = new Set<string>();
  for (const block of blocks) {
    collectLocalImageAssetPathsFromMarkdown(block.markdown || "").forEach((path) =>
      allImagePathSet.add(path)
    );
  }
  const allImagePaths = [...allImagePathSet];
  if (!allImagePaths.length) {
    return { ...EMPTY_REPORT };
  }

  const replacementMap = new Map<string, string>();
  let convertedImageCount = 0;
  let skippedImageCount = 0;
  let skippedGifCount = 0;
  let failedImageCount = 0;
  let totalSavedBytes = 0;

  for (const assetPath of allImagePaths) {
    if (!isConvertibleImageAssetPath(assetPath)) {
      skippedImageCount += 1;
      if (isGifAssetPath(assetPath)) {
        skippedGifCount += 1;
      }
      continue;
    }
    try {
      const result = await convertLocalAssetImageToWebp(assetPath);
      if (!result.converted) {
        skippedImageCount += 1;
        continue;
      }
      convertedImageCount += 1;
      totalSavedBytes += Math.max(0, result.savedBytes || 0);
      replacementMap.set(result.sourceAssetPath, result.targetAssetPath);
    } catch {
      failedImageCount += 1;
    }
  }

  let replacedLinkCount = 0;
  let updatedBlockCount = 0;
  if (replacementMap.size > 0) {
    const replacements = Object.fromEntries(replacementMap.entries());
    for (const block of blocks) {
      const source = block.markdown || "";
      if (!source) {
        continue;
      }
      const replaced = rewriteMarkdownImageAssetLinks(source, replacements);
      if (replaced.replacedCount <= 0 || replaced.markdown === source) {
        continue;
      }
      await updateBlockMarkdown(block.id, replaced.markdown);
      replacedLinkCount += replaced.replacedCount;
      updatedBlockCount += 1;
    }
  }

  return {
    scannedImageCount: allImagePaths.length,
    convertedImageCount,
    skippedImageCount,
    skippedGifCount,
    failedImageCount,
    replacedLinkCount,
    updatedBlockCount,
    totalSavedBytes,
  };
}
