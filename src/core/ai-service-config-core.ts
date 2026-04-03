export type AiServiceConfig = {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  requestTimeoutSeconds: number;
};

export const DEFAULT_AI_REQUEST_TIMEOUT_SECONDS = 30;

export function buildDefaultAiServiceConfig(): AiServiceConfig {
  return {
    enabled: false,
    baseUrl: "",
    apiKey: "",
    model: "",
    requestTimeoutSeconds: DEFAULT_AI_REQUEST_TIMEOUT_SECONDS,
  };
}

export function normalizeAiServiceConfig(raw: unknown): AiServiceConfig {
  const defaults = buildDefaultAiServiceConfig();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }

  const value = raw as Partial<AiServiceConfig>;
  return {
    enabled: value.enabled === true,
    baseUrl: typeof value.baseUrl === "string" ? value.baseUrl.trim() : defaults.baseUrl,
    apiKey: typeof value.apiKey === "string" ? value.apiKey.trim() : defaults.apiKey,
    model: typeof value.model === "string" ? value.model.trim() : defaults.model,
    requestTimeoutSeconds: normalizePositiveInteger(
      value.requestTimeoutSeconds,
      defaults.requestTimeoutSeconds
    ),
  };
}

export function isAiServiceConfigComplete(config?: unknown): boolean {
  const normalized = normalizeAiServiceConfig(config);
  return Boolean(
    normalized.enabled &&
      normalized.baseUrl &&
      normalized.apiKey &&
      normalized.model
  );
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const normalized = typeof value === "string" && value.trim()
    ? Number.parseInt(value, 10)
    : typeof value === "number"
      ? Math.floor(value)
      : Number.NaN;
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
}
