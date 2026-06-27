import type { KeyInfoItem } from "@/core/key-info-core";

// ── JSON Canvas types (aligned with siyuan-canvas/src/canvas/types.ts) ──

type CanvasSide = "bottom" | "left" | "right" | "top";

type CanvasTextNode = {
  id: string;
  type: "text";
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  [key: string]: unknown;
};

type CanvasEdge = {
  id: string;
  fromNode: string;
  fromSide: CanvasSide;
  startArrow?: boolean;
  toNode: string;
  toSide: CanvasSide;
  endArrow?: boolean;
  [key: string]: unknown;
};

type CanvasDocument = {
  nodes: CanvasTextNode[];
  edges: CanvasEdge[];
  [key: string]: unknown;
};

// ── Heading section (aligned with siyuan-canvas MarkdownHeadingSection) ──

type HeadingSection = {
  level: number;
  title: string;
  text: string; // full section markdown (heading line + body)
};

// ── Constants (matching siyuan-canvas decomposeSelectedDocument) ──

const NODE_WIDTH = 320;
const NODE_HEIGHT = 180;
const HORIZONTAL_GAP = 120;
const VERTICAL_GAP = 40;

// ── ID generation (matching siyuan-canvas createCanvasId) ──

function createCanvasId(prefix: string): string {
  const random = Math.random().toString(16).slice(2, 10);
  return `${prefix}${random}`;
}

// ── Heading level extraction (from key-info raw field) ──

