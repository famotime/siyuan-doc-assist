import { applyBlockStyle, BlockStyle, hasBlockStyleMarker, setBlockStyle } from "@/core/markdown-style-core";

export type SelectedBlockStyleToggleBlock = {
  id: string;
  markdown: string;
};

export type SelectedBlockStyleToggleMode = "add-style" | "remove-style";

type SelectedBlockStyleState = "plain" | "partial" | "fully-styled" | "unstylable";

export type SelectedBlockStyleTogglePreview = {
  totalBlockCount: number;
  stylableBlockCount: number;
  styledBlockCount: number;
  partialBlockCount: number;
  plainBlockCount: number;
  markedBlockCount: number;
  unstylableBlockCount: number;
  updateCount: number;
  mode: SelectedBlockStyleToggleMode;
  updates: Array<{ id: string; next: string }>;
};

function resolveSelectedBlockStyleState(
  markdown: string,
  style: BlockStyle
): SelectedBlockStyleState {
  const source = markdown || "";
  const toggled = applyBlockStyle(source, style);
  const disabled = setBlockStyle(source, style, false);
  if (toggled === source && disabled === source) {
    return "unstylable";
  }
  if (toggled === disabled) {
    return "fully-styled";
  }
  if (hasBlockStyleMarker(source, style)) {
    return "partial";
  }
  return "plain";
}

export function buildSelectedBlockStyleTogglePreview(
  blocks: SelectedBlockStyleToggleBlock[],
  style: BlockStyle
): SelectedBlockStyleTogglePreview {
  const analyzed = blocks.map((block) => ({
    ...block,
    state: resolveSelectedBlockStyleState(block.markdown || "", style),
  }));
  const stylable = analyzed.filter((block) => block.state !== "unstylable");
  const styledBlockCount = stylable.filter((block) => block.state === "fully-styled").length;
  const partialBlockCount = stylable.filter((block) => block.state === "partial").length;
  const plainBlockCount = stylable.filter((block) => block.state === "plain").length;
  const markedBlockCount = stylable.filter((block) => block.state !== "plain").length;
  const mode: SelectedBlockStyleToggleMode =
    stylable.length > 0 && styledBlockCount === stylable.length ? "remove-style" : "add-style";
  const enabled = mode === "add-style";
  const updates = stylable
    .map((block) => {
      const next = setBlockStyle(block.markdown || "", style, enabled);
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
    totalBlockCount: blocks.length,
    stylableBlockCount: stylable.length,
    styledBlockCount,
    partialBlockCount,
    plainBlockCount,
    markedBlockCount,
    unstylableBlockCount: blocks.length - stylable.length,
    updateCount: updates.length,
    mode,
    updates,
  };
}
