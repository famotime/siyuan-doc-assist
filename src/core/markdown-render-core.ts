import { marked } from "marked";

export interface MarkdownRenderOptions {
  /** 可选注入的 Lute 实例 */
  lute?: any;
}

/**
 * 将 Markdown 文本渲染为标准的 HTML
 * 优先调用思源官方的 Lute 引擎（WASM），保证与思源内部渲染 100% 一致；
 * 在非思源环境、离线或测试等无 Lute 环境下，平滑回退到轻量标准 GFM 解析器 marked。
 */
export function renderMarkdownToHtml(
  markdown: string,
  options?: MarkdownRenderOptions
): string {
  if (!markdown || typeof markdown !== "string") {
    return "";
  }

  // 1. 优先使用传入的 Lute 实例或 window.Lute 全局对象
  try {
    let lute = options?.lute;
    if (!lute && typeof window !== "undefined" && (window as any).Lute) {
      if (typeof (window as any).Lute.New === "function") {
        lute = (window as any).Lute.New();
      }
    }
    if (lute && typeof lute.MarkdownStr === "function") {
      const result = lute.MarkdownStr("", markdown);
      if (typeof result === "string" && result.trim()) {
        return result;
      }
    }
  } catch (err) {
    console.warn("[DocAssistant] Lute MarkdownStr failed, fallback to marked:", err);
  }

  // 2. 回退使用 marked 解析标准 Markdown / GFM
  try {
    const html = marked.parse(markdown, {
      gfm: true,
      breaks: true,
      async: false,
    });
    return typeof html === "string" ? html : String(html || "");
  } catch (err) {
    console.warn("[DocAssistant] marked parse failed:", err);
    return markdown;
  }
}
