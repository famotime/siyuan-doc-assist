export type DocRefItem = {
  id: string;
  box: string;
  hPath: string;
  name: string;
  depth?: number;
  updated?: string;
  source: "backlink" | "forward" | "child";
};

export type DedupeDocItem = {
  id: string;
  title: string;
  updated: string;
  hPath: string;
};

export type DedupeCandidate = {
  groupId: string;
  score: number;
  docs: DedupeDocItem[];
};

export type OperationReport = {
  successIds: string[];
  skippedIds: string[];
  renamed: Array<{ id: string; title: string }>;
  failed: Array<{ id: string; error: string }>;
};
