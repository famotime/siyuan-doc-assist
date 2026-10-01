// Comprehensive emoji matching pattern using Unicode Property Escapes
// Matches:
// 1. Flag sequences: 2 regional indicators, e.g. 🇨🇳 🇺🇸
// 2. Extended pictographics with optional variation selectors, skin tone modifiers, and ZWJ compound sequences (e.g. 👨‍👩‍👧‍👦, 👍🏽, ❤️)
// 3. Common emoji presentation symbols
export const EMOJI_REGEX =
  /(?:[\u{1F1E6}-\u{1F1FF}]{2}|(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:[\uFE0E\uFE0F]|[\u{1F3FB}-\u{1F3FF}])?(?:\u200D(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:[\uFE0E\uFE0F]|[\u{1F3FB}-\u{1F3FF}])?)*)/gu;

/**
 * Checks if a line has meaningful Markdown structural indentation that should be preserved:
 * - List items: "   - item", "  * item", "    1. item"
 * - Blockquotes: "  > quote"
 * - Tables: "| col1 | col2 |" or "  | col1 | col2 |"
 * - Fenced code blocks: "  ```js"
 */
function shouldPreserveLineIndentation(line: string): boolean {
  return /^[ \t]*(?:[-*+]|\d+[.)]|>|\||```)/.test(line);
}

/**
 * Collapses whitespace around where emojis were removed:
 * - Preserves leading indentation (spaces or tabs) for Markdown lists, blockquotes, tables, etc.
 * - Collapses multiple consecutive spaces (or tabs) within line content into a single space.
 * - Cleans up spaces before punctuation (e.g. "word !" -> "word!").
 * - Protects Markdown table formatting (e.g. "| :---" is not corrupted).
 * - Trims trailing whitespace on lines, and trims leading whitespace for non-structural lines.
 */
export function collapseExtraneousSpaces(text: string): string {
  if (!text) {
    return text;
  }
  const lines = text.split("\n");
  const processedLines = lines.map((line) => {
    // If the line is empty or purely whitespace, preserve as empty line
    if (!line.trim()) {
      return "";
    }

    const preserveIndent = shouldPreserveLineIndentation(line);
    const indentMatch = line.match(/^[ \t]*/);
    const indent = preserveIndent && indentMatch ? indentMatch[0] : "";
    let body = line.slice(indent.length);

    // If indentation is not preserved, trim leading whitespace
    if (!preserveIndent) {
      body = body.replace(/^[ \t]+/, "");
    }

    // Collapse multiple horizontal spaces/tabs within content to a single space
    body = body.replace(/[ \t]{2,}/g, " ");

    // Clean up spaces before Chinese punctuation and common English punctuation:
    // e.g., "hello , world" -> "hello, world" or "word !" -> "word!" or "word 。" -> "word。"
    body = body.replace(/[ \t]+([，。！？；、,!?;])/g, "$1");
    body = body.replace(/[ \t]+([：])/g, "$1");

    // Clean up spaces before colon ':' only when preceded by normal text and not part of table alignment "| :" or ":---"
    body = body.replace(/([^\s|:])[ \t]+:(?!\S*-)/g, "$1:");

    // Clean up spaces inside inline code backticks: e.g. ` #tag#` -> `#tag#`
    body = body.replace(/`[ \t]+([^`\n]+?)`/g, "`$1`");
    body = body.replace(/(`[^`\n]+?)[ \t]+`/g, "$1`");

    // Clean up spaces before closing bold mark: e.g. **text ** -> **text**
    body = body.replace(/(\*\*[^\s*][^*]*?)[ \t]+\*\*/g, "$1**");

    // Clean up leading spaces after table pipes (excluding alignment rows like "| :---")
    body = body.replace(/\|[ \t]+(?=[^:\s|])/g, "|");
    // Clean up trailing spaces before table pipes
    body = body.replace(/([^\s|])[ \t]+\|/g, "$1|");

    // Trim trailing whitespace only
    body = body.replace(/[ \t]+$/, "");

    return indent + body;
  });
  return processedLines.join("\n");
}

export type EmojiCleanupResult = {
  next: string;
  removedCount: number;
};

/**
 * Removes all Unicode Emoji characters and sequences from text,
 * and tidies up adjacent double spaces.
 */
export function removeEmojiFromText(text: string): EmojiCleanupResult {
  if (!text) {
    return { next: text, removedCount: 0 };
  }

  let removedCount = 0;
  const stripped = text.replace(EMOJI_REGEX, () => {
    removedCount += 1;
    return "";
  });

  if (removedCount === 0) {
    return { next: text, removedCount: 0 };
  }

  const next = collapseExtraneousSpaces(stripped);
  return { next, removedCount };
}
