import { describe, expect, it } from "vitest";
import { buildFloatingWindowHtml } from "@/ui/floating-text/floating-window-template";
import { DEFAULT_FLOATING_TEXT_CONFIG, simpleMarkdownToHtml } from "@/core/floating-text-core";
import { MARKED_UMD_SOURCE } from "@/ui/floating-text/marked-source";

describe("floating-window-render", () => {
  describe("marked sandbox initialization and rendering", () => {
    it("successfully initializes marked in isolated sandbox without global leakage", () => {
      const sandboxGlobal: Record<string, any> = {};
      const dummyExports: Record<string, any> = {};
      const dummyModule = { exports: dummyExports };

      const initMarked = new Function(
        "exports",
        "module",
        "globalThis",
        MARKED_UMD_SOURCE
      );
      initMarked(dummyExports, dummyModule, sandboxGlobal);

      const markedInstance =
        dummyModule.exports.marked ||
        dummyModule.exports ||
        dummyExports.marked ||
        dummyExports;

      expect(markedInstance).toBeDefined();
      expect(typeof markedInstance.parse).toBe("function");

      sandboxGlobal.marked = markedInstance;
      expect(typeof sandboxGlobal.marked.parse).toBe("function");
    });

    it("renders complex Markdown containing GFM tables, tasks and code blocks via sandboxed marked", () => {
      const sandboxGlobal: Record<string, any> = {};
      const dummyExports: Record<string, any> = {};
      const dummyModule = { exports: dummyExports };

      const initMarked = new Function(
        "exports",
        "module",
        "globalThis",
        MARKED_UMD_SOURCE
      );
      initMarked(dummyExports, dummyModule, sandboxGlobal);
      const marked = dummyModule.exports.marked || dummyModule.exports;

      const markdownInput = [
        "# 测试标题",
        "这是普通段落，包含 **加粗** 和 `行内代码` 以及 ~~删除线~~。",
        "",
        "| 列1 | 列2 |",
        "| --- | --- |",
        "| 数据A | 数据B |",
        "",
        "- [ ] 待办事项 1",
        "- [x] 已完成事项 2",
        "",
        "---",
        "",
        "```typescript",
        "const num: number = 42;",
        "```",
      ].join("\n");

      const html = marked.parse(markdownInput, { gfm: true, breaks: true });

      // 验证标题
      expect(html).toContain("<h1>测试标题</h1>");
      // 验证 GFM 表格
      expect(html).toContain("<table>");
      expect(html).toContain("列1");
      expect(html).toContain("数据A");
      // 验证水平线
      expect(html).toContain("<hr>");
      // 验证代码块
      expect(html).toContain('<pre><code class="language-typescript">const num: number = 42;\n</code></pre>');
      // 验证待办列表
      expect(html).toContain('type="checkbox"');
    });
  });

  describe("buildFloatingWindowHtml template output", () => {
    it("embeds marked sandbox script in the generated HTML", () => {
      const html = buildFloatingWindowHtml({
        title: "测试悬浮",
        text: "# 初始内容",
        config: DEFAULT_FLOATING_TEXT_CONFIG,
        isDark: false,
      });

      // 包含沙箱注入标记
      expect(html).toContain("内置轻量安全沙箱 Marked 解析器");
      expect(html).toContain("initMarked");
      expect(html).toContain("globalObj.marked = m");
      // 包含视图容器
      expect(html).toContain('id="ft-text-view"');
      expect(html).toContain('id="ft-markdown-view"');
      // 包含规范化换行和 lastRenderedText
      expect(html).toContain("lastRenderedText");
      expect(html).toContain("stripKramdown");
    });

    it("runs scripts in HTML without errors and binds buttons", async () => {
      const { JSDOM, VirtualConsole } = await import("jsdom");
      const virtualConsole = new VirtualConsole();
      const errors: any[] = [];
      virtualConsole.on("error", (err) => errors.push(err));
      virtualConsole.on("jsdomError", (err) => errors.push(err));

      const html = buildFloatingWindowHtml({
        title: "测试悬浮",
        text: "# 初始内容",
        config: DEFAULT_FLOATING_TEXT_CONFIG,
        isDark: false,
      });

      const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
      for (let idx = 0; idx < scriptMatches.length; idx++) {
        const m = scriptMatches[idx];
        const lines = m[1].split("\n");
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i].trim();
          if (!l) continue;
          try {
            // 单独测试语句
            new Function(l);
          } catch (e: any) {
            if (e.message.includes("Invalid or unexpected token")) {
              throw new Error(`Script ${idx} line ${i + 1} has token error: ${e.message} --> "${lines[i]}"`);
            }
          }
        }
        try {
          new Function(m[1]);
        } catch (err: any) {
          throw new Error(`Script ${idx} overall error: ${err.message}`);
        }
      }

      const dom = new JSDOM(html, {
        runScripts: "dangerously",
        virtualConsole,
      });

      expect(errors).toEqual([]);
      const viewBtn = dom.window.document.getElementById("ft-btn-view");
      const settingsBtn = dom.window.document.getElementById("ft-btn-settings");
      const closeBtn = dom.window.document.getElementById("ft-btn-close");

      expect(viewBtn).not.toBeNull();
      expect(settingsBtn).not.toBeNull();
      expect(closeBtn).not.toBeNull();

      // 点击设置按钮应打开 popover
      const popover = dom.window.document.getElementById("ft-popover");
      expect(popover?.classList.contains("ft-popover-open")).toBe(false);
      settingsBtn?.click();
      expect(popover?.classList.contains("ft-popover-open")).toBe(true);

      // 点击视图切换按钮应切换 display
      const textView = dom.window.document.getElementById("ft-text-view");
      const mdView = dom.window.document.getElementById("ft-markdown-view");
      expect(textView?.style.display).toBe("block");
      expect(mdView?.style.display).toBe("none");

      // 模拟用户编辑文本后切换到预览
      if (textView) {
        textView.textContent = "# 新编辑标题\n\n| 表头1 | 表头2 |\n|---|---|\n| 数据1 | 数据2 |\n\n- [x] 完成任务";
      }
      viewBtn?.click();
      expect(textView?.style.display).toBe("none");
      expect(mdView?.style.display).toBe("block");

      const renderedHtml = mdView?.innerHTML || "";
      console.log("WINDOW MARKED:", typeof (dom.window as any).marked);
      console.log("RENDERED HTML:", renderedHtml);
      expect(renderedHtml).toContain("<h1>新编辑标题</h1>");
      expect(renderedHtml).toContain("<table>");
      expect(renderedHtml).toContain("数据1");
    });
  });

  describe("newline normalization and change detection logic", () => {
    it("treats \\r\\n and \\n as identical to prevent unnecessary re-rendering on Windows", () => {
      const originalText = "第一行\r\n第二行\r\n第三行";
      const currentTextFromDom = "第一行\n第二行\n第三行";

      const normCur = currentTextFromDom.replace(/\r\n/g, "\n");
      const normLast = originalText.replace(/\r\n/g, "\n");

      // 规范化后判定未被修改
      expect(normCur === normLast).toBe(true);

      const modifiedText = "第一行\n修改后的第二行\n第三行";
      const normModified = modifiedText.replace(/\r\n/g, "\n");
      expect(normModified === normLast).toBe(false);
    });
  });

  describe("enhanced simpleMarkdownToHtml fallback", () => {
    it("renders hr horizontal rules", () => {
      const md = "第一段\n\n---\n\n第二段";
      const html = simpleMarkdownToHtml(md);
      expect(html).toContain('<hr class="ft-hr" />');
    });

    it("renders mark highlight syntax", () => {
      const md = "这是 ==重要高亮== 内容";
      const html = simpleMarkdownToHtml(md);
      expect(html).toContain("<mark>重要高亮</mark>");
    });
  });
});
