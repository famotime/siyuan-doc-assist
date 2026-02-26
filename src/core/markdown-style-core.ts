export type BlockStyle = "bold" | "highlight";

const STYLE_MARKERS: Record<BlockStyle, string> = {
  bold: "**",
  highlight: "==",
};

const ATTR_LINE_REGEX = /^\s*\{\:\s*[^}]+\}\s*$/;
const ATTR_SUFFIX_REGEX = /\s*\{\:\s*[^}]+\}\s*$/;
const ATTR_LEADING_REGEX = /^\s*(?:\{\:\s*[^}]+\}\s*)+/;

type ParsedStyleLine = {
  original: string;
  stylable: boolean;
  prefix: string;
  content: string;
  suffix: string;
};

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

function splitLeadingAttrs(content: string): { body: string; attrs: string } {
  const match = content.match(ATTR_LEADING_REGEX);
  if (!match) {
    return { body: content, attrs: "" };
  }
  const attrs = match[0].trim();
  return {
    body: content.slice(match[0].length),
    attrs,
  };
}

function toParsedStyleLine(
  original: string,
  prefix: string,
  content: string
): ParsedStyleLine {
  const normalizedContent = content || "";
  const { body } = splitLeadingAttrs(normalizedContent);
  if (!body.trim()) {
    return {
      original,
      stylable: false,
      prefix: "",
      content: "",
      suffix: "",
    };
  }
  return {
    original,
    stylable: true,
    prefix,
    content: body,
    suffix: "",
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

function parseStyleLine(line: string): ParsedStyleLine {
  if (!line.trim()) {
    return {
      original: line,
      stylable: false,
      prefix: "",
      content: "",
      suffix: "",
    };
  }
  if (ATTR_LINE_REGEX.test(line)) {
    return {
      original: line,
      stylable: false,
      prefix: "",
      content: "",
      suffix: "",
    };
  }

  const { body } = splitAttrSuffix(line);
  const headingMatch = body.match(/^(\s*#{1,6}\s+)(.*)$/);
  if (headingMatch) {
    return toParsedStyleLine(line, headingMatch[1], headingMatch[2] || "");
  }

  const listMatch = body.match(/^(\s*(?:[-*+]|[0-9]+\.)\s+)(.*)$/);
  if (listMatch) {
    return toParsedStyleLine(line, listMatch[1], listMatch[2] || "");
  }

  const quoteMatch = body.match(/^(\s*>+\s*)(.*)$/);
  if (quoteMatch) {
    return toParsedStyleLine(line, quoteMatch[1], quoteMatch[2] || "");
  }

  const indentMatch = body.match(/^(\s*)(.*)$/);
  if (!indentMatch) {
    return toParsedStyleLine(line, "", body);
  }
  return toParsedStyleLine(line, indentMatch[1], indentMatch[2]);
}

function removeMarkerTokens(content: string, marker: string): string {
  if (marker === "**") {
    return content.replace(/\*\*/g, "");
  }
  if (marker === "==") {
    return content.replace(/==/g, "");
  }
  return content;
}

function normalizeContentWithoutMarker(content: string, marker: string): string {
  return removeMarkerTokens(content, marker).trim();
}

function isFullyWrapped(content: string, marker: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) {
    return false;
  }
  if (!(trimmed.startsWith(marker) && trimmed.endsWith(marker))) {
    return false;
  }
  const inner = trimmed.slice(marker.length, trimmed.length - marker.length).trim();
  if (!inner) {
    return false;
  }
  return !inner.includes(marker);
}

export function applyBlockStyle(markdown: string, style: BlockStyle): string {
  const marker = STYLE_MARKERS[style];
  const lines = (markdown || "").split(/\r?\n/);
  const parsed = lines.map((line) => parseStyleLine(line));
  const stylable = parsed.filter((line) => line.stylable);
  if (!stylable.length) {
    return lines.join("\n");
  }

  const shouldRemoveStyle = stylable.every((line) =>
    isFullyWrapped(line.content, marker)
  );
  const styled = parsed.map((line) => {
    if (!line.stylable) {
      return line.original;
    }
    const normalized = normalizeContentWithoutMarker(line.content, marker);
    if (!normalized) {
      return line.original;
    }
    const nextContent = shouldRemoveStyle
      ? normalized
      : wrapContent(normalized, marker);
    return `${line.prefix}${nextContent}${line.suffix}`;
  });
  return styled.join("\n");
}
