import {
  getDocMetaByID,
  getChildBlocksByParentId,
  createDocWithMd,
  deleteBlocksByIds
} from "@/services/kernel";
import { splitDocByHeadingsCore } from "@/core/split-doc-by-headings-core";
import { createDocAssistantLogger } from "@/core/logger-core";

const INVALID_TITLE_RE = /[\\/:*?"<>|]/g;

const splitLogger = createDocAssistantLogger("SplitDoc");

export type SplitReport = {
  sectionCount: number;
  createdDocIds: string[];
  deletedBlockCount: number;
  /** 创建失败的子文档标题；非空表示部分失败，此时原文档保留未删除（审计 2.5） */
  failedSectionTitles: string[];
  /** 首个创建失败的错误信息，便于上层呈现 */
  firstErrorMessage?: string;
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

  // 逐项容错：单个子文档创建失败（如同名 title 触发 hPath 冲突）不再中止整体，
  // 而是记录失败项；只要存在失败就保留原文档，避免「半成品 + 原文被删」。
  const createdDocIds: string[] = [];
  const failedSectionTitles: string[] = [];
  let firstErrorMessage: string | undefined;
  for (const section of sections) {
    const title = sanitizeDocTitle(section.title) || "未命名";
    const childHPath = `${docMeta.hPath}/${title}`;
    try {
      const newDocId = await createDocWithMd(docMeta.box, childHPath, section.markdown);
      createdDocIds.push(newDocId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      firstErrorMessage ??= message;
      failedSectionTitles.push(title);
      splitLogger.warn("create child doc failed", { title, childHPath, error: message });
    }
  }

  if (createdDocIds.length === 0) {
    throw new Error(firstErrorMessage || "创建子文档全部失败");
  }

  if (failedSectionTitles.length > 0) {
    // 部分失败：不删除原文档内容，报告已建 N 个子文档供上层汇总
    return {
      sectionCount: sections.length,
      createdDocIds,
      deletedBlockCount: 0,
      failedSectionTitles,
      firstErrorMessage
    };
  }

  const allBlockIds = sections.flatMap((s) => s.blockIds);
  const deleteResult = await deleteBlocksByIds(allBlockIds);

  return {
    sectionCount: sections.length,
    createdDocIds,
    deletedBlockCount: deleteResult.deletedCount,
    failedSectionTitles: []
  };
}
