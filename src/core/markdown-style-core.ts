export type BlockStyle = "bold" | "highlight";

const STYLE_MARKERS: Record<BlockStyle, string> = {
  bold: "**",
  highlight: "==",
};

const ATTR_LINE_REGEX = /^\s*\{\:\s*[^}]+\}\s*$/;
const ATTR_SUFFIX_REGEX = /\s*\{\:\s*[^}]+\}\s*$/;

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

  const { body, suffix } = splitAttrSuffix(line);
  const headingMatch = body.match(/^(\s*#{1,6}\s+)(.*)$/);
  if (headingMatch) {
    const content = headingMatch[2] || "";
    if (!content.trim()) {
      return {
        original: line,
        stylable: false,
        prefix: "",
        content: "",
        suffix: "",
      };
    }
    return {
      original: line,
      stylable: true,
      prefix: headingMatch[1],
      content,
      suffix,
    };
  }

  const listMatch = body.match(/^(\s*(?:[-*+]|[0-9]+\.)\s+)(.*)$/);
  if (listMatch) {
    const content = listMatch[2] || "";
    if (!content.trim()) {
      return {
        original: line,
        stylable: false,
        prefix: "",
        content: "",
        suffix: "",
      };
    }
    return {
      original: line,
      stylable: true,
      prefix: listMatch[1],
      content,
      suffix,
    };
  }

  const quoteMatch = body.match(/^(\s*>+\s*)(.*)$/);
  if (quoteMatch) {
    const content = quoteMatch[2] || "";
    if (!content.trim()) {
      return {
        original: line,
        stylable: false,
        prefix: "",
        content: "",
        suffix: "",
      };
    }
    return {
      original: line,
      stylable: true,
      prefix: quoteMatch[1],
      content,
      suffix,
    };
  }

  const indentMatch = body.match(/^(\s*)(.*)$/);
  if (!indentMatch) {
    return {
      original: line,
      stylable: true,
      prefix: "",
      content: body,
      suffix,
    };
  }
  if (!indentMatch[2].trim()) {
    return {
      original: line,
      stylable: false,
      prefix: "",
      content: "",
      suffix: "",
    };
  }
  return {
    original: line,
    stylable: true,
    prefix: indentMatch[1],
    content: indentMatch[2],
    suffix,
  };
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
