import {
  buildMonthlyDiaryMarkdown,
  buildMonthlyDiaryTitle,
  getMonthlyDiaryDayCount,
  normalizeMonthlyDiaryTemplate,
} from "@/core/monthly-diary-core";
import {
  createDocWithMd,
  getDocMetaByID,
  getNotebookConf,
  renderSprigTemplate,
} from "@/services/kernel";

type CreateMonthlyDiaryDocOptions = {
  currentDocId: string;
  template?: string;
  now?: Date;
};

export type MonthlyDiaryDoc = {
  id: string;
  title: string;
  path: string;
  dayCount: number;
};

export async function createMonthlyDiaryDoc(
  options: CreateMonthlyDiaryDocOptions
): Promise<MonthlyDiaryDoc> {
  const now = options.now || new Date();
  const docMeta = await getDocMetaByID(options.currentDocId);
  if (!docMeta?.box) {
    throw new Error("未找到当前文档信息，无法新建本月日记");
  }

  const notebookConf = await getNotebookConf(docMeta.box);
  const dailyNoteSavePath = (notebookConf?.conf?.dailyNoteSavePath || "").trim();
  if (!dailyNoteSavePath) {
    throw new Error("当前笔记本未配置 Daily Note 保存路径");
  }

  const renderedDailyNotePath = (await renderSprigTemplate(dailyNoteSavePath)).trim();
  if (!renderedDailyNotePath) {
    throw new Error("无法解析当前笔记本的 Daily Note 保存路径");
  }

  const title = buildMonthlyDiaryTitle(now);
  const path = joinDocHPath(getParentDocHPath(renderedDailyNotePath), title);
  const markdown = buildMonthlyDiaryMarkdown({
    template: normalizeMonthlyDiaryTemplate(options.template),
    now,
  });
  const id = await createDocWithMd(docMeta.box, path, markdown);

  return {
    id,
    title,
    path,
    dayCount: getMonthlyDiaryDayCount(now),
  };
}

function getParentDocHPath(hPath: string): string {
  const parts = (hPath || "").split("/").filter(Boolean);
  if (parts.length <= 1) {
    return "";
  }
  return `/${parts.slice(0, -1).join("/")}`;
}

function joinDocHPath(parentPath: string, title: string): string {
  const base = (parentPath || "").trim().replace(/\/+$/u, "");
  if (!base) {
    return `/${title}`;
  }
  return `${base}/${title}`;
}
