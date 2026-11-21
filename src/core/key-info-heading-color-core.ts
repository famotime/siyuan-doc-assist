export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export const DEFAULT_HEADING_COLORS_LIGHT: Record<HeadingLevel, string> = {
  1: "#2563eb",
  2: "#0d9488",
  3: "#d97706",
  4: "#7c3aed",
  5: "#db2777",
  6: "#4b5563"
};

export const DEFAULT_HEADING_COLORS_DARK: Record<HeadingLevel, string> = {
  1: "#60a5fa",
  2: "#2dd4bf",
  3: "#fbbf24",
  4: "#a78bfa",
  5: "#f472b6",
  6: "#9ca3af"
};

export function normalizeColorValue(color?: string | null): string {
  if (!color) {
    return "";
  }
  const normalized = color.trim().toLowerCase().replace(/\s+/g, "");
  if (
    normalized === "transparent" ||
    normalized === "rgba(0,0,0,0)" ||
    normalized === "none" ||
    normalized === "inherit" ||
    normalized === "initial"
  ) {
    return "";
  }
  return normalized;
}

export function isEffectiveHeadingColor(color: string | undefined, baseColor: string | undefined): boolean {
  const normColor = normalizeColorValue(color);
  if (!normColor) {
    return false;
  }
  const normBase = normalizeColorValue(baseColor);
  if (normBase && normColor === normBase) {
    return false;
  }
  return true;
}

export function resolveHeadingColorMap(
  probedColors: Partial<Record<number, string>> = {},
  isDark: boolean = false,
  baseColor?: string
): Record<HeadingLevel, string> {
  const fallbackPalette = isDark ? DEFAULT_HEADING_COLORS_DARK : DEFAULT_HEADING_COLORS_LIGHT;
  const result: Record<HeadingLevel, string> = { ...fallbackPalette };

  const levels: HeadingLevel[] = [1, 2, 3, 4, 5, 6];
  for (const level of levels) {
    const probed = probedColors[level];
    if (isEffectiveHeadingColor(probed, baseColor)) {
      result[level] = probed!.trim();
    }
  }

  return result;
}
