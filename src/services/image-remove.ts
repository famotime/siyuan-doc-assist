import { removeMarkdownImageAssetLinks } from "@/core/image-webp-core";
import { updateBlockMarkdown } from "@/services/kernel";
import { escapeSqlLiteral, sqlPaged } from "@/services/kernel-shared";

type SqlDocBlockRow = {
  id: string;
  markdown: string;
};

export type RemoveDocImageLinksReport = {
  scannedImageLinkCount: number;
  removedLinkCount: number;
  updatedBlockCount: number;
  failedBlockCount: number;
};

const EMPTY_REPORT: RemoveDocImageLinksReport = {
  scannedImageLinkCount: 0,
  removedLinkCount: 0,
  updatedBlockCount: 0,
  failedBlockCount: 0,
};

export async function removeDocImageLinks(docId: string): Promise<RemoveDocImageLinksReport> {
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

  let scannedImageLinkCount = 0;
  let removedLinkCount = 0;
  let updatedBlockCount = 0;
  let failedBlockCount = 0;

  for (const block of blocks) {
    const source = block.markdown || "";
    if (!source) {
      continue;
    }
    const removed = removeMarkdownImageAssetLinks(source);
    if (removed.removedCount <= 0 || removed.markdown === source) {
      continue;
    }
    scannedImageLinkCount += removed.removedCount;
    try {
      await updateBlockMarkdown(block.id, removed.markdown);
      removedLinkCount += removed.removedCount;
      updatedBlockCount += 1;
    } catch {
      failedBlockCount += 1;
    }
  }

  return {
    scannedImageLinkCount,
    removedLinkCount,
    updatedBlockCount,
    failedBlockCount,
  };
}
