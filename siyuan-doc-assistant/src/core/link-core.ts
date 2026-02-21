export type DocRef = {
  id: string;
  name: string;
  hPath?: string;
  box?: string;
};

const BLOCK_ID_PATTERN = "[0-9]{14}-[a-z0-9]{7,}";

export function extractSiyuanBlockIdsFromMarkdown(markdown: string): string[] {
  const found = new Set<string>();
  const patterns = [
    new RegExp(`\\(\\((${BLOCK_ID_PATTERN})`, "g"),
    new RegExp(`siyuan://blocks/(${BLOCK_ID_PATTERN})`, "g"),
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    match = pattern.exec(markdown);
    while (match) {
      found.add(match[1]);
      match = pattern.exec(markdown);
    }
  }

  return [...found];
}

export function dedupeDocRefs<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    result.push(item);
  }

  return result;
}

export function buildBacklinkListMarkdown(items: DocRef[]): string {
  const lines = items.map((item) => `- [${item.name}](siyuan://blocks/${item.id})`);
  return `## 反向链接文档\n\n${lines.join("\n")}`;
}
