import { getAllModels, openTab } from "siyuan";
import { formatDocIconHtml, OpenDocTabItem, RecentDocItem } from "@/core/dynamic-outline-core";
import { getParentDocPath, SiblingDocRef } from "@/core/doc-navigation-core";
import { FileTreeDoc, getPathByID, getRecentDocs, listDocsByPath } from "@/services/kernel-file";

export type OpenDocTabRef = OpenDocTabItem & {
  tab?: unknown;
  wnd?: unknown;
  headElement?: HTMLElement;
};

/**
 * 查询当前文档在文档树中同一层级的兄弟文档。
 * listDocsByPath 不传 sort 时由内核按文档树生效排序返回（含每文档/笔记本级覆盖）。
 */
export async function fetchSiblingDocs(currentDocId: string): Promise<SiblingDocRef[]> {
  const pathInfo = await getPathByID(currentDocId);
  if (!pathInfo?.path) {
    throw new Error("无法获取当前文档路径");
  }
  const parentPath = getParentDocPath(pathInfo.path);
  const files: FileTreeDoc[] = await listDocsByPath(pathInfo.notebook, parentPath);
  return files.map((file) => ({ id: file.id, name: file.name }));
}

/** 打开目标文档：已打开则聚焦其标签页，未打开则新开标签页 */
export async function openDocTab(app: unknown, docId: string): Promise<unknown> {
  return openTab({ app: app as any, doc: { id: docId } });
}

/** 关闭指定文档所在的标签页（走前端模型链，与原生 ⌘W 行为一致） */
export function closeDocTab(protyle: unknown): boolean {
  const tab = (protyle as any)?.model?.parent;
  if (tab && typeof tab.close === "function") {
    tab.close();
    return true;
  }
  return false;
}

/** 通过 DOM 元素反查其所属编辑器的 protyle 实例 */
export function findProtyleByElement(target: HTMLElement | null): unknown {
  if (!target) {
    return undefined;
  }
  const editors = (getAllModels() as any)?.editor;
  if (!Array.isArray(editors)) {
    return undefined;
  }
  for (const editor of editors) {
    const protyle = editor?.editor?.protyle;
    const element = protyle?.element;
    if (element && (element === target || element.contains(target))) {
      return protyle;
    }
  }
  return undefined;
}

function parseTabInitData(headElement?: HTMLElement): { instance?: string; rootId?: string; title?: string } | null {
  const raw = headElement?.getAttribute("data-initdata");
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as { instance?: string; rootId?: string; title?: string };
  } catch {
    return null;
  }
}

/** 获取当前编辑器所属分屏（Wnd）内所有已打开的文档页签（含常驻钉住与未激活页签） */
export function collectCurrentWndOpenDocTabs(protyle: unknown): OpenDocTabRef[] {
  const currentTab = (protyle as any)?.model?.parent;
  const wnd = currentTab?.parent;
  const children = wnd?.children;
  if (!Array.isArray(children)) {
    return [];
  }

  const result: OpenDocTabRef[] = [];
  for (const tab of children) {
    const headElement = tab?.headElement as HTMLElement | undefined;
    const editorRootId = tab?.model?.editor?.protyle?.block?.rootID as string | undefined;
    const initData = editorRootId ? null : parseTabInitData(headElement);
    const docId = editorRootId || (initData?.instance === "Editor" ? initData.rootId : undefined);
    if (!docId) {
      continue;
    }

    const titleFromHead = headElement?.querySelector(".item__text")?.textContent?.trim();
    const title = titleFromHead || (tab?.title as string | undefined) || initData?.title || "未命名文档";
    const iconHtml = headElement?.querySelector(".item__icon")?.innerHTML?.trim() || undefined;
    const isPinned = Boolean(headElement?.classList?.contains("item--pin"));
    const isActive = Boolean(headElement?.classList?.contains("item--focus"));

    result.push({
      tabId: String(tab?.id || docId),
      docId,
      title,
      iconHtml,
      isPinned,
      isActive,
      tab,
      wnd,
      headElement
    });
  }

  return result;
}

/** 激活当前分屏中的目标文档页签；若页签 DOM 已失效则回退为 openTab */
export async function activateOpenDocTab(target: OpenDocTabRef, app?: unknown): Promise<unknown> {
  const wnd = target.wnd as { switchTab?: (head: HTMLElement, pushBack?: boolean) => void } | undefined;
  if (wnd && typeof wnd.switchTab === "function" && target.headElement && document.contains(target.headElement)) {
    wnd.switchTab(target.headElement, true);
    return undefined;
  }
  if (target.docId) {
    return openDocTab(app, target.docId);
  }
  return undefined;
}

/** 关闭指定已打开文档页签；优先调用 tab.close()，不可用时回退到 wnd.removeTab */
export function closeOpenDocTab(target: OpenDocTabRef): boolean {
  const tab = target.tab as { close?: () => void } | undefined;
  if (tab && typeof tab.close === "function") {
    tab.close();
    return true;
  }
  const wnd = target.wnd as { removeTab?: (id: string) => void } | undefined;
  if (wnd && typeof wnd.removeTab === "function" && target.tabId) {
    wnd.removeTab(target.tabId);
    return true;
  }
  return false;
}

/** 查询思源内置“最近打开的文档”列表，沿用当前 fileTree.recentDocsSort 排序 */
export async function fetchRecentDocItems(): Promise<RecentDocItem[]> {
  const sortBy = (window as any)?.siyuan?.config?.fileTree?.recentDocsSort as string | undefined;
  const recentDocs = await getRecentDocs(sortBy);
  return recentDocs
    .filter((doc) => Boolean(doc?.rootID))
    .map((doc) => ({
      docId: doc.rootID,
      title: (doc.title || "").trim() || "未命名文档",
      iconHtml: formatDocIconHtml(doc.icon),
      viewedAt: doc.viewedAt,
      closedAt: doc.closedAt,
      openAt: doc.openAt
    }));
}
