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
  });

  describe("collapseExtraneousSpaces", () => {
    it("should collapse consecutive spaces", () => {
      expect(collapseExtraneousSpaces("a   b    c")).toBe("a b c");
    });

    it("should handle empty lines and trim line ends", () => {
      expect(collapseExtraneousSpaces("   \n\n  word  ")).toBe("\n\nword");
    });
  });
});
