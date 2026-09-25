export type AiServiceConfig = {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  requestTimeoutSeconds: number;
  temperature: number;
  maxTokens: number;
  headers?: Record<string, string>;
  protocol?: string;
};

export const DEFAULT_AI_REQUEST_TIMEOUT_SECONDS = 60;
export const DEFAULT_AI_TEMPERATURE = 0.7;
export const DEFAULT_AI_MAX_TOKENS = 4096;

export function buildDefaultAiServiceConfig(): AiServiceConfig {
  return {
    enabled: false,
    baseUrl: "",
    apiKey: "",
    model: "",
    requestTimeoutSeconds: DEFAULT_AI_REQUEST_TIMEOUT_SECONDS,
    temperature: DEFAULT_AI_TEMPERATURE,
    maxTokens: DEFAULT_AI_MAX_TOKENS,
  };
}

function sanitizeVisibleString(value: string): string {
  return value.replace(/\p{Cf}/gu, "").trim();
}

export function normalizeAiServiceConfig(raw: unknown): AiServiceConfig {
  const defaults = buildDefaultAiServiceConfig();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }

  const value = raw as Partial<AiServiceConfig>;
  return {
    enabled: value.enabled === true,
    baseUrl: typeof value.baseUrl === "string" ? sanitizeVisibleString(value.baseUrl) : defaults.baseUrl,
    apiKey: typeof value.apiKey === "string" ? sanitizeVisibleString(value.apiKey) : defaults.apiKey,
    model: typeof value.model === "string" ? sanitizeVisibleString(value.model) : defaults.model,
    requestTimeoutSeconds: normalizePositiveInteger(
      value.requestTimeoutSeconds,
      defaults.requestTimeoutSeconds
    ),
    temperature: normalizeTemperature(value.temperature, defaults.temperature),
    maxTokens: normalizePositiveInteger(value.maxTokens, defaults.maxTokens),
    headers: value.headers && typeof value.headers === "object" ? (value.headers as Record<string, string>) : undefined,
    protocol: typeof value.protocol === "string" ? sanitizeVisibleString(value.protocol) : undefined,
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

function normalizeTemperature(value: unknown, fallback: number): number {
  const parsed = typeof value === "string" && value.trim()
    ? Number.parseFloat(value)
    : typeof value === "number"
      ? value
      : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 2 ? parsed : fallback;
}

export function buildAiForwardProxyHeaders(config: { apiKey: string; headers?: Record<string, string> }): Array<Record<string, string>> {
  const headers: Array<Record<string, string>> = [
    { Authorization: `Bearer ${config.apiKey}` },
    { Accept: "application/json" },
  ];
  if (config.headers && typeof config.headers === "object") {
    for (const [key, value] of Object.entries(config.headers)) {
      if (key && value !== undefined && value !== null) {
        headers.push({ [key]: String(value) });
      }
    }
  }
  return headers;
}
