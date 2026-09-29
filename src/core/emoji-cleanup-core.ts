// Comprehensive emoji matching pattern using Unicode Property Escapes
// Matches:
// 1. Flag sequences: 2 regional indicators, e.g. 🇨🇳 🇺🇸
// 2. Extended pictographics with optional variation selectors, skin tone modifiers, and ZWJ compound sequences (e.g. 👨‍👩‍👧‍👦, 👍🏽, ❤️)
// 3. Common emoji presentation symbols
export const EMOJI_REGEX =
  /(?:[\u{1F1E6}-\u{1F1FF}]{2}|(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:[\uFE0E\uFE0F]|[\u{1F3FB}-\u{1F3FF}])?(?:\u200D(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:[\uFE0E\uFE0F]|[\u{1F3FB}-\u{1F3FF}])?)*)/gu;

/**
 * Collapses whitespace around where emojis were removed:
 * - Collapses multiple consecutive spaces (or tabs) into a single space.
 * - Cleans up spaces before punctuation (e.g. "word !" -> "word!").
 * - Trims leading/trailing whitespace on lines.
 */
export function collapseExtraneousSpaces(text: string): string {
  if (!text) {
    return text;
  }
  const lines = text.split("\n");
  const processedLines = lines.map((line) => {
    // If the line is empty or purely whitespace, return empty
    if (!line.trim()) {
      return "";
    }
    // Collapse multiple horizontal spaces/tabs to single space
    let result = line.replace(/[ \t]{2,}/g, " ");
    // Clean up spaces before punctuation (e.g., "hello , world" -> "hello, world" or "word !" -> "word!" or "word 。" -> "word。")
    result = result.replace(/[ \t]+([，。！？；：、,.!?;:])/g, "$1");
    // Trim leading and trailing whitespace
    result = result.trim();
    return result;
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
