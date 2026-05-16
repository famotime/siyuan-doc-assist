import {
  collectDisplaySizedLocalImageCandidatesFromMarkdown,
  rewriteDisplaySizedMarkdownImageAssetLinks,
} from "@/core/image-display-size-core";
import { updateBlockMarkdown } from "@/services/kernel";
import { escapeSqlLiteral, sqlPaged } from "@/services/kernel-shared";
import { resizeLocalAssetImageByDisplaySize } from "@/services/image-display-size-converter";

type SqlDocBlockRow = {
  id: string;
  markdown: string;
};

type ResizeIntent = {
  width: number | null;
  height: number | null;
  conflicted: boolean;
};

export type ResizeDocImagesToDisplayReport = {
  scannedImageCount: number;
  resizedImageCount: number;
  skippedImageCount: number;
  failedImageCount: number;
  failedBlockCount: number;
  replacedLinkCount: number;
  updatedBlockCount: number;
  totalSavedBytes: number;
};

const EMPTY_REPORT: ResizeDocImagesToDisplayReport = {
  scannedImageCount: 0,
  resizedImageCount: 0,
  skippedImageCount: 0,
  failedImageCount: 0,
  failedBlockCount: 0,
  replacedLinkCount: 0,
  updatedBlockCount: 0,
  totalSavedBytes: 0,
};

export async function resizeDocImagesToDisplay(
  docId: string
): Promise<ResizeDocImagesToDisplayReport> {
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

  const intentByAsset = new Map<string, ResizeIntent>();
  for (const block of blocks) {
    const candidates = collectDisplaySizedLocalImageCandidatesFromMarkdown(block.markdown || "");
    for (const candidate of candidates) {
      const current = intentByAsset.get(candidate.assetPath);
      if (!current) {
        intentByAsset.set(candidate.assetPath, {
          width: candidate.width,
          height: candidate.height,
          conflicted: false,
        });
        continue;
      }
      if (current.width !== candidate.width || current.height !== candidate.height) {
        current.conflicted = true;
      }
    }
  }
  if (!intentByAsset.size) {
    return { ...EMPTY_REPORT };
  }

  const replacementMap = new Map<string, string>();
  let resizedImageCount = 0;
  let skippedImageCount = 0;
  let failedImageCount = 0;
  let totalSavedBytes = 0;

  for (const [assetPath, intent] of intentByAsset.entries()) {
    if (intent.conflicted) {
      skippedImageCount += 1;
      continue;
    }
    try {
      const result = await resizeLocalAssetImageByDisplaySize(assetPath, {
        width: intent.width,
        height: intent.height,
      });
      if (!result.converted) {
        skippedImageCount += 1;
        continue;
      }
      resizedImageCount += 1;
      totalSavedBytes += Math.max(0, result.savedBytes || 0);
      replacementMap.set(result.sourceAssetPath, result.targetAssetPath);
    } catch {
      failedImageCount += 1;
    }
  }

  let replacedLinkCount = 0;
  let updatedBlockCount = 0;
  let failedBlockCount = 0;
  if (replacementMap.size > 0) {
    const replacements = Object.fromEntries(replacementMap.entries());
    for (const block of blocks) {
      const source = block.markdown || "";
      if (!source) {
        continue;
      }
      const replaced = rewriteDisplaySizedMarkdownImageAssetLinks(source, replacements);
      if (replaced.replacedCount <= 0 || replaced.markdown === source) {
        continue;
      }
      try {
        await updateBlockMarkdown(block.id, replaced.markdown);
        replacedLinkCount += replaced.replacedCount;
        updatedBlockCount += 1;
      } catch {
        failedBlockCount += 1;
      }
    }
  }

  return {
    scannedImageCount: intentByAsset.size,
    resizedImageCount,
    skippedImageCount,
    failedImageCount,
    failedBlockCount,
    replacedLinkCount,
    updatedBlockCount,
    totalSavedBytes,
  };
}
