export type AiOutputCleanupResult = {
  markdown: string;
  removedSupCount: number;
  removedCaretCount: number;
  removedInternetLinkCount: number;
  removedHiddenSpanCount: number;
  removedRefCount: number;
  removedDividerCount: number;
  removedCount: number;
};

type AiOutputCleanupMetrics = Omit<AiOutputCleanupResult, "markdown" | "removedCount">;

type AiOutputLineRuleResult = {
  line: string;
  metrics: AiOutputCleanupMetrics;
};

type AiOutputLineRule = (line: string) => AiOutputLineRuleResult;

function createEmptyAiOutputCleanupMetrics(): AiOutputCleanupMetrics {
  return {
    removedSupCount: 0,
    removedCaretCount: 0,
    removedInternetLinkCount: 0,
    removedHiddenSpanCount: 0,
    removedRefCount: 0,
    removedDividerCount: 0,
  };
}

function sumAiOutputCleanupMetrics(metrics: AiOutputCleanupMetrics): number {
  return (
    metrics.removedSupCount +
    metrics.removedCaretCount +
    metrics.removedInternetLinkCount +
    metrics.removedHiddenSpanCount +
    metrics.removedRefCount +
    metrics.removedDividerCount
  );
}

function mergeAiOutputCleanupMetrics(
  base: AiOutputCleanupMetrics,
  add: AiOutputCleanupMetrics
): AiOutputCleanupMetrics {
  return {
    removedSupCount: base.removedSupCount + add.removedSupCount,
    removedCaretCount: base.removedCaretCount + add.removedCaretCount,
    removedInternetLinkCount: base.removedInternetLinkCount + add.removedInternetLinkCount,
    removedHiddenSpanCount: base.removedHiddenSpanCount + add.removedHiddenSpanCount,
    removedRefCount: base.removedRefCount + add.removedRefCount,
    removedDividerCount: base.removedDividerCount + add.removedDividerCount,
  };
}

function stripTrailingInternetLinksInLine(
  line: string
): { line: string; removedCount: number } {
  if (!line) {
    return { line: "", removedCount: 0 };
  }

  const trailingPadding = "[\\p{Cf}\\p{Zs}\\t]*";
  const httpTarget = "(https?:\\/\\/[^)\\s]+(?:\\s+[\"'][^\"'\\n]*[\"'])?)";
  const wrappedMarkdownLinkPattern = new RegExp(
    `${trailingPadding}\\[\\[[^\\]\\n]*\\]\\(${httpTarget}\\)\\]${trailingPadding}$`,
    "iu"
  );
  const markdownLinkPattern = new RegExp(
    `${trailingPadding}\\[[^\\]\\n]*\\]\\(${httpTarget}\\)${trailingPadding}$`,
    "iu"
  );
  const autolinkPattern = new RegExp(
    `${trailingPadding}<https?:\\/\\/[^>\\s]+>${trailingPadding}$`,
    "iu"
  );
  const bareLinkPattern = new RegExp(
    `${trailingPadding}https?:\\/\\/[^\\s<>()]+${trailingPadding}$`,
    "iu"
  );
  const patterns = [wrappedMarkdownLinkPattern, markdownLinkPattern, autolinkPattern, bareLinkPattern];

  let next = line;
  let removedCount = 0;
  let removed = false;
  do {
    removed = false;
    for (const pattern of patterns) {
      const match = pattern.exec(next);
      if (!match || match.index < 0) {
        continue;
      }
      next = next.slice(0, match.index);
      removedCount += 1;
      removed = true;
      break;
    }
  } while (removed);

  return {
    line: next,
    removedCount,
  };
}

function applySupRule(line: string): AiOutputLineRuleResult {
  const supPattern = /[ \t]*<sup\b[^>\n]*>[\s\S]*?<\/sup>/giu;
  let removedSupCount = 0;
  const nextLine = line.replace(supPattern, () => {
    removedSupCount += 1;
    return "";
  });

  return {
    line: nextLine,
    metrics: {
      ...createEmptyAiOutputCleanupMetrics(),
      removedSupCount,
    },
  };
}

function applyCaretRule(line: string): AiOutputLineRuleResult {
  const caretPattern = /[ \t]*\^\^[ \t]*/g;
  let removedCaretCount = 0;
  const nextLine = line.replace(caretPattern, () => {
    removedCaretCount += 1;
    return "";
  });

  return {
    line: nextLine,
    metrics: {
      ...createEmptyAiOutputCleanupMetrics(),
      removedCaretCount,
    },
  };
}

