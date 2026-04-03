type SummaryInsertBlock = {
  id: string;
  type: string;
  markdown: string;
};

type SummaryInsertTarget =
  | {
      mode: "insert-before";
      nextId: string;
    }
  | {
      mode: "append";
    };

const INTERNAL_DOC_LINK_PATTERNS = [
  /siyuan:\/\/blocks\//iu,
  /\(\([^)]+\)\)/u,
  /\[\[[^[\]\n]+\]\]/u,
];

export function buildAiSummaryBlockMarkdown(summary: string): string {
  return `---\n\n${normalizeAiSummaryText(summary)}\n\n---`;
}

export function normalizeAiSummaryText(summary: string): string {
  const trimmed = (summary || "").trim();
  return trimmed
    .replace(/^```(?:markdown|md|text)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();
}

export function containsSiyuanInternalDocLink(markdown: string): boolean {
  const value = markdown || "";
  return INTERNAL_DOC_LINK_PATTERNS.some((pattern) => pattern.test(value));
}

export function resolveAiSummaryInsertTarget(
  blocks: SummaryInsertBlock[]
): SummaryInsertTarget {
  if (!blocks.length) {
    return { mode: "append" };
  }

  const firstParagraphIndex = blocks.findIndex((block) =>
    isParagraphLikeBlockType(block.type)
  );

  if (firstParagraphIndex < 0) {
    return {
      mode: "insert-before",
      nextId: blocks[0].id,
    };
  }

  const firstParagraph = blocks[firstParagraphIndex];
  if (containsSiyuanInternalDocLink(firstParagraph.markdown)) {
    const nextBlock = blocks[firstParagraphIndex + 1];
    if (!nextBlock?.id) {
      return { mode: "append" };
    }
    return {
      mode: "insert-before",
      nextId: nextBlock.id,
    };
  }

  return {
    mode: "insert-before",
    nextId: firstParagraph.id,
  };
}

function isParagraphLikeBlockType(type: string): boolean {
  const normalized = (type || "").trim().toLowerCase();
  return (
    normalized === "p" ||
    normalized === "paragraph" ||
    normalized === "nodeparagraph"
  );
}
