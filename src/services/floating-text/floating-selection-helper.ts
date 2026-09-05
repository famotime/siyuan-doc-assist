import { ProtyleLike } from "@/plugin/doc-context";
import {
  getSelectedBlockIds,
  getSelectedImageAssetPaths,
} from "@/plugin/action-runner-context";
import { getBlockKramdowns } from "@/services/kernel";
import {
  formatListItemMarkdown,
  stripKramdownBlockAttributes,
} from "@/core/floating-text-core";

function resolveRangeBlockElement(container: Node | null): HTMLElement | null {
  if (!container) {
    return null;
  }
  const baseElement =
    container.nodeType === Node.ELEMENT_NODE
      ? (container as Element)
      : container.parentElement;
  if (!baseElement) {
    return null;
  }
  return (baseElement.closest?.("[data-node-id]") as HTMLElement) || null;
}

/**
 * 从选区 Range 中提取文本并保留图片 Markdown 标记
 */
export function extractTextFromRange(range: Range): string {
  if (!range) {
    return "";
  }

  // 1. 检查选区片段中是否存在图片元素 (如 span[data-type="img"] 或 <img>)
  try {
    if (typeof range.cloneContents === "function") {
      const fragment = range.cloneContents();
      const hasImg = fragment.querySelector("img, [data-type='img']");
      if (hasImg) {
        const container = document.createElement("div");
        container.appendChild(fragment);

        // 替换所有包装为 [data-type="img"] 的图片节点
        const imgWrappers = Array.from(
          container.querySelectorAll<HTMLElement>('[data-type="img"]')
        );
        imgWrappers.forEach((wrapper) => {
          const img =
            wrapper.querySelector("img") ||
            (wrapper.tagName === "IMG" ? (wrapper as HTMLImageElement) : null);
          const src =
            img?.getAttribute("data-src") || img?.getAttribute("src") || "";
          const alt =
            img?.getAttribute("alt") || img?.getAttribute("title") || "";
          if (src) {
            wrapper.replaceWith(document.createTextNode(` ![${alt}](${src}) `));
          }
        });

        // 替换其余独立 <img>
        const standaloneImgs = Array.from(
          container.querySelectorAll<HTMLImageElement>("img")
        );
        standaloneImgs.forEach((img) => {
          const src =
            img.getAttribute("data-src") || img.getAttribute("src") || "";
          const alt =
            img.getAttribute("alt") || img.getAttribute("title") || "";
          if (src) {
            img.replaceWith(document.createTextNode(` ![${alt}](${src}) `));
          }
        });

        container.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
        container
          .querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6")
          .forEach((block) => {
            block.after(document.createTextNode("\n"));
          });

        const withImgText = (container.textContent || "")
          .replace(/\r\n/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();

        if (withImgText) {
          return withImgText;
        }
      }
    }
  } catch (err) {
    console.warn(
      "[DocAssistant][FloatingSelection] range clone image extract failed:",
      err
    );
  }

  return (range.toString ? range.toString() : "").trim();
}

/**
 * 智能从当前选区中提取完整的 Markdown 文本（尤其保留列表项等语法标记与图片）
 */
export async function extractFloatingMarkdownFromSelection(
  protyle?: ProtyleLike,
  explicitRange?: Range | null
): Promise<string> {
  // 1. 优先检查是否存在块级多选（用户框选了完整块，带 .protyle-wysiwyg--select）
  const selectedBlockIds = getSelectedBlockIds(protyle);
  if (selectedBlockIds && selectedBlockIds.length > 0) {
    try {
      const kramdowns = await getBlockKramdowns(selectedBlockIds);
      const rawContent = kramdowns
        .map((item) => (item?.kramdown || "").trim())
        .filter(Boolean)
        .join("\n\n");
      const cleaned = stripKramdownBlockAttributes(rawContent);
      if (cleaned) {
        return cleaned;
      }
    } catch (e) {
      console.warn("[DocAssistant][FloatingSelection] getBlockKramdowns failed:", e);
    }
  }

  // 2. 检查是否有单独点击选中的图片节点
  const selectedImagePaths = getSelectedImageAssetPaths(protyle);
  if (
    selectedImagePaths &&
    selectedImagePaths.length > 0 &&
    (!explicitRange || explicitRange.collapsed)
  ) {
    return selectedImagePaths.map((p) => `![](${p})`).join("\n\n");
  }

  // 3. 检查行内选区 (Range Selection)，优先使用传入的显式选区
  let range: Range | null = explicitRange || null;
  if (!range) {
    const toolbarRange =
      (protyle as any)?.toolbar?.range ||
      (protyle as any)?.protyle?.toolbar?.range ||
      (protyle as any)?.range;
    if (toolbarRange && typeof toolbarRange.cloneRange === "function") {
      range = toolbarRange;
    }
  }
  if (!range && typeof window !== "undefined") {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      range = sel.getRangeAt(0);
    }
  }

  if (!range) {
    return "";
  }

  const selectedText = extractTextFromRange(range);
  if (!selectedText) {
    return "";
  }

  // 3. 检查选区是否涉及列表项 (NodeListItem)
  try {
    const startBlock = resolveRangeBlockElement(range.startContainer);
    const endBlock = resolveRangeBlockElement(range.endContainer);

    const startListItem = (startBlock?.closest?.(
      '[data-type="NodeListItem"]'
    ) as HTMLElement) || null;
    const endListItem = (endBlock?.closest?.(
      '[data-type="NodeListItem"]'
    ) as HTMLElement) || null;

    // 如果选区涉及列表项
    if (startListItem || endListItem) {
      // 3.1 若选区跨越了多个列表项（或者不同块）
      if (startListItem && endListItem && startListItem !== endListItem) {
        // 优先在最近的编辑器容器或父容器中按 DOM 顺序检索涉及的所有列表项（支持嵌套列表与同级列表）
        const editorContainer =
          startListItem.closest(".protyle-wysiwyg") ||
          endListItem.closest(".protyle-wysiwyg") ||
          startListItem.parentElement;

        let involvedItems: HTMLElement[] = [];
        if (editorContainer) {
          const allItems = Array.from(
            editorContainer.querySelectorAll<HTMLElement>('[data-type="NodeListItem"]')
          );
          const startIndex = allItems.indexOf(startListItem);
          const endIndex = allItems.indexOf(endListItem);
          if (startIndex !== -1 && endIndex !== -1) {
            const [fromIdx, toIdx] =
              startIndex <= endIndex
                ? [startIndex, endIndex]
                : [endIndex, startIndex];
            involvedItems = allItems.slice(fromIdx, toIdx + 1);
          }
        }

        if (involvedItems.length > 0) {
          const involvedIds = involvedItems
            .map((el) => el.getAttribute("data-node-id") || el.dataset.nodeId || "")
            .filter(Boolean);

          if (involvedIds.length > 0) {
            try {
              const kramdowns = await getBlockKramdowns(involvedIds);
              const raw = kramdowns
                .map((item) => (item?.kramdown || "").trim())
                .filter(Boolean)
                .join("\n");
              const cleaned = stripKramdownBlockAttributes(raw);
              if (cleaned) {
                return cleaned;
              }
            } catch (err) {
              console.warn("[DocAssistant][FloatingSelection] multi-item kramdown failed:", err);
            }
          }
        }
      }

      // 3.2 选区在同一个列表项内部
      const targetItem = startListItem || endListItem;
      if (targetItem) {
        const itemId =
          targetItem.getAttribute("data-node-id") || targetItem.dataset.nodeId || "";
        const itemText = (targetItem.innerText || "").trim();

        // 若划选的文本占到了列表项的大部分（或长度相当），直接读取该列表项块的完整 Kramdown
        const isNearWholeItem =
          selectedText.length >= itemText.length * 0.5 ||
          selectedText === itemText;

        if (itemId && isNearWholeItem) {
          try {
            const kramdowns = await getBlockKramdowns([itemId]);
            const raw = (kramdowns[0]?.kramdown || "").trim();
            const cleaned = stripKramdownBlockAttributes(raw);
            if (cleaned) {
              return cleaned;
            }
          } catch (err) {
            console.warn("[DocAssistant][FloatingSelection] single-item kramdown failed:", err);
          }
        }

        const isDone =
          targetItem.classList.contains("protyle-task--done") ||
          Boolean(targetItem.querySelector?.(".protyle-task--done, input[type='checkbox']:checked"));

        // 降级兜底：若选中文本本身未带列表前缀，根据列表类型为每行补齐标记
        if (
          !selectedText.startsWith("- ") &&
          !selectedText.startsWith("* ") &&
          !/^\d+\.\s+/.test(selectedText)
        ) {
          const listContainer = targetItem.closest('[data-type="NodeList"]');
          const subtype = listContainer?.getAttribute("data-subtype") || "u";
          const lines = selectedText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          if (lines.length > 1) {
            return lines
              .map((line, idx) => formatListItemMarkdown(line, subtype, idx + 1, isDone))
              .join("\n");
          }
          return formatListItemMarkdown(selectedText, subtype, 1, isDone);
        }
      }
    }
  } catch (err) {
    console.warn("[DocAssistant][FloatingSelection] resolve list context failed:", err);
  }

  // 4. 普通划选文本直接返回
  return selectedText;
}