function applyTrailingInternetLinkRule(line: string): AiOutputLineRuleResult {
  const tableSuffixMatch = line.match(/^([\s\S]*?)(\s*\|\s*)$/u);
  let removedInternetLinkCount = 0;
  let nextLine = line;
  if (tableSuffixMatch) {
    const tableBody = tableSuffixMatch[1] || "";
    const tableSuffix = tableSuffixMatch[2] || "";
    const stripped = stripTrailingInternetLinksInLine(tableBody);
    nextLine = `${stripped.line}${tableSuffix}`;
    removedInternetLinkCount += stripped.removedCount;
  } else {
    const stripped = stripTrailingInternetLinksInLine(line);
    nextLine = stripped.line;
    removedInternetLinkCount += stripped.removedCount;
  }

  return {
    line: nextLine,
    metrics: {
      ...createEmptyAiOutputCleanupMetrics(),
      removedInternetLinkCount,
    },
  };
}

function applyHiddenSpanRule(line: string): AiOutputLineRuleResult {
  const hiddenSpanPattern = /<span\b[^>]*\bstyle\s*=\s*["'][^"']*\bdisplay\s*:\s*none\b[^"']*["'][^>]*>[\s\S]*?<\/span>/giu;
  let removedHiddenSpanCount = 0;
  const nextLine = line.replace(hiddenSpanPattern, () => {
    removedHiddenSpanCount += 1;
    return "";
  });

  return {
    line: nextLine,
    metrics: {
      ...createEmptyAiOutputCleanupMetrics(),
      removedHiddenSpanCount,
    },
  };
}

function applyRefMarkerRule(line: string): AiOutputLineRuleResult {
  const refPattern = /\[\^[0-9]+(?:_[0-9]+)*\](?!\():?|\[[0-9]+(?:_[0-9]+)+\](?!\()/gu;
  let removedRefCount = 0;
  const nextLine = line.replace(refPattern, (match, offset) => {
    const isLineStart = /^\s*$/.test(line.slice(0, offset));
    if (!match.includes("^") && isLineStart) {
      return match;
    }
    removedRefCount += 1;
    return "";
  });

  return {
    line: nextLine,
    metrics: {
      ...createEmptyAiOutputCleanupMetrics(),
      removedRefCount,
    },
  };
}

function applyDividerRule(line: string): AiOutputLineRuleResult {
  const dividerPattern = /^[ \t]*(?:(?:\-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
  if (dividerPattern.test(line)) {
    return {
      line: "",
      metrics: {
        ...createEmptyAiOutputCleanupMetrics(),
        removedDividerCount: 1,
      },
    };
  }
  return {
    line,
    metrics: createEmptyAiOutputCleanupMetrics(),
  };
}

const AI_OUTPUT_LINE_RULES: AiOutputLineRule[] = [
  applyHiddenSpanRule,
  applySupRule,
  applyCaretRule,
  applyTrailingInternetLinkRule,
  applyRefMarkerRule,
  applyDividerRule,
];

function cleanupAiOutputLine(line: string): AiOutputCleanupResult {
  let nextLine = line;
  let metrics = createEmptyAiOutputCleanupMetrics();

  for (const rule of AI_OUTPUT_LINE_RULES) {
    const result = rule(nextLine);
    nextLine = result.line;
    metrics = mergeAiOutputCleanupMetrics(metrics, result.metrics);
  }

  const removedCount = sumAiOutputCleanupMetrics(metrics);
  return {
    markdown: nextLine,
    ...metrics,
    removedCount,
  };
}

export function cleanupAiOutputArtifactsInMarkdown(markdown: string): AiOutputCleanupResult {
  const source = markdown || "";
  if (!source) {
    return {
      markdown: "",
      removedSupCount: 0,
      removedCaretCount: 0,
      removedInternetLinkCount: 0,
      removedHiddenSpanCount: 0,
      removedRefCount: 0,
      removedDividerCount: 0,
      removedCount: 0,
    };
  }

  const lines = source.split(/\r?\n/);
  const output: string[] = [];
  let metrics = createEmptyAiOutputCleanupMetrics();

  for (const line of lines) {
    const cleaned = cleanupAiOutputLine(line);
    if (!(cleaned.removedDividerCount > 0 && cleaned.markdown === "")) {
      output.push(cleaned.markdown);
    }
    metrics = mergeAiOutputCleanupMetrics(metrics, cleaned);
  }

  const removedCount = sumAiOutputCleanupMetrics(metrics);
  return {
    markdown: output.join("\n"),
    ...metrics,
    removedCount,
  };
}
