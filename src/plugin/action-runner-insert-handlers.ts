import { showMessage } from "siyuan";
import { appendBlock, renameDocByID } from "@/services/kernel";
import {
  filterDocRefsByExistingLinks,
  getBacklinkDocs,
  getChildDocs,
  toBacklinkMarkdown,
  toChildDocMarkdown,
} from "@/services/link-resolver";
import { createMonthlyDiaryDoc } from "@/services/monthly-diary";
import { resolveCurrentBlockId } from "@/plugin/action-runner-context";
import { PartialActionHandlerMap } from "@/plugin/action-runner-dispatcher";
import { ProtyleLike } from "@/plugin/doc-context";

type CreateInsertActionHandlersOptions = {
  getMonthlyDiaryTemplate?: () => string | undefined;
};

function findCurrentLineInElement(editable: HTMLElement, cursorOffset: number): string | null {
  const nodes: Array<{ text: string; offset: number }> = [];
  let offset = 0;
  const walker = document.createTreeWalker(editable, NodeFilter.SHOW_ALL);
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      const value = (current as Text).nodeValue || "";
      nodes.push({ text: value, offset });
      offset += value.length;
    } else if (
      current.nodeType === Node.ELEMENT_NODE &&
      (current as Element).tagName === "BR"
    ) {
      nodes.push({ text: "\n", offset });
      offset += 1;
    }
    current = walker.nextNode();
  }
  const fullText = nodes.map((n) => n.text).join("");
  const lines = fullText.split("\n");
  let charCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineEnd = charCount + lines[i].length;
    if (cursorOffset >= charCount && cursorOffset <= lineEnd) {
      const line = lines[i].trim();
      return line || null;
    }
    charCount = lineEnd + 1;
  }
  return null;
}

function resolveTextFromProtyle(docId: string, protyle?: ProtyleLike): string | null {
  if (typeof window === "undefined") return null;
  const selection = window.getSelection?.();
  if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
    const selectedText = selection.toString().trim();
    if (selectedText) return selectedText;
  }
  const root = protyle?.wysiwyg?.element as HTMLElement | undefined;
  if (!root) return null;
  const current = resolveCurrentBlockId(docId, protyle);
  const blockId = current.id;
  if (!blockId) return null;
  const blockEl = root.querySelector(`[data-node-id="${blockId}"]`) as HTMLElement | null;
  if (!blockEl) return null;
  const editable =
    (blockEl.querySelector('[contenteditable="true"]') as HTMLElement | null) || blockEl;
  if (selection && selection.rangeCount > 0) {
    const anchorNode = selection.anchorNode;
    if (anchorNode && editable.contains(anchorNode)) {
      let cursorOffset = 0;
      const walker = document.createTreeWalker(editable, NodeFilter.SHOW_ALL);
      let node = walker.nextNode();
      while (node) {
        if (node === anchorNode) {
          if (anchorNode.nodeType === Node.TEXT_NODE) {
            cursorOffset += selection.anchorOffset;
          } else if (
            anchorNode.nodeType === Node.ELEMENT_NODE &&
            (anchorNode as Element).tagName === "BR" &&
            selection.anchorOffset > 0
          ) {
            cursorOffset += 1;
          }
          break;
        }
        if (node.nodeType === Node.TEXT_NODE) {
          cursorOffset += ((node as Text).nodeValue || "").length;
        } else if (
          node.nodeType === Node.ELEMENT_NODE &&
          (node as Element).tagName === "BR"
        ) {
          cursorOffset += 1;
        }
        node = walker.nextNode();
      }
      const line = findCurrentLineInElement(editable, cursorOffset);
      if (line) return line;
    }
  }
  const text = (editable.textContent || "").trim();
  return text || null;
}

export function createInsertActionHandlers(
  options: CreateInsertActionHandlersOptions = {}
): PartialActionHandlerMap {
  return {
    "set-selection-as-title": async (docId, protyle) => {
      const text = resolveTextFromProtyle(docId, protyle);
      if (!text) {
        showMessage("未找到可用内容，请先选中文字或将光标置于段落中", 5000, "info");
        return;
      }
      await renameDocByID(docId, text);
      showMessage(`已将文档标题设为：${text}`, 5000, "info");
    },
    "insert-backlinks": async (docId) => {
      const backlinks = await getBacklinkDocs(docId);
      if (!backlinks.length) {
        showMessage("当前文档没有可插入的反向链接文档", 5000, "info");
        return;
      }
      const filtered = await filterDocRefsByExistingLinks(docId, backlinks);
      if (!filtered.items.length) {
        showMessage("当前文档已包含所有反向链接文档", 5000, "info");
        return;
      }
      const markdown = toBacklinkMarkdown(filtered.items);
      await appendBlock(markdown, docId);
      const skipSuffix = filtered.skipped.length ? `，跳过已存在 ${filtered.skipped.length} 个` : "";
      showMessage(`已插入 ${filtered.items.length} 个反链文档链接${skipSuffix}`, 5000, "info");
    },
    "insert-child-docs": async (docId) => {
      const childDocs = await getChildDocs(docId);
      if (!childDocs.length) {
        showMessage("当前文档没有可插入的子文档", 5000, "info");
        return;
      }
      const filtered = await filterDocRefsByExistingLinks(docId, childDocs);
      if (!filtered.items.length) {
        showMessage("当前文档已包含所有子文档链接", 5000, "info");
        return;
      }
      const markdown = toChildDocMarkdown(filtered.items);
      await appendBlock(markdown, docId);
      const skipSuffix = filtered.skipped.length ? `，跳过已存在 ${filtered.skipped.length} 个` : "";
      showMessage(`已插入 ${filtered.items.length} 个子文档链接${skipSuffix}`, 5000, "info");
    },
    "create-monthly-diary": async (docId) => {
      const result = await createMonthlyDiaryDoc({
        currentDocId: docId,
        template: options.getMonthlyDiaryTemplate?.(),
      });
      showMessage(`已创建本月日记：${result.title}（${result.dayCount} 天）`, 5000, "info");
    },
  };
}
