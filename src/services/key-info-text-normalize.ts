export function decodeBasicHtmlEntities(text: string): string {
  return (text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

export function replaceLinksWithVisibleText(source: string): string {
  let next = decodeBasicHtmlEntities(source || "");
  next = next.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1");
  next = next.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  next = next.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  next = next.replace(/\[\[([^\]]+)\]\]/g, "$1");
  next = next.replace(/<https?:\/\/[^>]+>/gi, " ");
  return next;
}

export function maskRanges(text: string, ranges: Array<[number, number]>): string {
  if (!ranges.length) {
    return text;
  }
  const chars = [...text];
  for (const [start, end] of ranges) {
    for (let index = start; index < end && index < chars.length; index += 1) {
      chars[index] = " ";
    }
  }
  return chars.join("");
}

export function stripLinks(source: string): string {
  return replaceLinksWithVisibleText(source || "");
}
