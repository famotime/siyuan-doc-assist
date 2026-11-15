import { getAllModels, openTab } from "siyuan";
import { getParentDocPath, SiblingDocRef } from "@/core/doc-navigation-core";
import { FileTreeDoc, getPathByID, listDocsByPath } from "@/services/kernel-file";

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
