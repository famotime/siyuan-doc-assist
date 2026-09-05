import { describe, expect, it } from "vitest";
import {
  calculateSteppedFontSize,
  escapeHtml,
  formatListItemMarkdown,
  hexToRgba,
  normalizeFloatingConfig,
  simpleMarkdownToHtml,
  stripKramdownBlockAttributes,
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

    it("renders unordered and ordered lists", () => {
      const md = "- 列表项 1\n* 列表项 2\n1. 有序项 1\n2. 有序项 2";
      const html = simpleMarkdownToHtml(md);
      expect(html).toContain('<ul class="ft-ul">');
      expect(html).toContain('<li class="ft-list-item">列表项 1</li>');
      expect(html).toContain('<li class="ft-list-item">列表项 2</li>');
      expect(html).toContain('</ul>');
      expect(html).toContain('<ol class="ft-ol">');
      expect(html).toContain('<li class="ft-list-item ft-list-item-ordered">有序项 1</li>');
      expect(html).toContain('<li class="ft-list-item ft-list-item-ordered">有序项 2</li>');
      expect(html).toContain('</ol>');
    });

    it("formats list item prefix correctly", () => {
      expect(formatListItemMarkdown("任务", "t")).toBe("- [ ] 任务");
      expect(formatListItemMarkdown("第一步", "o", 1)).toBe("1. 第一步");
      expect(formatListItemMarkdown("普通项", "u")).toBe("- 普通项");
      expect(formatListItemMarkdown("", "u")).toBe("");
    });
  });

  describe("stripKramdownBlockAttributes", () => {
    it("returns empty string on empty input", () => {
      expect(stripKramdownBlockAttributes("")).toBe("");
      expect(stripKramdownBlockAttributes("   ")).toBe("");
    });

    it("strips IAL from unordered list item (user example)", () => {
      const raw = '- {: id="20260903224427-3tm5cbq" updated="20260903224427"}项目地址：https://github.com/cloudflare/moltworker';
      const cleaned = stripKramdownBlockAttributes(raw);
      expect(cleaned).toBe("- 项目地址：https://github.com/cloudflare/moltworker");
    });

    it("strips standalone IAL lines", () => {
      const raw = '第一段文本\n{: id="20260903224427-p1" updated="20260903224427"}\n\n第二段文本';
      const cleaned = stripKramdownBlockAttributes(raw);
      expect(cleaned).toBe("第一段文本\n\n第二段文本");
    });

    it("strips IAL from headings", () => {
      const raw = '# 核心标题 {: id="20260903224427-h1"}\n## 次级标题\n{: id="20260903224427-h2"}';
      const cleaned = stripKramdownBlockAttributes(raw);
      expect(cleaned).toBe("# 核心标题\n## 次级标题");
    });

    it("strips IAL from ordered and task lists", () => {
      const raw = '1. {: id="20260903224427-o1"}第一步\n- [ ] {: id="20260903224427-t1"}待办事项';
      const cleaned = stripKramdownBlockAttributes(raw);
      expect(cleaned).toBe("1. 第一步\n- [ ] 待办事项");
    });

    it("strips IAL from blockquotes", () => {
      const raw = '> {: id="20260903224427-q1"}引用文字内容';
      const cleaned = stripKramdownBlockAttributes(raw);
      expect(cleaned).toBe("> 引用文字内容");
    });

    it("preserves code block content without stripping fake IAL inside", () => {
      const raw = '```markdown\n- {: id="code-example"}示例代码\n```';
      const cleaned = stripKramdownBlockAttributes(raw);
      expect(cleaned).toBe('```markdown\n- {: id="code-example"}示例代码\n```');
    });
  });

  describe("resolveFloatingCopyText", () => {
    it("returns selected text when valid selection exists", async () => {
      const { resolveFloatingCopyText } = await import("@/core/floating-text-core");
      const res = resolveFloatingCopyText("选中的局部片段", "这是完整的全文内容");
      expect(res.isSelected).toBe(true);
      expect(res.text).toBe("选中的局部片段");
    });

    it("falls back to full text when selection is empty or whitespace", async () => {
      const { resolveFloatingCopyText } = await import("@/core/floating-text-core");
      expect(resolveFloatingCopyText("", "完整内容")).toEqual({
        text: "完整内容",
        isSelected: false,
      });
      expect(resolveFloatingCopyText("   \n\t  ", "完整内容")).toEqual({
        text: "完整内容",
        isSelected: false,
      });
      expect(resolveFloatingCopyText(null, "完整内容")).toEqual({
        text: "完整内容",
        isSelected: false,
      });
      expect(resolveFloatingCopyText(undefined, "完整内容")).toEqual({
        text: "完整内容",
        isSelected: false,
      });
    });
  });

  describe("buildFloatingWindowHtml clipboard support", () => {
    it("generates html containing electron clipboard, getSelectedText and selection copy logic", async () => {
      const { buildFloatingWindowHtml } = await import("@/ui/floating-text/floating-window-template");
      const html = buildFloatingWindowHtml({
        title: "测试标题",
        text: "测试复制文本内容",
        config: DEFAULT_FLOATING_TEXT_CONFIG,
      });

      expect(html).toContain("electronClipboard");
      expect(html).toContain("fallbackExecCopy");
      expect(html).toContain("copyText");
      expect(html).toContain("getSelectedText");
      expect(html).toContain("hasSelection");
      expect(html).toContain("已复制选中内容");
      expect(html).toContain("已复制全部内容");
      expect(html).not.toContain("剪贴板不可用");
    });

    it("generates html with editable text view and dynamic markdown preview support", async () => {
      const { buildFloatingWindowHtml } = await import("@/ui/floating-text/floating-window-template");
      const html = buildFloatingWindowHtml({
        title: "可编辑测试",
        text: "# 可编辑初始文本",
        config: DEFAULT_FLOATING_TEXT_CONFIG,
      });

      expect(html).toContain('contenteditable="plaintext-only"');
      expect(html).toContain('data-placeholder="在此处编辑文本..."');
      expect(html).toContain("getCurrentText");
      expect(html).toContain("simpleMarkdownToHtml(getCurrentText())");
    });

    it("generates html with opacity labeled as 不透明度 and supports persistent config sync", async () => {
      const { buildFloatingWindowHtml } = await import("@/ui/floating-text/floating-window-template");
      const html = buildFloatingWindowHtml({
        title: "不透明度设置测试",
        text: "测试内容",
        config: { ...DEFAULT_FLOATING_TEXT_CONFIG, opacity: 0.75 },
      });

      // 验证抽屉文案为“不透明度”
      expect(html).toContain("<span>不透明度</span>");
      expect(html).not.toContain("<span>透明度</span>");

      // 验证持久化通信桥梁逻辑
      expect(html).toContain("__siyuan_doc_assist_floating_config");
      expect(html).toContain("siyuan-doc-assist-floating-config.json");
      expect(html).toContain("__saveDocAssistantFloatingConfig");
      expect(html).toContain("siyuan-doc-assist-save-floating-config");
      expect(html).toContain("siyuan-doc-assist-floating-channel");
      expect(html).toContain("opacityDebounceTimer");
      expect(html).toContain("shouldRememberSize");
    });

    it("injects targetHostWebContentsId into script when provided", async () => {
      const { buildFloatingWindowHtml } = await import("@/ui/floating-text/floating-window-template");
      const html = buildFloatingWindowHtml({
        title: "IPC目标测试",
        text: "测试内容",
        config: DEFAULT_FLOATING_TEXT_CONFIG,
        hostWebContentsId: 88,
      });

      expect(html).toContain("const targetHostWebContentsId = 88;");
      expect(html).toContain("siyuan-doc-assist-save-floating-config");
    });

    it("script content has valid javascript syntax", async () => {
      const { buildFloatingWindowHtml } = await import("@/ui/floating-text/floating-window-template");
      const complexText = '# 标题\n\n这是 "引号" 和 `代码` 以及换行\n```ts\nconst a = "hello\\nworld";\n```\n- [ ] 待办\n> 引用';
      const html = buildFloatingWindowHtml({
        title: "复杂语法检查 \"'<>",
        text: complexText,
        config: DEFAULT_FLOATING_TEXT_CONFIG,
      });
      const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
      expect(scriptMatch).toBeTruthy();
      const code = scriptMatch![1];
      const vm = await import("node:vm");
      expect(() => new vm.Script(code, { filename: "floating-script.js" })).not.toThrow();
    });
  });
});


