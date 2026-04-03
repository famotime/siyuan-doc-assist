export type NetworkLensPluginLike = {
  loadData?: (storageName: string) => Promise<any>;
};

export type NetworkLensDocumentSummary = {
  summaryShort: string;
  summaryMedium: string;
  keywords: string[];
  evidenceSnippets: string[];
  indexedAt: string;
  sourceHash: string;
};

type NetworkLensDocumentSemanticProfileRecord = {
  sourceUpdatedAt?: string;
  sourceHash?: string;
  documentSummaryShort?: string;
  documentSummaryMedium?: string;
  documentKeywordsJson?: string;
  documentEvidenceSnippetsJson?: string;
  documentSummaryUpdatedAt?: string;
};

export async function loadFreshNetworkLensDocumentSummary(params: {
  networkLensPlugin: NetworkLensPluginLike | null | undefined;
  documentId: string;
  documentUpdatedAt: string;
}): Promise<NetworkLensDocumentSummary | null> {
  const snapshot = await params.networkLensPlugin?.loadData?.("ai-document-index.json");
  const profile = snapshot?.semanticProfiles?.[params.documentId] as
    | NetworkLensDocumentSemanticProfileRecord
    | undefined;

  if (!profile) {
    return null;
  }
  if ((profile.sourceUpdatedAt || "") !== params.documentUpdatedAt) {
    return null;
  }

  const summaryShort = typeof profile.documentSummaryShort === "string"
    ? profile.documentSummaryShort.trim()
    : "";
  if (!summaryShort) {
    return null;
  }

  const summaryMedium = typeof profile.documentSummaryMedium === "string"
    ? profile.documentSummaryMedium.trim() || summaryShort
    : summaryShort;

  return {
    summaryShort,
    summaryMedium,
    keywords: parseJsonStringArray(profile.documentKeywordsJson),
    evidenceSnippets: parseJsonStringArray(profile.documentEvidenceSnippetsJson),
    indexedAt: typeof profile.documentSummaryUpdatedAt === "string"
      ? profile.documentSummaryUpdatedAt.trim()
      : "",
    sourceHash: typeof profile.sourceHash === "string" ? profile.sourceHash.trim() : "",
  };
}

export function resolveNetworkLensPluginFromPlugins(
  plugins: Array<{ name?: string; loadData?: (storageName: string) => Promise<any> }> | undefined
): NetworkLensPluginLike | null {
  if (!Array.isArray(plugins)) {
    return null;
  }
  return plugins.find((plugin) => plugin?.name === "siyuan-network-lens") || null;
}

function parseJsonStringArray(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
