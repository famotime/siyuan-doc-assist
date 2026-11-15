import type { WikiCommandProvider } from "@/plugin/wiki-command-provider-types";
import { createDocAssistantLogger } from "@/core/logger-core";

const networkLensIndexLogger = createDocAssistantLogger("NetworkLensIndex");

export type NetworkLensPluginLike = {
  loadData?: (storageName: string) => Promise<any>;
  getWikiCommandIntegration?: () => WikiCommandProvider | null;
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
  /**
   * 调用方能拿到的当前内容哈希（可选）。与缓存中的 sourceHash 都非空且不一致时，
   * 即使 sourceUpdatedAt 相同（同一秒内多次保存）也视为过期（审计遗留项 2.6）。
   * 注意：当前调用方无法复现脉络镜的哈希算法，暂无人传入；比较能力先就位。
   */
  expectedSourceHash?: string;
}): Promise<NetworkLensDocumentSummary | null> {
  const expectedHash = (params.expectedSourceHash || "").trim();
  const snapshot = await params.networkLensPlugin?.loadData?.("ai-document-index.json");
  if (snapshot && typeof snapshot.schemaVersion === "number" && snapshot.schemaVersion >= 3) {
    const v3Profile = snapshot?.documentProfiles?.[params.documentId];
    if (v3Profile && v3Profile.sourceUpdatedAt === params.documentUpdatedAt && v3Profile.positioning?.trim()) {
      const storedHash = (v3Profile.sourceHash || "").trim();
      if (expectedHash && storedHash && expectedHash !== storedHash) {
        networkLensIndexLogger.warn("cached v3 summary source hash mismatch, treat as stale", {
          documentId: params.documentId
        });
      } else {
        const positioning = v3Profile.positioning.trim();
        const primaryBlocks = parseJsonStringArray(v3Profile.primarySourceBlocksJson);
        const snippets = Array.isArray(primaryBlocks) ?
            (primaryBlocks as any[]).map((item) => (typeof item === "object" && item?.text ? item.text : String(item))) :
            [];
        // v3 命中路径的 medium 恒等于 short（脉络镜仅存 positioning），降级不再是静默的
        networkLensIndexLogger.debug("v3 cached summary hit; medium falls back to short positioning", {
          documentId: params.documentId
        });
        return {
          summaryShort: positioning,
          summaryMedium: positioning,
          keywords: parseJsonStringArray(v3Profile.keywordsJson),
          evidenceSnippets: snippets,
          indexedAt: v3Profile.generatedAt || "",
          sourceHash: v3Profile.sourceHash || ""
        };
      }
    }
  }

  const profile = snapshot?.semanticProfiles?.[params.documentId] as
    | NetworkLensDocumentSemanticProfileRecord |
    undefined;

  if (!profile) {
    return null;
  }
  if ((profile.sourceUpdatedAt || "") !== params.documentUpdatedAt) {
    return null;
  }

  const legacyStoredHash = (profile.sourceHash || "").trim();
  if (expectedHash && legacyStoredHash && expectedHash !== legacyStoredHash) {
    networkLensIndexLogger.warn("cached legacy summary source hash mismatch, treat as stale", {
      documentId: params.documentId
    });
    return null;
  }

  const summaryShort = typeof profile.documentSummaryShort === "string" ?
      profile.documentSummaryShort.trim() :
    "";
  if (!summaryShort) {
    return null;
  }

  const summaryMedium = typeof profile.documentSummaryMedium === "string" ?
    profile.documentSummaryMedium.trim() || summaryShort :
    summaryShort;

  return {
    summaryShort,
    summaryMedium,
    keywords: parseJsonStringArray(profile.documentKeywordsJson),
    evidenceSnippets: parseJsonStringArray(profile.documentEvidenceSnippetsJson),
    indexedAt: typeof profile.documentSummaryUpdatedAt === "string" ?
        profile.documentSummaryUpdatedAt.trim() :
      "",
    sourceHash: typeof profile.sourceHash === "string" ? profile.sourceHash.trim() : ""
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
    return Array.isArray(parsed) ?
        parsed.filter((item): item is string => typeof item === "string") :
        [];
  } catch {
    return [];
  }
}
