import { describe, expect, it } from "vitest";
import {
  buildBetterTitlesMessages,
  cleanCandidateTitle,
  MAX_FULL_DOC_TITLE_INPUT_LENGTH,
  parseBetterTitlesResponse,
  prepareBetterTitlesInputText,
} from "@/core/ai-better-titles-core";

describe("ai-better-titles-core", () => {
  describe("prepareBetterTitlesInputText", () => {
    it("不改变未超过上限的文本", () => {
      const text = "这是一篇普通的文档内容。";
      expect(prepareBetterTitlesInputText(text, true)).toBe(text);
      expect(prepareBetterTitlesInputText(text, false)).toBe(text);
    });

    it("当 isFullDoc 为 true 且超出上限时执行截断", () => {
      const longText = "a".repeat(MAX_FULL_DOC_TITLE_INPUT_LENGTH + 500);
      const result = prepareBetterTitlesInputText(longText, true);
      expect(result.length).toBe(MAX_FULL_DOC_TITLE_INPUT_LENGTH);
    });

    it("当 isFullDoc 为 false 时即使超出上限也不截断选中文本", () => {
      const longText = "a".repeat(MAX_FULL_DOC_TITLE_INPUT_LENGTH + 500);
      const result = prepareBetterTitlesInputText(longText, false);
      expect(result.length).toBe(MAX_FULL_DOC_TITLE_INPUT_LENGTH + 500);
    });
  });

  describe("cleanCandidateTitle", () => {
    it("去除首尾引号与序号前缀", () => {
      expect(cleanCandidateTitle('1. "为什么你必须立刻停用这个功能？"')).toBe(
        "为什么你必须立刻停用这个功能？"
      );
      expect(cleanCandidateTitle("【标题1】深度解析思源笔记核心机制")).toBe(
        "深度解析思源笔记核心机制"
      );
      expect(cleanCandidateTitle(" - “秘密终于被发现了！” ")).toBe(
        "秘密终于被发现了！"
      );
      expect(cleanCandidateTitle("1、系统架构与演进")).toBe("系统架构与演进");
    });
  });

  describe("buildBetterTitlesMessages", () => {
    it("正确组装包含当前标题和正文的 prompt", () => {
      const messages = buildBetterTitlesMessages({
        documentTitle: "原标题测试",
        content: "正文内容",
      });
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("system");
      expect(messages[0].content).toContain("爆款文章标题专家");
      expect(messages[0].content).toContain("catchy");
      expect(messages[0].content).toContain("summary");
      expect(messages[1].role).toBe("user");
      expect(messages[1].content).toContain("当前原标题：原标题测试");
      expect(messages[1].content).toContain("正文内容");
    });

    it("没有提供原标题时也能正常组装", () => {
      const messages = buildBetterTitlesMessages({
        content: "纯内容",
      });
      expect(messages[1].content).not.toContain("当前原标题");
      expect(messages[1].content).toContain("纯内容");
    });
  });

  describe("parseBetterTitlesResponse", () => {
    it("成功解析标准 JSON 输出", () => {
      const raw = JSON.stringify({
        catchy: [
          "震惊！90%的人都不知道的笔记技巧",
          "为什么说你的笔记管理正在拖垮效率？",
          "别再手打总结了，这个隐藏神器让你早下班",
        ],
        summary: [
          "思源笔记知识管理核心方法与最佳实践",
          "文档处理效率工具的高级进阶用法",
          "从零构建个人自动化第二大脑架构",
        ],
      });

      const parsed = parseBetterTitlesResponse(raw);
      expect(parsed.catchy).toHaveLength(3);
      expect(parsed.summary).toHaveLength(3);
      expect(parsed.catchy[0]).toBe("震惊！90%的人都不知道的笔记技巧");
      expect(parsed.summary[0]).toBe("思源笔记知识管理核心方法与最佳实践");
    });

    it("成功解析包裹在 Markdown 代码块中的 JSON", () => {
      const raw = `
以下为您生成的6个候选标题：
\`\`\`json
{
  "catchy": [
    "1. “震惊！千万别这样写代码”",
    "2. “藏在架构里的秘密武器”",
    "3. “彻底告别低效加班的终极指南”"
  ],
  "summary": [
    "1. 系统架构模式与最佳实践总结",
    "2. 高性能系统的演进与重构分析",
    "3. 现代工程团队核心效能提升策略"
  ]
}
\`\`\`
希望对您有所帮助！
      `;

      const parsed = parseBetterTitlesResponse(raw);
      expect(parsed.catchy).toHaveLength(3);
      expect(parsed.summary).toHaveLength(3);
      expect(parsed.catchy[0]).toBe("震惊！千万别这样写代码");
      expect(parsed.summary[0]).toBe("系统架构模式与最佳实践总结");
    });

    it("当 JSON 解析失败时通过文本分类回退解析", () => {
      const raw = `
### 吸引眼球的勾人标题：
1. 这个功能居然没人知道？
2. 彻底颠覆你的认知！
3. 为什么要立刻改变你的习惯？

### 平实概括的核心标题：
1. 知识库架构规范详解
2. 生产环境性能调优方案
3. 团队协作流程梳理指南
      `;

      const parsed = parseBetterTitlesResponse(raw);
      expect(parsed.catchy).toHaveLength(3);
      expect(parsed.summary).toHaveLength(3);
      expect(parsed.catchy[0]).toBe("这个功能居然没人知道？");
      expect(parsed.summary[0]).toBe("知识库架构规范详解");
    });

    it("当完全无分类标记时按数量均分回退", () => {
      const raw = `
1. 标题一
2. 标题二
3. 标题三
4. 标题四
5. 标题五
6. 标题六
      `;

      const parsed = parseBetterTitlesResponse(raw);
      expect(parsed.catchy).toHaveLength(3);
      expect(parsed.summary).toHaveLength(3);
      expect(parsed.catchy[0]).toBe("标题一");
      expect(parsed.summary[0]).toBe("标题四");
    });
  });
});
