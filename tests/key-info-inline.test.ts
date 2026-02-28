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
});
