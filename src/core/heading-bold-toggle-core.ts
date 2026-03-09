import { hasBlockStyleMarker, setBlockStyle } from "@/core/markdown-style-core";

export type HeadingBoldToggleBlock = {
  id: string;
  type: string;
  markdown: string;
};

export type HeadingBoldToggleMode = "add-bold" | "remove-bold";

export type HeadingBoldTogglePreview = {
  totalHeadingCount: number;
  boldHeadingCount: number;
  plainHeadingCount: number;
  updateCount: number;
  mode: HeadingBoldToggleMode;
  updates: Array<{ id: string; next: string }>;
};

export function isHeadingBlockType(type: string): boolean {
  const normalized = (type || "").trim().toLowerCase();
  return normalized === "h" || normalized === "heading" || normalized === "nodeheading";
}

export function buildHeadingBoldTogglePreview(
  blocks: HeadingBoldToggleBlock[]
): HeadingBoldTogglePreview {
  const headingBlocks = blocks.filter((block) => isHeadingBlockType(block.type));
  const boldHeadingCount = headingBlocks.filter((block) =>
    hasBlockStyleMarker(block.markdown || "", "bold")
  ).length;
  const mode: HeadingBoldToggleMode = boldHeadingCount === 0 ? "add-bold" : "remove-bold";
  const enabled = mode === "add-bold";
  const updates = headingBlocks
    .map((block) => {
      const next = setBlockStyle(block.markdown || "", "bold", enabled);
      if (next === (block.markdown || "")) {
        return null;
      }
      return {
        id: block.id,
        next,
      };
    })
    .filter((item): item is { id: string; next: string } => !!item);

  return {
    totalHeadingCount: headingBlocks.length,
    boldHeadingCount,
    plainHeadingCount: headingBlocks.length - boldHeadingCount,
    updateCount: updates.length,
    mode,
    updates,
  };
}
