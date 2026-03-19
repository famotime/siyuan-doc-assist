import { createDocWithMd, getDocMetaByID } from "@/services/kernel";
import { requestApi } from "@/services/request";

type LayoutNodeLike = {
  children?: unknown[];
  instance?: string;
};

type EditorModelLike = {
  rootId?: string;
  rootID?: string;
  notebookId?: string;
};

type TabLike = {
  pin?: boolean;
  instance?: string;
  title?: string;
  headElement?: HTMLElement | null;
  model?: EditorModelLike | null;
  children?: unknown;
};

type SystemConfLike = {
  conf?: {
    uiLayout?: {
      layout?: unknown;
    };
  };
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
  return (value as LayoutNodeLike).instance === "Tab"
    || "model" in value
    || "headElement" in value
    || "title" in value;
}

function isPinnedTab(tab: TabLike): boolean {
  if (tab.pin) {
    return true;
  }
  return Boolean(tab.headElement?.classList?.contains("item--pin"));
}

function getLayoutChildren(node: unknown): unknown[] {
  if (!node || typeof node !== "object") {
    return [];
  }
  return Array.isArray((node as LayoutNodeLike).children)
    ? ((node as LayoutNodeLike).children as unknown[])
    : [];
}

function getTabEditorModel(tab: TabLike): EditorModelLike | null {
  if (tab.model && typeof tab.model === "object") {
    return tab.model;
  }
  if (tab.children && !Array.isArray(tab.children) && typeof tab.children === "object") {
    return tab.children as EditorModelLike;
  }
  return null;
}

function collectFromTab(tab: TabLike, docs: Map<string, OpenedDocSummaryItem>) {
  if (isPinnedTab(tab)) {
    return;
  }

  const editor = getTabEditorModel(tab);
  const id = (editor?.rootId || editor?.rootID || "").trim();
  const notebookId = (editor?.notebookId || "").trim();
  if (!id || !notebookId || docs.has(id)) {
    return;
  }

  docs.set(id, {
    id,
    notebookId,
    title: (tab.title || id).trim() || id,
  });
}

function collectFromLayout(node: unknown, docs: Map<string, OpenedDocSummaryItem>) {
  if (!node || typeof node !== "object") {
    return;
  }

  if (isTabLike(node)) {
    collectFromTab(node, docs);
  }

  for (const child of getLayoutChildren(node)) {
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

async function getSystemUILayout(): Promise<unknown> {
  const conf = await requestApi<SystemConfLike>("/api/system/getConf");
  return conf?.conf?.uiLayout?.layout;
}

export async function collectOpenedUnpinnedDocs(): Promise<OpenedDocSummaryItem[]> {
  const docs = new Map<string, OpenedDocSummaryItem>();
  const siyuan = (window as any).siyuan;
  collectFromLayout(siyuan?.layout?.centerLayout, docs);
  collectFromLayout(siyuan?.config?.uiLayout?.layout, docs);
  if (!docs.size) {
    try {
      collectFromLayout(await getSystemUILayout(), docs);
    } catch {
      // Keep backward compatibility when the UI layout API is unavailable.
    }
  }
  return [...docs.values()];
}

export async function createOpenedDocsSummaryDoc(
  currentDocId: string
): Promise<OpenedDocsSummaryDoc> {
  const currentDoc = await getDocMetaByID(currentDocId);
  if (!currentDoc?.box) {
    throw new Error("未找到当前文档信息，无法生成汇总页");
  }

  const items = await collectOpenedUnpinnedDocs();
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
