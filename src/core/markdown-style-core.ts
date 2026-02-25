export type BlockStyle = "bold" | "highlight";

const STYLE_MARKERS: Record<BlockStyle, string> = {
  bold: "**",
  highlight: "==",
};

const ATTR_LINE_REGEX = /^\s*\{\:\s*[^}]+\}\s*$/;
const ATTR_SUFFIX_REGEX = /\s*\{\:\s*[^}]+\}\s*$/;

function splitAttrSuffix(line: string): { body: string; suffix: string } {
  const match = line.match(ATTR_SUFFIX_REGEX);
  if (!match) {
    return { body: line, suffix: "" };
  }
  const index = line.lastIndexOf(match[0]);
  return {
    body: line.slice(0, index),
    suffix: line.slice(index),
  };
}

function wrapContent(content: string, marker: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    return content;
  }
  if (trimmed.startsWith(marker) && trimmed.endsWith(marker)) {
    return trimmed;
  }
  return `${marker}${trimmed}${marker}`;
}

function applyStyleToLine(line: string, marker: string): string {
  if (!line.trim()) {
    return line;
  }
  if (ATTR_LINE_REGEX.test(line)) {
    return line;
  }

  const { body, suffix } = splitAttrSuffix(line);
  const headingMatch = body.match(/^(\s*#{1,6}\s+)(.*)$/);
  if (headingMatch) {
    const content = headingMatch[2] || "";
    if (!content.trim()) {
      return line;
    }
    return `${headingMatch[1]}${wrapContent(content, marker)}${suffix}`;
  }

  const listMatch = body.match(/^(\s*(?:[-*+]|[0-9]+\.)\s+)(.*)$/);
  if (listMatch) {
    const content = listMatch[2] || "";
    if (!content.trim()) {
      return line;
    }
    return `${listMatch[1]}${wrapContent(content, marker)}${suffix}`;
  }

  const quoteMatch = body.match(/^(\s*>+\s*)(.*)$/);
  if (quoteMatch) {
    const content = quoteMatch[2] || "";
    if (!content.trim()) {
      return line;
    }
    return `${quoteMatch[1]}${wrapContent(content, marker)}${suffix}`;
  }

  const indentMatch = body.match(/^(\s*)(.*)$/);
  if (!indentMatch) {
    return `${wrapContent(body, marker)}${suffix}`;
  }
  return `${indentMatch[1]}${wrapContent(indentMatch[2], marker)}${suffix}`;
}

export function applyBlockStyle(markdown: string, style: BlockStyle): string {
  const marker = STYLE_MARKERS[style];
  const lines = (markdown || "").split(/\r?\n/);
  const styled = lines.map((line) => applyStyleToLine(line, marker));
  return styled.join("\n");
}
