// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { extractInlineFromDom } from "@/services/key-info-inline";
import { resolveSpanFormatType } from "@/services/key-info-model";

describe("key-info inline extraction", () => {
  test("ignores superscript/subscript span types for highlight mapping", () => {
    expect(resolveSpanFormatType("textmark")).toBe("highlight");
    expect(resolveSpanFormatType("textmark sup")).toBeNull();
    expect(resolveSpanFormatType("textmark sub")).toBeNull();
  });

  test("does not treat link span types as highlight unless explicit formatting exists", () => {
    expect(resolveSpanFormatType("a textmark")).toBeNull();
    expect(resolveSpanFormatType("a text")).toBeNull();
    expect(resolveSpanFormatType("a strong")).toBe("bold");
    expect(resolveSpanFormatType("a mark")).toBe("highlight");
  });

  test("maps underline span types and dom nodes to underline key info", () => {
    expect(resolveSpanFormatType("u")).toBe("underline");
    expect(resolveSpanFormatType("a u")).toBe("underline");

    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="p-1">
        <u>下划一</u>
        <span data-type="u">下划二</span>
      </div>
    `;
    const items = extractInlineFromDom(
      { wysiwyg: { element: root } } as any,
      new Map([
        ["doc-1", 0],
        ["p-1", 1],
      ]),
      "doc-1"
    );

    expect(
      items.filter((item) => item.type === "underline").map((item) => item.text)
    ).toEqual(["下划一", "下划二"]);
  });

  test("ignores superscript/subscript nodes in dom highlight extraction", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="p-1">
        <span data-type="text" data-subtype="sup">1</span>
        <span data-type="textmark" data-subtype="sub">2</span>
        <span data-type="textmark">正常高亮</span>
      </div>
    `;
    const items = extractInlineFromDom(
      { wysiwyg: { element: root } } as any,
      new Map([
        ["doc-1", 0],
        ["p-1", 1],
      ]),
      "doc-1"
    );

    const highlightTexts = items
      .filter((item) => item.type === "highlight")
      .map((item) => item.text);
    expect(highlightTexts).toEqual(["正常高亮"]);
  });

  test("ignores generic text spans inside links but keeps explicit highlight text", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="p-1">
        <span data-type="a" data-href="zotero://open-pdf/library/items/6T2NM4W3?page=22&amp;annotation=ME7EFWUJ">
          <span data-type="text">&amp;annotation=ME7EFWUJ)</span>
        </span>
        <mark><span data-type="a" data-href="zotero://open-pdf/library/items/6T2NM4W3?page=22&amp;annotation=ME7EFWUJ">pdf</span></mark>
      </div>
    `;
    const items = extractInlineFromDom(
      { wysiwyg: { element: root } } as any,
      new Map([
        ["doc-1", 0],
        ["p-1", 1],
      ]),
      "doc-1"
    );

    expect(items.some((item) => item.text.includes("annotation="))).toBe(false);
    expect(items.some((item) => item.type === "highlight" && item.text === "pdf")).toBe(true);
  });

  test("maps generic text spans to highlight when they carry font color or background highlighting", () => {
    expect(resolveSpanFormatType("text")).toBeNull();
    expect(
      resolveSpanFormatType("text", 'style="background-color: var(--b3-font-background8);"')
    ).toBe("highlight");
    expect(
      resolveSpanFormatType("text", 'style="color: var(--b3-font-color8);"')
    ).toBe("highlight");
  });

  test("excludes strikethrough, inline code, and inline math from dom highlight extraction", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="p-1">
        <span data-type="text" data-subtype="s">删除线文本</span>
        <span data-type="text" data-subtype="code">Hello,world!</span>
        <span data-type="text" data-subtype="inline-math">E = mc^2</span>
        <span data-type="text" style="background-color: var(--b3-font-background8);">背景高亮</span>
        <span data-type="textmark">正常高亮</span>
      </div>
    `;
    const items = extractInlineFromDom(
      { wysiwyg: { element: root } } as any,
      new Map([
        ["doc-1", 0],
        ["p-1", 1],
      ]),
      "doc-1"
    );

    const highlightTexts = items
      .filter((item) => item.type === "highlight")
      .map((item) => item.text);

    expect(highlightTexts).toEqual(["背景高亮", "正常高亮"]);
    expect(items.some((item) => item.text === "删除线文本")).toBe(false);
    expect(items.some((item) => item.text === "Hello,world!")).toBe(false);
    expect(items.some((item) => item.text === "E = mc^2")).toBe(false);
  });

  test("keeps font-color text spans in original dom order", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="p-1">
        默认字体颜色 1，
        <span data-type="text" style="color: var(--b3-font-color1);">字体颜色 2</span>，
        <span data-type="text" style="color: var(--b3-font-color2);">字体颜色 3</span>，
        <span data-type="text" style="color: var(--b3-font-color3);">字体颜色 4</span>，
        <span data-type="text" style="color: var(--b3-font-color4);">字体颜色 5</span>
      </div>
    `;
    const items = extractInlineFromDom(
      { wysiwyg: { element: root } } as any,
      new Map([
        ["doc-1", 0],
        ["p-1", 1],
      ]),
      "doc-1"
    );

    expect(
      items.filter((item) => item.type === "highlight").map((item) => item.text)
    ).toEqual(["字体颜色 2", "字体颜色 3", "字体颜色 4", "字体颜色 5"]);
  });

  test("treats whole block font or background color styling as one highlight item", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="p-1" style="color: var(--b3-font-color8);">
        <div contenteditable="true">
          一系列的「对话录」就是柏拉图一生思考的结晶。阅读柏拉图和阅读莎士比亚（39）一样，是在阅读一位艺术家。
        </div>
      </div>
      <div data-node-id="p-2" style="background-color: var(--b3-font-background8);">
        <div contenteditable="true">另一整段背景高亮文本。</div>
      </div>
    `;
    const items = extractInlineFromDom(
      { wysiwyg: { element: root } } as any,
      new Map([
        ["doc-1", 0],
        ["p-1", 1],
        ["p-2", 2],
      ]),
      "doc-1"
    );

    const highlightTexts = items.filter((item) => item.type === "highlight").map((item) => item.text);
    expect(highlightTexts).toContain(
      "一系列的「对话录」就是柏拉图一生思考的结晶。阅读柏拉图和阅读莎士比亚（39）一样，是在阅读一位艺术家。"
    );
    expect(highlightTexts).toContain("另一整段背景高亮文本。");
  });
});
