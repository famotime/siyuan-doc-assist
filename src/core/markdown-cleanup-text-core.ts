type CleanupResult = {
  markdown: string;
  removedLines: number;
};

export type TrailingWhitespaceCleanupResult = {
  markdown: string;
  changedLines: number;
  removedChars: number;
};

export type TrailingWhitespaceDomCleanupResult = {
  dom: string;
  changedLines: number;
  removedChars: number;
};

export function isBlankLine(line: string): boolean {
  if (!line) {
    return true;
  }
  const normalized = line
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;|&#xA0;/gi, "")
    .replace(/[\p{Cf}\p{Z}]/gu, "")
    .replace(/\s+/g, "");
  return normalized.length === 0;
}

function isFenceLine(line: string): { marker: string; length: number } | null {
  const match = line.match(/^\s*(`{3,}|~{3,})/);
  if (!match) {
    return null;
  }
  return { marker: match[1], length: match[1].length };
}

export function removeExtraBlankLinesFromMarkdown(markdown: string): CleanupResult {
  if (!markdown) {
    return { markdown: "", removedLines: 0 };
  }

  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  let removedLines = 0;
  let inFence = false;
  let fenceChar = "";
  let fenceLen = 0;
  let previousBlank = false;

  for (const line of lines) {
    const fence = isFenceLine(line);
    if (fence) {
      const markerChar = fence.marker[0];
      if (!inFence) {
        inFence = true;
        fenceChar = markerChar;
        fenceLen = fence.length;
      } else if (markerChar === fenceChar && fence.length >= fenceLen) {
        inFence = false;
        fenceChar = "";
        fenceLen = 0;
      }
      output.push(line);
      previousBlank = false;
      continue;
    }

    if (inFence) {
      output.push(line);
      continue;
    }

    const isBlank = isBlankLine(line);
    if (isBlank) {
      if (previousBlank) {
        removedLines += 1;
        continue;
      }
      output.push("");
      previousBlank = true;
      continue;
    }

    output.push(line);
    previousBlank = false;
  }

  return { markdown: output.join("\n"), removedLines };
}

export function removeTrailingWhitespaceFromMarkdown(
  markdown: string
): TrailingWhitespaceCleanupResult {
  if (!markdown) {
    return {
      markdown: "",
      changedLines: 0,
      removedChars: 0,
    };
  }

  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  let changedLines = 0;
  let removedChars = 0;
  const trailingWhitespaceSpanIalPattern =
    /<span\b[^>\n]*\bstyle=(["'])[^"'\n]*white-space\s*:\s*pre\b[^"'\n]*\1[^>\n]*>((?:[^\S\r\n]|\\t|\\u0009|\\x09)*)<\/span>\s*\{:[^}\n]*white-space\s*:\s*pre\b[^}\n]*\}(?=(?:[^\S\r\n]*\{:[^}\n]*\})*[^\S\r\n]*$)/giu;
  const trailingWhitespaceIalPattern =
    /((?:[^\S\r\n]|\\t|\\u0009|\\x09)*)\{:[^}\n]*white-space\s*:\s*pre\b[^}\n]*\}(?=(?:[^\S\r\n]*\{:[^}\n]*\})*[^\S\r\n]*$)/giu;
  const trailingHorizontalWhitespacePattern = /[^\S\r\n]+$/u;
  const decodeEscapedWhitespaceLength = (value: string): number => {
    if (!value) {
      return 0;
    }
    let rest = value;
    let decoded = 0;
    const escapedPatterns = [/\\u0009/gi, /\\x09/gi, /\\t/g];
    for (const pattern of escapedPatterns) {
      const matches = rest.match(pattern);
      if (!matches?.length) {
        continue;
      }
      decoded += matches.length;
      rest = rest.replace(pattern, "");
    }
    return decoded + rest.length;
  };

  for (const line of lines) {
    let removedInLine = 0;
    let nextLine = line;

    const beforeInlineIal = nextLine;
    nextLine = nextLine.replace(
      trailingWhitespaceSpanIalPattern,
      (_match, _quote: string, ws: string) => {
        removedInLine += decodeEscapedWhitespaceLength(ws || "");
        return "";
      }
    );
    nextLine = nextLine.replace(
      trailingWhitespaceIalPattern,
      (_match, ws: string) => {
        removedInLine += decodeEscapedWhitespaceLength(ws || "");
        return "";
      }
    );
    if (nextLine !== beforeInlineIal) {
      nextLine = nextLine.replace(
        trailingWhitespaceIalPattern,
        (_match, ws: string) => {
          removedInLine += decodeEscapedWhitespaceLength(ws || "");
          return "";
        }
      );
    }

    const tailMatch = nextLine.match(trailingHorizontalWhitespacePattern);
    if (tailMatch) {
      nextLine = nextLine.slice(0, nextLine.length - tailMatch[0].length);
      removedInLine += tailMatch[0].length;
    }

    output.push(nextLine);
    if (nextLine !== line) {
      changedLines += 1;
      removedChars += removedInLine;
    }
  }

  return {
    markdown: output.join("\n"),
    changedLines,
    removedChars,
  };
}

function decodeHtmlWhitespaceLength(value: string): number {
  if (!value) {
    return 0;
  }
  const entityPattern = /&nbsp;|&#160;|&#xA0;/giu;
  const entityMatches = value.match(entityPattern);
  const entityCount = entityMatches?.length || 0;
  const plain = value.replace(entityPattern, "");
  return entityCount + plain.length;
}

export function removeTrailingWhitespaceFromDom(dom: string): TrailingWhitespaceDomCleanupResult {
  if (!dom) {
    return {
      dom: "",
      changedLines: 0,
      removedChars: 0,
    };
  }

  const editablePattern = /(<div\b[^>]*\bcontenteditable=(["'])true\2[^>]*>)([\s\S]*?)(<\/div>)/iu;
  const editableMatch = editablePattern.exec(dom);
  if (!editableMatch || editableMatch.index < 0) {
    return {
      dom,
      changedLines: 0,
      removedChars: 0,
    };
  }

  const openTag = editableMatch[1];
  const innerHtml = editableMatch[3] || "";
  const closeTag = editableMatch[4];
  let nextInner = innerHtml;
  let removedChars = 0;
  const trailingWhitespaceTokenPattern = /(?:[^\S\r\n]|&nbsp;|&#160;|&#xA0;)+$/iu;
  const trailingPreSpanPattern =
    /<span\b[^>\n]*\bstyle=(["'])[^"'\n]*white-space\s*:\s*pre\b[^"'\n]*\1[^>\n]*>((?:[^\S\r\n]|&nbsp;|&#160;|&#xA0;)*)<\/span>((?:[^\S\r\n]|&nbsp;|&#160;|&#xA0;)*)$/iu;

  let removedSpan = false;
  do {
    removedSpan = false;
    nextInner = nextInner.replace(
      trailingPreSpanPattern,
      (_match, _quote: string, spanWs: string, tailWs: string) => {
        removedChars += decodeHtmlWhitespaceLength(spanWs || "");
        removedChars += decodeHtmlWhitespaceLength(tailWs || "");
        removedSpan = true;
        return "";
      }
    );
  } while (removedSpan);

  const tailMatch = nextInner.match(trailingWhitespaceTokenPattern);
  if (tailMatch) {
    nextInner = nextInner.slice(0, nextInner.length - tailMatch[0].length);
    removedChars += decodeHtmlWhitespaceLength(tailMatch[0]);
  }

  if (nextInner === innerHtml) {
    return {
      dom,
      changedLines: 0,
      removedChars: 0,
    };
  }

  const head = dom.slice(0, editableMatch.index);
  const tail = dom.slice(editableMatch.index + editableMatch[0].length);
  return {
    dom: `${head}${openTag}${nextInner}${closeTag}${tail}`,
    changedLines: 1,
    removedChars,
  };
}

export type ClippedListPrefixCleanupResult = {
  markdown: string;
  removedCount: number;
};

// Bullet characters commonly inserted as duplicates by web clippers
// (used inline in the regex below)
/**
 * Remove redundant list prefixes inserted by web clippers:
 * 1. Unordered: `- {: ...}• text` → `- {: ...}text`
 * 2. Ordered nested: outer empty wrapper + inner numbered sub-item
 *    flattened to a single numbered item at the outer level.
 */
export function removeClippedListPrefixesFromMarkdown(
  markdown: string
): ClippedListPrefixCleanupResult {
  if (!markdown) {
    return { markdown: "", removedCount: 0 };
  }

  let removedCount = 0;
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  const bulletChars = "[•·○◦▪▸➢➤►◆◇✓✔★☆→⁃‣⦿⦾◉●]";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // SQL markdown for clipped unordered lists is flattened to `- • text`.
    const flatUnorderedMatch = line.match(
      new RegExp(`^(\\s*(?:[-*+]))\\s+(${bulletChars})\\s*(.*)$`)
    );
    if (flatUnorderedMatch) {
      out.push(`${flatUnorderedMatch[1]} ${flatUnorderedMatch[3]}`);
      removedCount += 1;
      i += 1;
      continue;
    }

    // ── Case 1: unordered bullet duplicate ────────────────────────────────
    // Pattern: `(indent)(- )(IAL)(bullet_char)(optional_space)(rest)`
    const unorderedMatch = line.match(
      new RegExp(`^(\\s*(?:[-*+]) \\{:[^}]*\\})\\s*(${bulletChars})\\s*(.*)$`)
    );
    if (unorderedMatch) {
      out.push(`${unorderedMatch[1]}${unorderedMatch[3]}`);
      removedCount += 1;
      i += 1;
      continue;
    }

    // SQL markdown for clipped ordered lists is flattened to `1. 1. text`.
    const flatOrderedMatch = line.match(/^(\s*)(\d+)([.)])\s+(\d+)([.)])\s+(.*)$/);
    if (flatOrderedMatch && flatOrderedMatch[2] === flatOrderedMatch[4]) {
      out.push(
        `${flatOrderedMatch[1]}${flatOrderedMatch[2]}${flatOrderedMatch[3]} ${flatOrderedMatch[6]}`
      );
      removedCount += 1;
      i += 1;
      continue;
    }

    // ── Case 2: ordered list — empty outer item wrapping a numbered sub-item
    // Outer: `(indent)(N. )(IAL)` with no trailing content
    // Next lines: `(indent+3)(N. )(IAL)(content)` then `(indent+6)(IAL)` then `(indent+3)(IAL)`
    const orderedOuterMatch = line.match(/^(\s*)(\d+)[.)]{1} \{:[^}]*\}\s*$/);
    if (orderedOuterMatch) {
      const baseIndent = orderedOuterMatch[1];
      const outerNum = orderedOuterMatch[2];
      const innerIndent = baseIndent + "   ";

      // Peek ahead: next non-attr line should be the inner item
      let j = i + 1;
      // skip blank/attr lines between outer item and its children
      while (j < lines.length && lines[j].trim() === "") {
        j += 1;
      }
      const innerItemLine = j < lines.length ? lines[j] : "";
      const innerMatch = innerItemLine.match(
        new RegExp(`^${innerIndent.replace(/\s/g, "\\s")}(\\d+)[.)]{1} (\\{:[^}]*\\})(.*)$`)
      );

      if (innerMatch && innerMatch[1] === outerNum) {
        // This is the clipped pattern: flatten by replacing outer with inner content
        // Collect inner item's continuation lines and trailing IALs
        const innerIal = innerMatch[2];
        const innerContent = innerMatch[3];
        const flatLine = `${baseIndent}${outerNum}. ${innerIal}${innerContent}`;
        out.push(flatLine);
        removedCount += 1;
        i = j + 1; // skip outer header line + inner item line

        const deeperIndent = innerIndent + "   ";
        // Copy continuation lines of the inner item (dedented by 3 spaces).
        // Stop before the outer item's trailing IAL (at innerIndent but not deeperIndent).
        while (i < lines.length) {
          const contLine = lines[i];
          if (!contLine.startsWith(innerIndent)) break;
          // The outer item's own IAL sits at innerIndent but not deeperIndent — skip it
          if (!contLine.startsWith(deeperIndent) && /^\s*\{:[^}]*\}\s*$/.test(contLine)) {
            i += 1; // consume the outer item IAL without emitting it
            break;
          }
          out.push(baseIndent + contLine.slice(innerIndent.length));
          i += 1;
        }
        continue;
      }
    }

    out.push(line);
    i += 1;
  }

  return { markdown: out.join("\n"), removedCount };
}