function getHeadingLevel(item: KeyInfoItem): number {
  const match = (item.raw || "").match(/^(#{1,6})\s/);
  return match ? match[1].length : 0;
}

// ── Convert key-info items to heading sections ──
// Follows siyuan-canvas's extractMarkdownHeadingSections pattern:
// each section = heading line + all content until next heading.

function buildHeadingSections(items: KeyInfoItem[]): HeadingSection[] {
  const sections: HeadingSection[] = [];
  let current: HeadingSection | null = null;

  for (const item of items) {
    if (item.type === "title") {
      const level = getHeadingLevel(item);
      if (level === 0) continue;
      if (current) sections.push(current);
      current = { level, title: item.text, text: item.raw };
    } else if (current) {
      const line = (item.raw || item.text || "").trim();
      if (line) current.text += "\n" + line;
    } else {
      // content before first heading — start implicit root section
      const line = (item.raw || item.text || "").trim();
      if (line) {
        if (!current) current = { level: 0, title: "", text: "" };
        current.text += (current.text ? "\n" : "") + line;
      }
    }
  }
  if (current) sections.push(current);
  return sections;
}

// ── Overlap detection (from siyuan-canvas use-canvas-editor.ts:571) ──

function doNodesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function findNonOverlappingPosition(
  node: { x: number; y: number; width: number; height: number },
  existing: Array<{ x: number; y: number; width: number; height: number }>,
  stepY: number
): { x: number; y: number } {
  let attempts = 0;
  while (attempts < 100 && existing.some((e) => doNodesOverlap(node, e))) {
    node.y += stepY;
    attempts += 1;
  }
  return { x: node.x, y: node.y };
}

/**
 * Preprocess items for canvas generation: insert the document title as an H1
 * at the beginning, unless the first item is already an H1 with the same text.
 */
export function preprocessItemsForCanvas(items: KeyInfoItem[], docTitle: string): KeyInfoItem[] {
  const first = items[0];
  if (
    first
    && first.type === "title"
    && /^#{1}\s/.test(first.raw || "")
    && first.text.trim() === docTitle.trim()
  ) {
    return items;
  }
  return [
    { ...first!, id: `synth-h1-${Date.now()}`, type: "title" as const, text: docTitle, raw: `# ${docTitle}` },
    ...items,
  ];
}

// ── Canvas generation (mirrors siyuan-canvas decomposeSelectedDocument layout) ──

export function buildCanvasFromKeyInfoItems(
  items: KeyInfoItem[],
  docTitle: string
): CanvasDocument {
  const sections = buildHeadingSections(items);
  if (!sections.length) {
    // single root node with just the title
    return {
      nodes: [{ id: createCanvasId("node-"), type: "text", text: `**${docTitle}**`, x: 0, y: 0, width: NODE_WIDTH, height: NODE_HEIGHT }],
      edges: [],
    };
  }

  // root node = document title
  const rootId = createCanvasId("node-");
  const rootNode: CanvasTextNode = {
    id: rootId,
    type: "text",
    text: `**${docTitle}**`,
    x: 0,
    y: 0,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  };

  // If the first H1 section matches the document title, skip creating a
  // separate child node for it — the root node already displays the title.
  // Any body content under that heading is merged into the root node.
  const effectiveSections = [...sections];
  const firstH1 = effectiveSections[0];
  if (firstH1 && firstH1.level === 1 && firstH1.title.trim() === docTitle.trim()) {
    effectiveSections.shift();
    const body = firstH1.text.replace(/^#[^\n]*\n?/, "").trim();
    if (body) {
      rootNode.text += "\n" + body;
    }
  }

  if (!effectiveSections.length) {
    return {
      nodes: [rootNode],
      edges: [],
    };
  }

  const minLevel = Math.min(...effectiveSections.filter((s) => s.level > 0).map((s) => s.level));
  const effectiveMin = Number.isFinite(minLevel) ? minLevel : 1;

  const nodes: CanvasTextNode[] = [rootNode];
  const edges: CanvasEdge[] = [];
  const parentById = new Map<string, string>();

  // stack-based tree construction (from siyuan-canvas decomposeSelectedDocument:641-678)
  const stack: Array<{ id: string; level: number }> = [{ id: rootId, level: effectiveMin - 1 }];
  const columnCounts = new Map<number, number>();
  const existingForOverlap = [rootNode];

  for (const section of effectiveSections) {
    if (section.level === 0) {
      // content before first heading — append to root
      const body = section.text.trim();
      if (body) rootNode.text += "\n" + body;
      continue;
    }

    // pop stack until parent level < current level
    while (stack.length > 0 && stack[stack.length - 1]!.level >= section.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1] ?? { id: rootId, level: effectiveMin - 1 };
    const depth = Math.max(1, section.level - effectiveMin + 1);
    const row = columnCounts.get(depth) ?? 0;
    columnCounts.set(depth, row + 1);

    const node: CanvasTextNode = {
      id: createCanvasId("node-"),
      type: "text",
      text: section.text.trim(),
      x: rootNode.x + depth * (NODE_WIDTH + HORIZONTAL_GAP),
      y: rootNode.y + row * (NODE_HEIGHT + VERTICAL_GAP),
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    };

    const pos = findNonOverlappingPosition(node, existingForOverlap, NODE_HEIGHT + VERTICAL_GAP);
    node.x = pos.x;
    node.y = pos.y;

    nodes.push(node);
    existingForOverlap.push(node);
    parentById.set(node.id, parent.id);
    stack.push({ id: node.id, level: section.level });
  }

  // create edges (from siyuan-canvas decomposeSelectedDocument:681-686)
  for (const node of nodes) {
    if (node.id === rootId) continue;
    const parentId = parentById.get(node.id) ?? rootId;
    edges.push({
      id: createCanvasId("edge-"),
      fromNode: parentId,
      fromSide: "right",
      startArrow: false,
      toNode: node.id,
      toSide: "left",
      endArrow: true,
    });
  }

  return { nodes, edges };
}

/**
 * Parses markdown outline into a flat array of KeyInfoItems,
 * so it can be laid out using the local canvas tree layout algorithm.
 */
export function parseMarkdownToKeyInfoItems(markdown: string): KeyInfoItem[] {
  const lines = (markdown || "").split(/\r?\n/);
  const items: KeyInfoItem[] = [];
  let counter = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const titleText = headingMatch[2].trim();
      items.push({
        id: `ai-canvas-item-${counter}`,
        type: "title",
        text: titleText,
        raw: trimmed,
        offset: 0,
        blockSort: counter,
        order: counter,
      });
    } else {
      items.push({
        id: `ai-canvas-item-${counter}`,
        type: "remark",
        text: trimmed,
        raw: trimmed,
        offset: 0,
        blockSort: counter,
        order: counter,
      });
    }
    counter++;
  }

  return items;
}

