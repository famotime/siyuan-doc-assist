import { describe, expect, it } from "vitest";
import { collapseExtraneousSpaces, removeEmojiFromText } from "@/core/emoji-cleanup-core";

describe("emoji-cleanup-core", () => {
  describe("removeEmojiFromText", () => {
    it("should return unchanged text when no emoji is present", () => {
      const text = "Hello world! 这是一个普通测试。123456";
      const res = removeEmojiFromText(text);
      expect(res.removedCount).toBe(0);
      expect(res.next).toBe(text);
    });

    it("should remove single standard emoji", () => {
      const text = "Hello 😀 world!";
      const res = removeEmojiFromText(text);
      expect(res.removedCount).toBe(1);
      expect(res.next).toBe("Hello world!");
    });

    it("should remove compound ZWJ emoji sequences", () => {
      // 👨‍👩‍👧‍👦 family sequence
      const text = "Family: 👨‍👩‍👧‍👦 united";
      const res = removeEmojiFromText(text);
      expect(res.removedCount).toBeGreaterThan(0);
      expect(res.next).toBe("Family: united");
    });

    it("should remove emoji with skin tone modifiers and clean space before punctuation", () => {
      const text = "Great job 👍🏽 and 👍🏿!";
      const res = removeEmojiFromText(text);
      expect(res.removedCount).toBe(2);
      expect(res.next).toBe("Great job and!");
    });

    it("should remove flag emoji", () => {
      const text = "China 🇨🇳 and US 🇺🇸";
      const res = removeEmojiFromText(text);
      expect(res.removedCount).toBe(2);
      expect(res.next).toBe("China and US");
    });

    it("should remove symbol pictographs (heart, fire, rocket, etc.)", () => {
      const text = "❤️ Rocket 🚀 Fire 🔥 Star ⭐";
      const res = removeEmojiFromText(text);
      expect(res.removedCount).toBe(4);
      expect(res.next).toBe("Rocket Fire Star");
    });

    it("should handle multiline text and collapse double spaces correctly", () => {
      const text = "Title 🚀\nLine 1: 💡 Idea\nLine 2: ✅ Done  👍";
      const res = removeEmojiFromText(text);
      expect(res.removedCount).toBe(4);
      expect(res.next).toBe("Title\nLine 1: Idea\nLine 2: Done");
    });

    it("should collapse spaces before punctuation when emoji before punctuation is removed", () => {
      const text = "测试一下 😀 ，再看这个 🚀 。";
      const res = removeEmojiFromText(text);
      expect(res.removedCount).toBe(2);
      expect(res.next).toBe("测试一下，再看这个。");
    });

    it("should strictly preserve nested list indentation when removing emojis", () => {
      const listMd = [
        "1. **双主题 8 组精调预设色盘**：",
        "",
        "   - 提供科技蓝、薄荷绿；",
        "   - 严格遵循 **WCAG AA** 规范。",
        "2. **Emoji 前缀胶囊药丸**：",
        "",
        "   - 支持为标签配置直观的 Emoji 前缀（如 `💡 #灵感#`、`📌 #待办#`、`🎯 #复盘#`）；",
        "   - 在正文编辑器中渲染为精致的高辨识度胶囊药丸。",
        "3. **零 Markdown 格式污染**：",
        "",
        "   - 全部样式通过动态 CSS 注入。",
      ].join("\n");

      const res = removeEmojiFromText(listMd);
      expect(res.removedCount).toBe(3);
      // The 3-space indentation before nested items must be preserved!
      expect(res.next).toContain("   - 支持为标签配置直观的 Emoji 前缀（如 `#灵感#`、`#待办#`、`#复盘#`）；");
      expect(res.next).toContain("   - 提供科技蓝、薄荷绿；");
      expect(res.next).toContain("1. **双主题 8 组精调预设色盘**：");
      expect(res.next).toContain("2. **Emoji 前缀胶囊药丸**：");
      expect(res.next).toContain("3. **零 Markdown 格式污染**：");
    });

    it("should strictly preserve Markdown table syntax and alignment row", () => {
      const tableMd = [
        "|维度|原生体验|🏷️ 标签管家|用户价值|",
        "| :-----| :-------------------| :------------| :-------------------|",
        "|**检索**|单标签搜索|**侧边抽屉流 🚀**|保持专注|",
      ].join("\n");

      const res = removeEmojiFromText(tableMd);
      expect(res.removedCount).toBe(2);
      expect(res.next).toContain("|维度|原生体验|标签管家|用户价值|");
      expect(res.next).toContain("| :-----| :-------------------| :------------| :-------------------|");
      expect(res.next).toContain("|**检索**|单标签搜索|**侧边抽屉流**|保持专注|");
    });
  });

  describe("collapseExtraneousSpaces", () => {
    it("should collapse consecutive spaces", () => {
      expect(collapseExtraneousSpaces("a   b    c")).toBe("a b c");
    });

    it("should handle empty lines and trim line ends", () => {
      expect(collapseExtraneousSpaces("   \n\n  word  ")).toBe("\n\nword");
    });

    it("should preserve leading spaces for list items and blockquotes", () => {
      expect(collapseExtraneousSpaces("   - item 1")).toBe("   - item 1");
      expect(collapseExtraneousSpaces("    * item 2")).toBe("    * item 2");
      expect(collapseExtraneousSpaces("  1. ordered item")).toBe("  1. ordered item");
      expect(collapseExtraneousSpaces("   > quoted text")).toBe("   > quoted text");
    });
  });
});

