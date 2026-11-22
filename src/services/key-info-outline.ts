import { KeyInfoItem } from "@/core/key-info-core";
import {
  getDocMetaByID,
  getDocOutline,
  SiYuanOutlineBlock,
  SiYuanOutlineNode
} from "@/services/kernel";
import {
  cleanInlineText,
  KeyInfoDocResult,
  normalizeTitle
} from "@/services/key-info-model";
import { listDocHeadingBlocks, resolveRootId } from "@/services/key-info-query";

const NAMED_HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&#39;": "'",
  "&apos;": "'"
};

const inFlightOutlineRequests = new Map<string, Promise<KeyInfoDocResult>>();

export function decodeOutlineHtmlToText(raw: string): string {
  if (!raw) {
    return "";
  }
  let text = raw.replace(/<br\s*\/?>/gi, " ");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/gi, (match) => {
    return NAMED_HTML_ENTITIES[match.toLowerCase()] ?? match;
  });
  text = text.replace(/&#(\d+);/g, (_match, dec: string) => {
    const code = Number(dec);
    return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
  });
  text = text.replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => {
    const code = Number.parseInt(hex, 16);
    return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
  });
  return cleanInlineText(text);
}

function parseOutlineHeadingLevel(subType?: string): number {
  const match = (subType || "").match(/h([1-6])/i);
  if (match) {
    const level = Number(match[1]);
    if (level >= 1 && level <= 6) {
      return level;
    }
  }
  return 1;
}

export function flattenDocOutlineNodes(nodes: SiYuanOutlineNode[]): KeyInfoItem[] {
  const items: KeyInfoItem[] = [];
  const seenIds = new Set<string>();
  let order = 0;

  const pushHeading = (id: string, rawText: string, subType?: string) => {
    const blockId = (id || "").trim();
    if (!blockId || seenIds.has(blockId)) {
      return;
    }
    const text = decodeOutlineHtmlToText(rawText);
    if (!text) {
      return;
    }
    seenIds.add(blockId);
    const level = parseOutlineHeadingLevel(subType);
    items.push({
      id: `${blockId}-heading-${order}`,
      type: "title",
      headingLevel: level,
      text,
      raw: `${"#".repeat(level)} ${text}`,
      offset: 0,
      blockId,
      blockSort: order,
      order,
      listItem: false
    });
    order += 1;
  };

  const walkBlocks = (blocks?: SiYuanOutlineBlock[]) => {
    if (!Array.isArray(blocks) || !blocks.length) {
      return;
    }
    for (const block of blocks) {
      if (!block || typeof block !== "object") {
        continue;
      }
      pushHeading(block.id, block.content || block.name || "", block.subType);
      walkBlocks(block.children);
    }
  };

  const walkPaths = (paths?: SiYuanOutlineNode[]) => {
    if (!Array.isArray(paths) || !paths.length) {
      return;
    }
    for (const node of paths) {
      if (!node || typeof node !== "object") {
        continue;
      }
      pushHeading(node.id, node.name || "", node.subType);
      walkBlocks(node.blocks);
      walkPaths(node.children);
    }
  };

  walkPaths(nodes);
  return items;
}

function buildSqlHeadingItems(
  rows: Array<{ id: string; subtype?: string; content?: string }>
): KeyInfoItem[] {
  const items: KeyInfoItem[] = [];
  let order = 0;
  for (const row of rows) {
    const text = cleanInlineText(row.content || "");
    if (!text) {
      continue;
    }
    const level = parseOutlineHeadingLevel(row.subtype);
    items.push({
      id: `${row.id}-heading-${order}`,
      type: "title",
      headingLevel: level,
      text,
      raw: `${"#".repeat(level)} ${text}`,
      offset: 0,
      blockId: row.id,
      blockSort: order,
      order,
      listItem: false
    });
    order += 1;
  }
  return items;
}

function prependDocTitleIfMissing(
  items: KeyInfoItem[],
  docTitle: string,
  rootId: string
): KeyInfoItem[] {
  if (!docTitle) {
    return items;
  }
  const normalizedDocTitle = normalizeTitle(docTitle);
  const hasDocTitleHeading = items.some(
    (item) => item.type === "title" && normalizeTitle(item.text) === normalizedDocTitle
  );
  if (hasDocTitleHeading) {
    return items;
  }
  return [
    {
      id: `doc-title-${items.length}`,
      headingLevel: 1,
      type: "title",
      text: docTitle,
      raw: `# ${docTitle}`,
      offset: -1,
      blockId: rootId,
      blockSort: -1,
      order: -1,
      listItem: false,
      listPrefix: undefined
    },
    ...items
  ];
}

async function fetchOutlineResultUncached(docId: string): Promise<KeyInfoDocResult> {
  let rootId = (docId || "").trim();
  if (!rootId) {
    return { docId: "", docTitle: "", items: [] };
  }

  let [outlineResult, docMeta] = await Promise.all([
    getDocOutline(rootId, false).then(
      (nodes) => ({ ok: true as const, nodes }),
      () => ({ ok: false as const, nodes: [] as SiYuanOutlineNode[] })
    ),
    getDocMetaByID(rootId).catch(() => null)
  ]);

  if (!docMeta) {
    const resolvedRootId = await resolveRootId(rootId);
    if (resolvedRootId && resolvedRootId !== rootId) {
      rootId = resolvedRootId;
      [outlineResult, docMeta] = await Promise.all([
        getDocOutline(rootId, false).then(
          (nodes) => ({ ok: true as const, nodes }),
          () => ({ ok: false as const, nodes: [] as SiYuanOutlineNode[] })
        ),
        getDocMetaByID(rootId).catch(() => null)
      ]);
    }
  }

  const docTitle = docMeta?.title || "";
  let items: KeyInfoItem[];
  if (outlineResult.ok) {
    items = flattenDocOutlineNodes(outlineResult.nodes);
  } else {
    const rows = await listDocHeadingBlocks(rootId);
    items = buildSqlHeadingItems(rows);
  }

  return {
    docId: rootId,
    docTitle,
    items: prependDocTitleIfMissing(items, docTitle, rootId)
  };
}

export async function getDocOutlineItems(docId: string): Promise<KeyInfoDocResult> {
  const key = (docId || "").trim();
  if (!key) {
    return { docId: "", docTitle: "", items: [] };
  }
  const existing = inFlightOutlineRequests.get(key);
  if (existing) {
    return existing;
  }
  const pending = fetchOutlineResultUncached(key).finally(() => {
    if (inFlightOutlineRequests.get(key) === pending) {
      inFlightOutlineRequests.delete(key);
    }
  });
  inFlightOutlineRequests.set(key, pending);
  return pending;
}
