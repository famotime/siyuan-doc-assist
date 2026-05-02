import type { ChildBlockMeta } from "@/services/kernel-block";

export type SplitSection = {
  title: string;
  blockIds: string[];
  markdown: string;
};

export type SplitDocResult = {
  highestLevel: number;
  sections: SplitSection[];
  preHeadingBlockIds: string[];
};

const HEADING_RE = /^(\s{0,3})(#{1,6})\s/;
const BOLD_RE = /\*\*/g;

function isHeadingBlock(block: ChildBlockMeta): boolean {
  if (block.type === "h") {
    return true;
  }
  return HEADING_RE.test(block.markdown || "");
}

function extractHeadingLevel(markdown: string): number {
  const match = (markdown || "").match(HEADING_RE);
  return match ? match[2].length : 0;
}

function extractHeadingTitle(markdown: string): string {
  const match = (markdown || "").match(HEADING_RE);
  if (!match) {
    return "";
  }
  const raw = markdown.slice(match[0].length).trim();
  return raw.replace(BOLD_RE, "").trim();
}

export function splitDocByHeadingsCore(
  blocks: ChildBlockMeta[]
): SplitDocResult {
  let highestLevel = Infinity;
  for (const block of blocks) {
    if (!isHeadingBlock(block)) {
      continue;
    }
    const level = extractHeadingLevel(block.markdown);
    if (level > 0 && level < highestLevel) {
      highestLevel = level;
    }
  }

  if (!isFinite(highestLevel)) {
    return { highestLevel: 0, sections: [], preHeadingBlockIds: blocks.map((b) => b.id) };
  }

  const sections: SplitSection[] = [];
  const preHeadingBlockIds: string[] = [];
  let currentSection: SplitSection | null = null;

  for (const block of blocks) {
    const isSplitHeading =
      isHeadingBlock(block) && extractHeadingLevel(block.markdown) === highestLevel;

    if (isSplitHeading) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        title: extractHeadingTitle(block.markdown),
        blockIds: [block.id],
        markdown: "",
      };
    } else if (currentSection) {
      currentSection.blockIds.push(block.id);
      currentSection.markdown += currentSection.markdown ? "\n\n" + block.markdown : block.markdown;
    } else {
      preHeadingBlockIds.push(block.id);
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return { highestLevel, sections, preHeadingBlockIds };
}
