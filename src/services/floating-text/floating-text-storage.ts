import {
  DEFAULT_FLOATING_TEXT_CONFIG,
  FloatingTextConfig,
  normalizeFloatingConfig,
} from "@/core/floating-text-core";

const FLOATING_TEXT_STORAGE_KEY = "doc-assistant.floating-text.config";

/**
 * 读取本地持久化的悬浮文本配置
 */
export function loadFloatingTextConfig(
  storage: Pick<Storage, "getItem"> | null | undefined = typeof window !== "undefined"
    ? window.localStorage
    : null
): FloatingTextConfig {
  if (!storage || typeof storage.getItem !== "function") {
    return { ...DEFAULT_FLOATING_TEXT_CONFIG };
  }
  try {
    const raw = storage.getItem(FLOATING_TEXT_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_FLOATING_TEXT_CONFIG };
    }
    const parsed = JSON.parse(raw);
    return normalizeFloatingConfig(parsed);
  } catch {
    return { ...DEFAULT_FLOATING_TEXT_CONFIG };
  }
}

/**
 * 保存悬浮文本配置到本地存储
 */
export function saveFloatingTextConfig(
  patch: Partial<FloatingTextConfig>,
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined = typeof window !== "undefined"
    ? window.localStorage
    : null
): FloatingTextConfig {
  const current = loadFloatingTextConfig(storage);
  const next = normalizeFloatingConfig({ ...current, ...patch });
  if (storage && typeof storage.setItem === "function") {
    try {
      storage.setItem(FLOATING_TEXT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 忽略存储失败异常（如隐私模式配额超限）
    }
  }
  return next;
}
