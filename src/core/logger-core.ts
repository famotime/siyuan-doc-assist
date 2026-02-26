type ConsoleMethod = "info" | "warn" | "error";

type DocAssistantLogger = {
  debug: (message: string, payload?: unknown) => void;
  warn: (message: string, payload?: unknown) => void;
  error: (message: string, payload?: unknown) => void;
};

const DEBUG_GLOBAL_KEY = "__DOC_ASSISTANT_DEBUG__";
const DEBUG_STORAGE_KEY = "doc-assistant.debug";
let debugOverride: boolean | null = null;

function parseBooleanFlag(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (["1", "true", "on", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "off", "no", "n"].includes(normalized)) {
    return false;
  }
  return null;
}

export function setDocAssistantDebugEnabled(enabled: boolean) {
  debugOverride = enabled;
  (globalThis as Record<string, unknown>)[DEBUG_GLOBAL_KEY] = enabled;
}

export function resetDocAssistantDebugSetting() {
  debugOverride = null;
  const globalRef = globalThis as Record<string, unknown>;
  delete globalRef[DEBUG_GLOBAL_KEY];
}

export function isDocAssistantDebugEnabled(): boolean {
  if (debugOverride !== null) {
    return debugOverride;
  }

  const globalValue = parseBooleanFlag(
    (globalThis as Record<string, unknown>)[DEBUG_GLOBAL_KEY]
  );
  if (globalValue !== null) {
    return globalValue;
  }

  const envValue = parseBooleanFlag(
    typeof process !== "undefined" ? process.env?.DOC_ASSISTANT_DEBUG : undefined
  );
  if (envValue !== null) {
    return envValue;
  }

  try {
    if (
      typeof localStorage !== "undefined" &&
      typeof localStorage.getItem === "function"
    ) {
      const value = parseBooleanFlag(localStorage.getItem(DEBUG_STORAGE_KEY));
      if (value !== null) {
        return value;
      }
    }
  } catch {
    // Ignore storage read errors.
  }

  return false;
}

function emit(method: ConsoleMethod, message: string, payload?: unknown) {
  if (payload === undefined) {
    console[method](message);
    return;
  }
  console[method](message, payload);
}

export function createDocAssistantLogger(scope: string): DocAssistantLogger {
  const prefix = `[DocAssistant][${scope}]`;
  const toMessage = (message: string) => `${prefix} ${message}`;
  return {
    debug: (message, payload) => {
      if (!isDocAssistantDebugEnabled()) {
        return;
      }
      emit("info", toMessage(message), payload);
    },
    warn: (message, payload) => {
      emit("warn", toMessage(message), payload);
    },
    error: (message, payload) => {
      emit("error", toMessage(message), payload);
    },
  };
}
