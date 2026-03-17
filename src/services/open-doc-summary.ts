import { createDocWithMd, getDocMetaByID } from "@/services/kernel";

type LayoutNodeLike = {
  children?: unknown[];
};

type EditorModelLike = {
  rootId?: string;
  notebookId?: string;
};

type TabLike = {
  pin?: boolean;
  title?: string;
  headElement?: HTMLElement | null;
  model?: EditorModelLike | null;
};

export type OpenedDocSummaryItem = {
  id: string;
  notebookId: string;
  title: string;
};

export type OpenedDocsSummaryDoc = {
  id: string;
  title: string;
  docCount: number;
};

function isTabLike(value: unknown): value is TabLike {
  if (!value || typeof value !== "object") {
    return false;
  }
  return "model" in value || "headElement" in value || "title" in value;
}

function isPinnedTab(tab: TabLike): boolean {
  if (tab.pin) {
    return true;
  }
  return Boolean(tab.headElement?.classList?.contains("item--pin"));
}

function collectFromLayout(node: unknown, docs: Map<string, OpenedDocSummaryItem>) {
  if (!node || typeof node !== "object") {
    return;
  }

  const children = Array.isArray((node as LayoutNodeLike).children)
    ? ((node as LayoutNodeLike).children as unknown[])
    : [];
  for (const child of children) {
    if (isTabLike(child)) {
      if (isPinnedTab(child)) {
        continue;
      }
      const id = (child.model?.rootId || "").trim();
      const notebookId = (child.model?.notebookId || "").trim();
      if (!id || !notebookId || docs.has(id)) {
        continue;
      }
      docs.set(id, {
        id,
        notebookId,
        title: (child.title || id).trim() || id,
      });
      continue;
    }
    collectFromLayout(child, docs);
  }
}

function buildSummaryDocTitle(now = new Date()): string {
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `已打开文档汇总页-${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

function getParentHPath(hPath: string): string {
  const parts = (hPath || "").split("/").filter(Boolean);
  if (parts.length <= 1) {
    return "";
  }
  return `/${parts.slice(0, -1).join("/")}`;
}

function joinDocHPath(parentPath: string, title: string): string {
  if (!parentPath) {
    return `/${title}`;
  }
  return `${parentPath}/${title}`;
}

function toSummaryMarkdown(items: OpenedDocSummaryItem[]): string {
  return items.map((item) => `- [${item.title}](siyuan://blocks/${item.id})`).join("\n");
}

export function collectOpenedUnpinnedDocs(): OpenedDocSummaryItem[] {
  const docs = new Map<string, OpenedDocSummaryItem>();
  const centerLayout = (window as any).siyuan?.layout?.centerLayout;
  collectFromLayout(centerLayout, docs);
  return [...docs.values()];
}

export async function createOpenedDocsSummaryDoc(
  currentDocId: string
): Promise<OpenedDocsSummaryDoc> {
  const currentDoc = await getDocMetaByID(currentDocId);
  if (!currentDoc?.box) {
    throw new Error("未找到当前文档信息，无法生成汇总页");
  }

  const items = collectOpenedUnpinnedDocs();
  if (!items.length) {
    throw new Error("当前没有未钉住的已打开文档");
  }

  const title = buildSummaryDocTitle();
  const parentPath = getParentHPath(currentDoc.hPath);
  const path = joinDocHPath(parentPath, title);
  const markdown = toSummaryMarkdown(items);
  const id = await createDocWithMd(currentDoc.box, path, markdown);

  return {
    id,
    title,
    docCount: items.length,
  };
}
