import {
  HeadingLevel,
  resolveHeadingColorMap
} from "../core/key-info-heading-color-core";

export function isDarkMode(doc: Document = document): boolean {
  if (!doc) {
    return false;
  }
  const rootMode =
    doc.documentElement?.getAttribute("data-theme-mode") ||
    doc.body?.getAttribute("data-theme-mode");
  if (rootMode === "dark") {
    return true;
  }
  if (rootMode === "light") {
    return false;
  }

  const siyuanConfigMode = (window as unknown as { siyuan?: { config?: { appearance?: { mode?: number } } } })
    ?.siyuan
    ?.config
    ?.appearance
    ?.mode;
  if (typeof siyuanConfigMode === "number") {
    return siyuanConfigMode === 1;
  }

  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  return false;
}

export function probeBaseTextColor(doc: Document = document): string {
  if (!doc || !doc.body) {
    return "";
  }
  try {
    const protyle = doc.querySelector(".protyle-wysiwyg");
    const target = protyle || doc.body;
    return window.getComputedStyle(target).color || "";
  } catch {
    return "";
  }
}

export function probeHeadingColors(doc: Document = document): Partial<Record<HeadingLevel, string>> {
  const probed: Partial<Record<HeadingLevel, string>> = {};
  if (!doc || !doc.body) {
    return probed;
  }

  const levels: HeadingLevel[] = [1, 2, 3, 4, 5, 6];
  const missingLevels: HeadingLevel[] = [];

  for (const level of levels) {
    const existing = doc.querySelector(`.protyle-wysiwyg [data-subtype="h${level}"], .protyle-wysiwyg .h${level}`);
    if (existing) {
      try {
        const color = window.getComputedStyle(existing).color;
        if (color) {
          probed[level] = color;
        }
      } catch {
        missingLevels.push(level);
      }
    } else {
      missingLevels.push(level);
    }
  }

  if (missingLevels.length > 0) {
    try {
      const probeContainer = doc.createElement("div");
      probeContainer.className = "protyle-wysiwyg b3-typography";
      probeContainer.setAttribute(
        "style",
        "position:fixed;left:-99999px;top:-99999px;visibility:hidden;pointer-events:none;width:0;height:0;overflow:hidden;"
      );

      const levelElements: Map<HeadingLevel, HTMLDivElement> = new Map();
      for (const level of missingLevels) {
        const h = doc.createElement("div");
        h.className = `h${level}`;
        h.setAttribute("data-subtype", `h${level}`);
        h.setAttribute("data-type", "NodeHeading");
        const span = doc.createElement("span");
        span.textContent = "Probe";
        h.appendChild(span);
        probeContainer.appendChild(h);
        levelElements.set(level, h);
      }

      doc.body.appendChild(probeContainer);

      for (const [level, hEl] of levelElements.entries()) {
        const color = window.getComputedStyle(hEl).color;
        if (color) {
          probed[level] = color;
        }
      }

      probeContainer.remove();
    } catch {
      // 忽略探测失败，降级使用默认色盘
    }
  }

  return probed;
}

export function resolveCurrentHeadingColors(doc: Document = document): Record<HeadingLevel, string> {
  const isDark = isDarkMode(doc);
  const baseColor = probeBaseTextColor(doc);
  const probed = probeHeadingColors(doc);
  return resolveHeadingColorMap(probed, isDark, baseColor);
}

export function applyHeadingColorsToElement(
  target: HTMLElement,
  colors: Record<HeadingLevel, string>
): void {
  if (!target || !target.style) {
    return;
  }
  const levels: HeadingLevel[] = [1, 2, 3, 4, 5, 6];
  for (const level of levels) {
    const color = colors[level];
    if (color) {
      target.style.setProperty(`--da-heading-color-${level}`, color);
    }
  }
}

export function refreshDockHeadingColors(
  rootElement: HTMLElement,
  doc: Document = document
): Record<HeadingLevel, string> {
  const colors = resolveCurrentHeadingColors(doc);
  applyHeadingColorsToElement(rootElement, colors);
  return colors;
}
