export type DedupeDoc = {
  id: string;
  title: string;
  updated: string;
};

export type DuplicateGroup = {
  docs: DedupeDoc[];
  score: number;
};

function removeBracketedContent(text: string): string {
  const isDuplicatedTag = (value: string) =>
    value.trim().toLowerCase().startsWith("duplicated");

  const replaceIfDuplicated = (
    source: string,
    pattern: RegExp
  ): string => {
    return source.replace(pattern, (full, inner) => {
      return isDuplicatedTag(String(inner)) ? " " : full;
    });
  };

  let current = text;
  const patterns = [
    /\(([^()]*)\)/g,
    /（([^（）]*)）/g,
    /\[([^\[\]]*)\]/g,
    /【([^【】]*)】/g,
    /\{([^{}]*)\}/g,
    /｛([^｛｝]*)｝/g,
  ];

  for (let i = 0; i < 4; i++) {
    const next = patterns.reduce(
      (acc, pattern) => replaceIfDuplicated(acc, pattern),
      current
    );
    if (next === current) {
      break;
    }
    current = next;
  }
  return current;
}

export function normalizeTitle(title: string): string {
  return removeBracketedContent(title)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}_]+/gu, "")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const cols = b.length + 1;
  const dp: number[] = Array(cols).fill(0);
  for (let j = 0; j < cols; j++) dp[j] = j;

  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + cost
      );
      prev = temp;
    }
  }
  return dp[b.length];
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

class UnionFind {
  private parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }

  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) {
      this.parent[rb] = ra;
    }
  }
}

export function buildDuplicateGroups(
  docs: DedupeDoc[],
  threshold: number
): DuplicateGroup[] {
  if (docs.length < 2) {
    return [];
  }

  const normalized = docs.map((doc) => normalizeTitle(doc.title));
  const uf = new UnionFind(docs.length);
  const pairScore: Map<string, number> = new Map();

  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const score = similarity(normalized[i], normalized[j]);
      if (score >= threshold) {
        uf.union(i, j);
        pairScore.set(`${i}-${j}`, score);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < docs.length; i++) {
    const root = uf.find(i);
    if (!groups.has(root)) {
      groups.set(root, []);
    }
    groups.get(root)!.push(i);
  }

  const result: DuplicateGroup[] = [];
  for (const indices of groups.values()) {
    if (indices.length < 2) {
      continue;
    }
    let maxScore = 0;
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        const a = indices[i];
        const b = indices[j];
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        const score = pairScore.get(key) ?? similarity(normalized[a], normalized[b]);
        if (score > maxScore) {
          maxScore = score;
        }
      }
    }
    result.push({
      docs: indices.map((index) => docs[index]),
      score: maxScore,
    });
  }

  return result;
}

export function suggestKeepDocId(
  docs: Array<{ id: string; updated: string }>,
  mode: "latest" | "earliest" = "latest"
): string {
  if (docs.length === 0) {
    return "";
  }
  const sorted = docs
    .slice()
    .sort((a, b) => (a.updated < b.updated ? 1 : -1));
  if (mode === "earliest") {
    return sorted[sorted.length - 1].id;
  }
  return sorted[0].id;
}
