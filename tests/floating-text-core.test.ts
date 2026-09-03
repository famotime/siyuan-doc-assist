import { describe, expect, it } from "vitest";
import {
  calculateSteppedFontSize,
  escapeHtml,
  hexToRgba,
  normalizeFloatingConfig,
  simpleMarkdownToHtml,
  DEFAULT_FLOATING_TEXT_CONFIG,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  MAX_OPACITY,
  MIN_OPACITY,
} from "@/core/floating-text-core";

describe("floating-text-core", () => {
  describe("normalizeFloatingConfig", () => {
    it("returns default config when input is null or undefined", () => {
      expect(normalizeFloatingConfig(null)).toEqual(DEFAULT_FLOATING_TEXT_CONFIG);
      expect(normalizeFloatingConfig(undefined)).toEqual(DEFAULT_FLOATING_TEXT_CONFIG);
    });

    it("clamps opacity between MIN_OPACITY and MAX_OPACITY", () => {
      const tooLow = normalizeFloatingConfig({ opacity: 0.01 });
      expect(tooLow.opacity).toBe(MIN_OPACITY);

      const tooHigh = normalizeFloatingConfig({ opacity: 1.5 });
      expect(tooHigh.opacity).toBe(MAX_OPACITY);

      const valid = normalizeFloatingConfig({ opacity: 0.72 });
      expect(valid.opacity).toBe(0.72);
    });

    it("clamps fontSize between MIN_FONT_SIZE and MAX_FONT_SIZE", () => {
      const tooLow = normalizeFloatingConfig({ fontSize: 5 });
      expect(tooLow.fontSize).toBe(MIN_FONT_SIZE);

      const tooHigh = normalizeFloatingConfig({ fontSize: 99 });
      expect(tooHigh.fontSize).toBe(MAX_FONT_SIZE);

      const valid = normalizeFloatingConfig({ fontSize: 18 });
      expect(valid.fontSize).toBe(18);
    });

    it("normalizes themeMode and viewMode", () => {
      const validDark = normalizeFloatingConfig({ themeMode: "dark", viewMode: "markdown" });
      expect(validDark.themeMode).toBe("dark");
      expect(validDark.viewMode).toBe("markdown");

      const invalid = normalizeFloatingConfig({
        themeMode: "custom" as any,
        viewMode: "other" as any,
      });
      expect(invalid.themeMode).toBe("auto");
      expect(invalid.viewMode).toBe("text");
    });
  });

  describe("calculateSteppedFontSize", () => {
    it("increments and decrements font size correctly", () => {
      expect(calculateSteppedFontSize(16, "up", 2)).toBe(18);
      expect(calculateSteppedFontSize(16, "down", 2)).toBe(14);
    });

    it("respects boundary limits", () => {
      expect(calculateSteppedFontSize(MAX_FONT_SIZE, "up", 1)).toBe(MAX_FONT_SIZE);
      expect(calculateSteppedFontSize(MIN_FONT_SIZE, "down", 1)).toBe(MIN_FONT_SIZE);
    });
  });

  describe("hexToRgba", () => {
    it("converts 6-digit hex color correctly", () => {
      expect(hexToRgba("#000000", 0.5)).toBe("rgba(0, 0, 0, 0.5)");
      expect(hexToRgba("#ffffff", 1)).toBe("rgba(255, 255, 255, 1)");
    });

    it("converts 3-digit hex color correctly", () => {
      expect(hexToRgba("#fff", 0.8)).toBe("rgba(255, 255, 255, 0.8)");
    });

    it("clamps opacity", () => {
      expect(hexToRgba("#123456", 1.5)).toBe("rgba(18, 52, 86, 1)");
      expect(hexToRgba("#123456", -0.5)).toBe("rgba(18, 52, 86, 0)");
    });
  });

  describe("escapeHtml", () => {
    it("escapes special HTML characters", () => {
      expect(escapeHtml("<script>alert('xss')</script>&")).toBe(
        "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;&amp;"
      );
    });
  });

  describe("simpleMarkdownToHtml", () => {
    it("returns empty string on empty input", () => {
      expect(simpleMarkdownToHtml("")).toBe("");
    });

    it("renders headings", () => {
      const html = simpleMarkdownToHtml("# 标题一\n## 标题二");
      expect(html).toContain('<h1 class="ft-h1">标题一</h1>');
      expect(html).toContain('<h2 class="ft-h2">标题二</h2>');
    });

    it("renders bold and inline code", () => {
      const html = simpleMarkdownToHtml("这是 **加粗** 和 `代码`");
      expect(html).toContain("<strong>加粗</strong>");
      expect(html).toContain('<code class="ft-inline-code">代码</code>');
    });

    it("renders code blocks with language", () => {
      const md = "```ts\nconst a = 1;\n```";
      const html = simpleMarkdownToHtml(md);
      expect(html).toContain('<pre class="ft-code-block"><code class="language-ts">const a = 1;</code></pre>');
    });

    it("renders todo checkboxes", () => {
      const md = "- [ ] 待办项 1\n- [x] 已完成项 2";
      const html = simpleMarkdownToHtml(md);
      expect(html).toContain('<div class="ft-todo-item"><input type="checkbox" disabled /> <span>待办项 1</span></div>');
      expect(html).toContain('<div class="ft-todo-item"><input type="checkbox" disabled checked/> <span>已完成项 2</span></div>');
    });
  });
});
