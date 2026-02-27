import { KeyInfoItem, KeyInfoType } from "@/core/key-info-core";
import {
  buildInlineRaw,
  cleanInlineText,
  extractInlineMemoHint,
  formatRemarkText,
  normalizeListDecoratedText,
  normalizeSort,
  parseInlineMemoFromText,
  resolveSpanFormatType,
  SqlSpanRow,
  tokenizeType,
} from "@/services/key-info-model";

type ProtyleLike = {
  wysiwyg?: {
    element?: unknown;
  };
};

function getProtyleRootElement(protyle: unknown): HTMLElement | undefined {
  if (!protyle || typeof protyle !== "object") {
    return undefined;
  }
  const root = (protyle as ProtyleLike).wysiwyg?.element;
  if (!root || typeof root !== "object") {
    return undefined;
  }
  const candidate = root as Record<string, unknown>;
  if (typeof candidate.querySelectorAll !== "function") {
    return undefined;
  }
  return root as HTMLElement;
}

export function mapSpanRowsToItems(
  spans: SqlSpanRow[],
  blockSortMap: Map<string, number>,
  resolveListLine?: (blockId?: string) => { listItem: boolean; listPrefix?: string }
): KeyInfoItem[] {
  const items: KeyInfoItem[] = [];
  let order = 0;
  spans.forEach((span) => {
    const type = resolveSpanFormatType(span.type || "", span.ial);
    if (!type) {
      return;
    }
    const rawSource = (span.markdown || "").trim();
    const content = cleanInlineText(span.content || rawSource);
    if (!content) {
      return;
    }
    const blockId = span.block_id || span.root_id;
    const blockSort =
      blockSortMap.get(blockId) ??
      normalizeSort(span.block_sort ?? Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    const offsetRaw =
      span.start_offset ??
      span.start ??
      span.offset ??
      span.pos ??
      span.position ??
      order;
    const offset = normalizeSort(offsetRaw as number | string, order);

    let text = content;
    let raw = rawSource;
    if (type === "tag") {
      const tagText = content.replace(/^#+/, "");
      text = tagText || content;
      raw = raw || `#${text}`;
    } else if (type === "remark") {
      const memoHint = extractInlineMemoHint(span.ial);
      const memoResult = parseInlineMemoFromText(content, memoHint);
      text = formatRemarkText(memoResult.marked, memoResult.memo);
      raw = raw || text;
    } else {
      raw = raw || buildInlineRaw(type, text);
    }
    const listLine = resolveListLine?.(blockId) || { listItem: false };
    if (listLine.listPrefix) {
      text = normalizeListDecoratedText(text);
    }

    items.push({
      id: `span-${span.id || blockId}-${order}`,
      type,
      text,
      raw,
      offset,
      blockId,
      blockSort,
      order,
      listItem: listLine.listItem,
      listPrefix: listLine.listPrefix,
    });
    order += 1;
  });
  return items;
}

export function extractInlineFromDom(
  protyle: unknown,
  blockSortMap: Map<string, number>,
  docId: string,
  resolveListLine?: (blockId?: string) => { listItem: boolean; listPrefix?: string }
): KeyInfoItem[] {
  const root = getProtyleRootElement(protyle);
  if (!root) {
    return [];
  }
  const selectors = [
    "strong",
    "b",
    "[data-type='strong']",
    "em",
    "i",
    "[data-type='em']",
    "mark",
    "[data-type='mark']",
    "[data-type='textmark']",
    "[data-type='text']",
    "span[data-type='inline-memo']",
    "span[data-inline-memo-content]",
    "span[data-memo-content]",
    "span[data-memo]",
    "span[data-type='tag']",
  ];
  const elements = root.querySelectorAll(selectors.join(","));
  const items: KeyInfoItem[] = [];
  let order = 0;
  elements.forEach((element) => {
    const dataType = (element.getAttribute("data-type") || "").toLowerCase();
    const dataSubtype = (element.getAttribute("data-subtype") || "").toLowerCase();
    const tagName = element.tagName.toLowerCase();
    const tokens = tokenizeType(`${dataType} ${dataSubtype}`);
    const hasToken = (token: string) => tokens.includes(token);
    const textContent = cleanInlineText(element.textContent || "");
    if (!textContent) {
      return;
    }

    let type: KeyInfoType | null = null;
    let text = textContent;
    let raw = "";

    const memoHint =
      element.getAttribute("data-inline-memo-content") ||
      element.getAttribute("data-memo-content") ||
      element.getAttribute("data-memo") ||
      element.getAttribute("title") ||
      "";

    const hasInlineMemo =
      dataType.includes("inline-memo") ||
      (hasToken("inline") && hasToken("memo")) ||
      !!memoHint;

    if (hasInlineMemo) {
      type = "remark";
      const memoResult = parseInlineMemoFromText(textContent, memoHint);
      text = formatRemarkText(memoResult.marked, memoResult.memo);
      raw = text;
    } else if (dataType === "tag" || hasToken("tag")) {
      type = "tag";
      const tagText = textContent.replace(/^#+/, "");
      text = tagText || textContent;
      raw = `#${text}`;
    } else if (
      tagName === "strong" ||
      tagName === "b" ||
      dataType === "strong" ||
      hasToken("strong")
    ) {
      type = "bold";
      raw = buildInlineRaw(type, text);
    } else if (
      tagName === "em" ||
      tagName === "i" ||
      dataType === "em" ||
      hasToken("em")
    ) {
      type = "italic";
      raw = buildInlineRaw(type, text);
    } else if (
      tagName === "mark" ||
      dataType === "mark" ||
      dataType === "textmark" ||
      dataType === "text" ||
      hasToken("mark") ||
      hasToken("textmark") ||
      hasToken("text")
    ) {
      type = "highlight";
      const innerHtml = (element as HTMLElement).innerHTML || "";
      raw = innerHtml ? `==${innerHtml}==` : buildInlineRaw(type, text);
    }

    if (!type) {
      return;
    }

    const blockElement = element.closest("[data-node-id]") as HTMLElement | null;
    const blockId =
      blockElement?.dataset.nodeId ||
      blockElement?.getAttribute("data-node-id") ||
      docId;
    const blockSort =
      blockSortMap.get(blockId) ?? blockSortMap.get(docId) ?? 0;
    const listLine = resolveListLine?.(blockId) || { listItem: false };
    if (listLine.listPrefix) {
      text = normalizeListDecoratedText(text);
    }

    items.push({
      id: `dom-${blockId}-${order}`,
      type,
      text,
      raw,
      offset: order,
      blockId,
      blockSort,
      order,
      listItem: listLine.listItem,
      listPrefix: listLine.listPrefix,
    });
    order += 1;
  });
  return items;
}

export function getDomBlockSortMap(protyle: unknown): Map<string, number> {
  const map = new Map<string, number>();
  const root = getProtyleRootElement(protyle);
  if (!root) {
    return map;
  }
  const elements = root.querySelectorAll("[data-node-id]");
  let index = 0;
  elements.forEach((element) => {
    const id =
      element.getAttribute("data-node-id") ||
      (element as HTMLElement).dataset.nodeId;
    if (!id || map.has(id)) {
      return;
    }
    map.set(id, index);
    index += 1;
  });
  return map;
}
