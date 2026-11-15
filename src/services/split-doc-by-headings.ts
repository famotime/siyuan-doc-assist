import {
  getDocMetaByID,
  getChildBlocksByParentId,
  createDocWithMd,
  deleteBlocksByIds
} from "@/services/kernel";
import { splitDocByHeadingsCore } from "@/core/split-doc-by-headings-core";

const INVALID_TITLE_RE = /[\\/:*?"<>|]/g;

export type SplitReport = {
  sectionCount: number;
  createdDocIds: string[];
  deletedBlockCount: number;
};

function sanitizeDocTitle(title: string): string {
  return title.replace(INVALID_TITLE_RE, "").trim();
}

export async function splitDocByHeadings(docId: string): Promise<SplitReport> {
  const docMeta = await getDocMetaByID(docId);
  if (!docMeta) {
    throw new Error("无法获取文档信息");
  }

  const blocks = await getChildBlocksByParentId(docId);
  const { sections } = splitDocByHeadingsCore(blocks);

  if (sections.length === 0) {
    throw new Error("文档中未找到标题，无法拆分");
  }
  if (sections.length === 1) {
    throw new Error("文档中仅有一个最高级标题，无需拆分");
  }

  const createdDocIds: string[] = [];
  for (const section of sections) {
    const title = sanitizeDocTitle(section.title) || "未命名";
    const childHPath = `${docMeta.hPath}/${title}`;
    const newDocId = await createDocWithMd(docMeta.box, childHPath, section.markdown);
    createdDocIds.push(newDocId);
  }

  const allBlockIds = sections.flatMap((s) => s.blockIds);
  const deleteResult = await deleteBlocksByIds(allBlockIds);

  return {
    sectionCount: sections.length,
    createdDocIds,
    deletedBlockCount: deleteResult.deletedCount
  };
}
