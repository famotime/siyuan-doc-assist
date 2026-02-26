import { getActiveEditor } from "siyuan";
import { ProtyleLike } from "@/plugin/doc-context";

export type CurrentBlockResolveSource =
  | "provided-block-id"
  | "provided-dom"
  | "active-block-id"
  | "active-dom"
  | "none";

export type CurrentBlockResolveResult = {
  id: string;
  source: CurrentBlockResolveSource;
  wasDocId: boolean;
};

function getProtyleBlockId(protyle?: ProtyleLike): string {
  return (protyle?.block?.id || "").trim();
}

function normalizeCandidateBlockId(candidateId: string, docId: string): CurrentBlockResolveResult {
  const normalized = (candidateId || "").trim();
  if (!normalized) {
    return { id: "", source: "none", wasDocId: false };
  }
  if (normalized === docId) {
    return { id: "", source: "none", wasDocId: true };
  }
  return { id: normalized, source: "none", wasDocId: false };
}

function getFocusedBlockIdFromDom(protyle?: ProtyleLike): string {
  if (typeof window === "undefined") {
    return "";
  }
  const root = protyle?.wysiwyg?.element as HTMLElement | undefined;
  if (!root || typeof root.querySelector !== "function") {
    return "";
  }

  const resolveFromElement = (element: Element | null | undefined) => {
    if (!element) {
      return "";
    }
    const blockElement = element.closest?.("[data-node-id]") as HTMLElement | null;
    if (!blockElement || !root.contains(blockElement)) {
      return "";
    }
    return (blockElement.dataset.nodeId || blockElement.getAttribute("data-node-id") || "").trim();
  };

  const selection = window.getSelection?.();
  const anchorNode = selection?.anchorNode || null;
  const anchorElement =
    anchorNode && (anchorNode as any).nodeType === Node.ELEMENT_NODE
      ? (anchorNode as Element)
      : anchorNode?.parentElement || null;
  const fromAnchor = resolveFromElement(anchorElement);
  if (fromAnchor) {
    return fromAnchor;
  }

  const focused = root.querySelector(":focus");
  const fromFocused = resolveFromElement(focused);
  if (fromFocused) {
    return fromFocused;
  }

  return "";
}

function resolveActiveProtyle(): ProtyleLike | undefined {
  return getActiveEditor()?.protyle as ProtyleLike | undefined;
}

export function resolveCurrentBlockId(docId: string, protyle?: ProtyleLike): CurrentBlockResolveResult {
  let wasDocId = false;

  const fromProvided = normalizeCandidateBlockId(getProtyleBlockId(protyle), docId);
  if (fromProvided.id) {
    return { ...fromProvided, source: "provided-block-id" };
  }
  wasDocId = wasDocId || fromProvided.wasDocId;

  const fromProvidedDom = normalizeCandidateBlockId(getFocusedBlockIdFromDom(protyle), docId);
  if (fromProvidedDom.id) {
    return { ...fromProvidedDom, source: "provided-dom", wasDocId };
  }
  wasDocId = wasDocId || fromProvidedDom.wasDocId;

  const activeProtyle = resolveActiveProtyle();
  const fromActive = normalizeCandidateBlockId(getProtyleBlockId(activeProtyle), docId);
  if (fromActive.id) {
    return { ...fromActive, source: "active-block-id", wasDocId };
  }
  wasDocId = wasDocId || fromActive.wasDocId;

  const fromActiveDom = normalizeCandidateBlockId(getFocusedBlockIdFromDom(activeProtyle), docId);
  if (fromActiveDom.id) {
    return { ...fromActiveDom, source: "active-dom", wasDocId };
  }
  wasDocId = wasDocId || fromActiveDom.wasDocId;

  return {
    id: "",
    source: "none",
    wasDocId,
  };
}

export function getSelectedBlockIds(protyle?: ProtyleLike): string[] {
  const activeProtyle = protyle || resolveActiveProtyle();
  const root = activeProtyle?.wysiwyg?.element as HTMLElement | undefined;
  if (!root) {
    return [];
  }
  const selectors = [
    ".protyle-wysiwyg--select",
    ".protyle-wysiwyg__select",
    ".protyle-wysiwyg--selecting",
    "[data-node-id][data-node-selected]",
  ];
  const nodes = root.querySelectorAll(selectors.join(","));
  const ids: string[] = [];
  const seen = new Set<string>();
  nodes.forEach((node) => {
    const element = (node as HTMLElement).closest?.("[data-node-id]") || (node as HTMLElement);
    const id = (element as HTMLElement).dataset.nodeId || element.getAttribute("data-node-id") || "";
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  });

  if (ids.length) {
    return ids;
  }

  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return ids;
  }
  const blockNodes = root.querySelectorAll<HTMLElement>("[data-node-id]");
  blockNodes.forEach((node) => {
    try {
      if (selection.containsNode(node, true)) {
        const id = node.dataset.nodeId || node.getAttribute("data-node-id") || "";
        if (id && !seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
    } catch {
      // Ignore DOM selection errors in non-standard environments.
    }
  });
  return ids;
}
