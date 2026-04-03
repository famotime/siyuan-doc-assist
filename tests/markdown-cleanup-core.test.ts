import { describe, expect, test } from "vitest";
import {
  cleanupAiOutputArtifactsInMarkdown,
  removeStrikethroughMarkedContentFromMarkdown,
  removeExtraBlankLinesFromMarkdown,
  removeTrailingWhitespaceFromDom,
  removeTrailingWhitespaceFromMarkdown,
} from "@/core/markdown-cleanup-core";

describe("markdown-cleanup-core", () => {
  test("collapses consecutive blank lines into one", () => {
    const input = "a\n\n\nb\n\n\n\nc";
    const result = removeExtraBlankLinesFromMarkdown(input);
    expect(result.markdown).toBe("a\n\nb\n\nc");
    expect(result.removedLines).toBe(3);
  });

  test("keeps single blank lines between paragraphs", () => {
    const input = "a\n\nb\n\nc";
    const result = removeExtraBlankLinesFromMarkdown(input);
    expect(result.markdown).toBe(input);
    expect(result.removedLines).toBe(0);
  });

  test("preserves blank lines inside fenced code blocks", () => {
    const input = "a\n\n```\nline1\n\nline2\n```\n\n\nb";
    const result = removeExtraBlankLinesFromMarkdown(input);
    expect(result.markdown).toBe("a\n\n```\nline1\n\nline2\n```\n\nb");
    expect(result.removedLines).toBe(1);
  });

  test("treats whitespace-only lines as blank", () => {
    const input = "a\n \n\nb";
    const result = removeExtraBlankLinesFromMarkdown(input);
    expect(result.markdown).toBe("a\n\nb");
    expect(result.removedLines).toBe(1);
  });

  test("treats zero-width and non-breaking spaces as blank", () => {
    const input = `a\n\u200B\n\u00A0\n\nb`;
    const result = removeExtraBlankLinesFromMarkdown(input);
    expect(result.markdown).toBe("a\n\nb");
    expect(result.removedLines).toBe(2);
  });

  test("removes trailing spaces and tabs on each line", () => {
    const input = "a  \n\tb\t \n c\t\t";
    const result = removeTrailingWhitespaceFromMarkdown(input);
    expect(result.markdown).toBe("a\n\tb\n c");
    expect(result.changedLines).toBe(3);
    expect(result.removedChars).toBe(6);
  });

  test("keeps content when no trailing whitespace exists", () => {
    const input = "a\n b\n\tc";
    const result = removeTrailingWhitespaceFromMarkdown(input);
    expect(result.markdown).toBe(input);
    expect(result.changedLines).toBe(0);
    expect(result.removedChars).toBe(0);
  });

  test("treats blank lines with only spaces/tabs as changed lines", () => {
    const input = "a\n \t \n\t\nb";
    const result = removeTrailingWhitespaceFromMarkdown(input);
    expect(result.markdown).toBe("a\n\n\nb");
    expect(result.changedLines).toBe(2);
    expect(result.removedChars).toBe(4);
  });

  test("removes trailing whitespace spans persisted as white-space:pre ial", () => {
    const input = `a\t\t{: style="white-space:pre"}\nline  \t{: style="white-space:pre"}\nend`;
    const result = removeTrailingWhitespaceFromMarkdown(input);
    expect(result.markdown).toBe("a\nline\nend");
    expect(result.changedLines).toBe(2);
    expect(result.removedChars).toBe(5);
  });

  test("removes trailing white-space:pre spans even when block ial follows", () => {
    const input = `a\t{: style="white-space: pre;"}{: id="blk1"}\nend`;
    const result = removeTrailingWhitespaceFromMarkdown(input);
    expect(result.markdown).toBe(`a{: id="blk1"}\nend`);
    expect(result.changedLines).toBe(1);
    expect(result.removedChars).toBe(1);
  });

  test("removes trailing white-space:pre ial markers when whitespace token is elided", () => {
    const input = `text{: style="white-space:pre"}\n{: style="white-space: pre;"}{: id="blk1"}\nend`;
    const result = removeTrailingWhitespaceFromMarkdown(input);
    expect(result.markdown).toBe(`text\n{: id="blk1"}\nend`);
    expect(result.changedLines).toBe(2);
    expect(result.removedChars).toBe(0);
  });

  test("removes trailing unicode spaces represented by white-space:pre ial", () => {
    const input = `line\u3000{: style="white-space:pre"}\ntext\u00A0{: style="white-space: pre;"}\nend`;
    const result = removeTrailingWhitespaceFromMarkdown(input);
    expect(result.markdown).toBe("line\ntext\nend");
    expect(result.changedLines).toBe(2);
    expect(result.removedChars).toBe(2);
  });

  test("removes trailing white-space:pre span plus ial generated in markdown", () => {
    const input = 'text<span data-type="text" style="white-space:pre">\t\t </span>{: style="white-space:pre"}';
    const result = removeTrailingWhitespaceFromMarkdown(input);
    expect(result.markdown).toBe("text");
    expect(result.changedLines).toBe(1);
    expect(result.removedChars).toBe(3);
  });

  test("removes trailing white-space:pre span plus ial when block ial follows", () => {
    const input =
      'text<span data-type="text" style="white-space: pre;">\t</span>{: style="white-space:pre"}{: id="blk1"}';
    const result = removeTrailingWhitespaceFromMarkdown(input);
    expect(result.markdown).toBe('text{: id="blk1"}');
    expect(result.changedLines).toBe(1);
    expect(result.removedChars).toBe(1);
  });

  test("removes trailing span+ial pattern from real-world mixed CJK line", () => {
    const input =
      '拉屎肯定            放假；阿里可             <span data-type="text" style="white-space:pre">\t\t   </span>{: style="white-space:pre"}';
    const result = removeTrailingWhitespaceFromMarkdown(input);
    expect(result.markdown).toBe("拉屎肯定            放假；阿里可");
    expect(result.changedLines).toBe(1);
    expect(result.removedChars).toBe(18);
  });

  test("keeps middle span+ial and removes only trailing span+ial", () => {
    const input =
      '塑料袋凯<span data-type="text" style="white-space:pre">\t\t\t\t</span>{: style="white-space:pre"}撒减肥<span data-type="text" style="white-space:pre">\t\t</span>{: style="white-space:pre"}';
    const result = removeTrailingWhitespaceFromMarkdown(input);
    expect(result.markdown).toBe(
      '塑料袋凯<span data-type="text" style="white-space:pre">\t\t\t\t</span>{: style="white-space:pre"}撒减肥'
    );
    expect(result.changedLines).toBe(1);
    expect(result.removedChars).toBe(2);
  });

  test("removes trailing whitespace inside contenteditable dom without touching inline-memo", () => {
    const input =
      '<div data-node-id="a" data-type="NodeParagraph" class="p"><div contenteditable="true" spellcheck="false">原文<span data-type="inline-memo" data-inline-memo-content="备注内容">注</span>   </div><div class="protyle-attr" contenteditable="false"></div></div>';
    const result = removeTrailingWhitespaceFromDom(input);
    expect(result.dom).toBe(
      '<div data-node-id="a" data-type="NodeParagraph" class="p"><div contenteditable="true" spellcheck="false">原文<span data-type="inline-memo" data-inline-memo-content="备注内容">注</span></div><div class="protyle-attr" contenteditable="false"></div></div>'
    );
    expect(result.changedLines).toBe(1);
    expect(result.removedChars).toBe(3);
  });

  test("keeps dom unchanged when there is no trailing whitespace", () => {
    const input =
      '<div data-node-id="a" data-type="NodeParagraph" class="p"><div contenteditable="true" spellcheck="false">原文<span data-type="inline-memo" data-inline-memo-content="备注内容">注</span></div><div class="protyle-attr" contenteditable="false"></div></div>';
    const result = removeTrailingWhitespaceFromDom(input);
    expect(result.dom).toBe(input);
    expect(result.changedLines).toBe(0);
    expect(result.removedChars).toBe(0);
  });

  test("cleans sup, ^^ and trailing internet links while preserving siyuan links", () => {
    const input = [
      "段落内容 <sup>1</sup> ^^ [ref](https://example.com/a)",
      "| col1 | col2 [官网](https://example.com) |",
      "保留思源链接 [Doc](siyuan://blocks/20260101101010-abcdef1)",
    ].join("\n");

    const result = cleanupAiOutputArtifactsInMarkdown(input);

    expect(result).toEqual({
      markdown: [
        "段落内容",
        "| col1 | col2 |",
        "保留思源链接 [Doc](siyuan://blocks/20260101101010-abcdef1)",
      ].join("\n"),
      removedSupCount: 1,
      removedCaretCount: 1,
      removedInternetLinkCount: 2,
      removedCount: 4,
    });
  });

  test("removes wrapped markdown internet links with surrounding spaces/zero-width chars", () => {
    const input = [
      `段落内容 \u200B [[name](https://www.notes.com/xxxxx)] \u200B`,
      `| col1 | [[官网](https://example.com/path)] |`,
      "保留思源链接 [Doc](siyuan://blocks/20260101101010-abcdef1)",
    ].join("\n");

    const result = cleanupAiOutputArtifactsInMarkdown(input);

    expect(result).toEqual({
      markdown: [
        "段落内容",
        "| col1 | |",
        "保留思源链接 [Doc](siyuan://blocks/20260101101010-abcdef1)",
      ].join("\n"),
      removedSupCount: 0,
      removedCaretCount: 0,
      removedInternetLinkCount: 2,
      removedCount: 2,
    });
  });

  test("keeps markdown unchanged when no ai artifact exists", () => {
    const input = [
      "正文 [文档](siyuan://blocks/20260101101010-abcdef1)",
      "| a | b |",
    ].join("\n");

    const result = cleanupAiOutputArtifactsInMarkdown(input);

    expect(result).toEqual({
      markdown: input,
      removedSupCount: 0,
      removedCaretCount: 0,
      removedInternetLinkCount: 0,
      removedCount: 0,
    });
  });

  test("applies ai cleanup rules in stable order and remains idempotent", () => {
    const input = "正文^^ <sup>1</sup> [A](https://example.com/a) https://example.com/b";

    const first = cleanupAiOutputArtifactsInMarkdown(input);
    expect(first).toEqual({
      markdown: "正文",
      removedSupCount: 1,
      removedCaretCount: 1,
      removedInternetLinkCount: 2,
      removedCount: 4,
    });

    const second = cleanupAiOutputArtifactsInMarkdown(first.markdown);
    expect(second).toEqual({
      markdown: "正文",
      removedSupCount: 0,
      removedCaretCount: 0,
      removedInternetLinkCount: 0,
      removedCount: 0,
    });
  });

  test("removes markdown strikethrough-marked content and keeps surrounding text", () => {
    const input = [
      "保留前文 ~~删除这里~~ 保留后文",
      "- 列表 ~~去掉~~ 项",
      "未处理文本",
    ].join("\n");

    const result = removeStrikethroughMarkedContentFromMarkdown(input);

    expect(result).toEqual({
      markdown: [
        "保留前文  保留后文",
        "- 列表  项",
        "未处理文本",
      ].join("\n"),
      removedCount: 2,
    });
  });

  test("keeps markdown unchanged when no strikethrough content exists", () => {
    const input = "正常内容\n没有删除线";

    const result = removeStrikethroughMarkedContentFromMarkdown(input);

    expect(result).toEqual({
      markdown: input,
      removedCount: 0,
    });
  });
});
