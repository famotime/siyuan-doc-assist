// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import {
  applyTextTransformToPartialSelection,
  applyTextTransformToSelectedBlocks,
  collectSelectedBlockElements,
  filterOutNestedSelectedBlockIds,
  findBlockElementById,
  resolveEditableForRange,
  resolveRangeBoundaryBlockId,
  transformTextNodesInElement

} from "@/core/selection-dom-cleanup-core";
import type { TextTransformResult } from "@/core/selection-dom-cleanup-core";

function countUpperTransform(source: string): TextTransformResult {
  const next = source.replace(/[abc]/g, "");
  return { next, changedCount: source.length - next.length };
}

function setupDom(): void {
  document.body.innerHTML = "";
}

describe("selection-dom-cleanup-core", () => {
  beforeEach(setupDom);

  describe("transformTextNodesInElement", () => {
    test("applies transform to every text node and returns total changed count", () => {
      const root = document.createElement("div");
      root.innerHTML = "<p>abc def</p><span>cab</span>six";
      const changed = transformTextNodesInElement(root, countUpperTransform);
      expect(changed).toBe(6);
      expect(root.querySelector("p")?.textContent).toBe(" def");
      expect(root.querySelector("span")?.textContent).toBe("");
      expect(root.textContent).toContain("six");
    });

    test("returns 0 when nothing matches and keeps nodes untouched", () => {
      const root = document.createElement("div");
      root.innerHTML = "<p>xyz</p>";
      expect(transformTextNodesInElement(root, countUpperTransform)).toBe(0);
      expect(root.querySelector("p")?.textContent).toBe("xyz");
    });

    test("aggregates counts across nested elements", () => {
      const root = document.createElement("div");
      root.innerHTML = "<div><div>aa</div>bb</div>cc";
      expect(transformTextNodesInElement(root, countUpperTransform)).toBe(6);
    });
  });

  describe("applyTextTransformToSelectedBlocks", () => {
    function createBlock(id: string, html: string): HTMLElement {
      const block = document.createElement("div");
      block.setAttribute("data-node-id", id);
      block.setAttribute("data-type", "NodeParagraph");
      block.innerHTML = html;
      return block;
    }

    function createRoot(...blocks: HTMLElement[]): HTMLElement {
      const root = document.createElement("div");
      for (const block of blocks) {
        root.appendChild(block);
      }
      return root;
    }

    test("cleans only matched blocks, counts them and dispatches input events", () => {
      const first = createBlock("b1", "<div contenteditable=\"true\">abc</div>");
      const second = createBlock("b2", "<div contenteditable=\"true\">nothing here</div>");
      const third = createBlock("b3", "<div contenteditable=\"true\">cab</div>");
      const root = createRoot(first, second, third);
      document.body.appendChild(root);

      let inputEventCount = 0;
      const listener = () => {
        inputEventCount += 1;
      };
      first.querySelector("div")!.addEventListener("input", listener);
      second.querySelector("div")!.addEventListener("input", listener);
      third.querySelector("div")!.addEventListener("input", listener);

      const result = applyTextTransformToSelectedBlocks(root, ["b1", "b2", "b3"], countUpperTransform);
      expect(result).toEqual({ changedBlockCount: 2, changedCount: 6 });
      expect(inputEventCount).toBe(2);
    });

    test("returns null when a selected block is missing", () => {
      const root = createRoot(createBlock("b1", "abc"));
      expect(applyTextTransformToSelectedBlocks(root, ["b1", "missing"], countUpperTransform)).toBeNull();
    });

    test("returns null when a selected block is a complex structural block", () => {
      const table = document.createElement("div");
      table.setAttribute("data-node-id", "t1");
      table.setAttribute("data-type", "NodeTable");
      table.innerHTML = "<table><tr><td>abc</td></tr></table>";
      const root = createRoot(table);
      expect(applyTextTransformToSelectedBlocks(root, ["t1"], countUpperTransform)).toBeNull();
    });

    test("returns null without ids or root", () => {
      expect(applyTextTransformToSelectedBlocks(undefined, ["b1"], countUpperTransform)).toBeNull();
      const root = createRoot(createBlock("b1", "abc"));
      expect(applyTextTransformToSelectedBlocks(root, [], countUpperTransform)).toBeNull();
    });

    test("collects selected block elements in order and returns null on missing or complex blocks", () => {
      const root = createRoot(createBlock("b1", "abc"), createBlock("b2", "a"));
      const blocks = collectSelectedBlockElements(root, ["b1", "b2"]);
      expect(blocks?.map((block) => block.getAttribute("data-node-id"))).toEqual(["b1", "b2"]);
      expect(collectSelectedBlockElements(root, ["b1", "missing"])).toBeNull();
      expect(collectSelectedBlockElements(undefined, ["b1"])).toBeNull();
    });

    test("falls back to the block element itself when no contenteditable child", () => {
      const block = createBlock("b1", "abc");
      const root = createRoot(block);
      document.body.appendChild(root);
      let inputEventCount = 0;
      block.addEventListener("input", () => {
        inputEventCount += 1;
      });
      const result = applyTextTransformToSelectedBlocks(root, ["b1"], countUpperTransform);
      expect(result).toEqual({ changedBlockCount: 1, changedCount: 3 });
      expect(inputEventCount).toBe(1);
    });
  });

  describe("applyTextTransformToPartialSelection", () => {
    // 生产结构为 wysiwyg 容器（root）内含多个块元素；root 传入骨架，块是其后代
    function createEditableDoc(html: string, blockId = "doc1"): { root: HTMLElement; block: HTMLElement } {
      const root = document.createElement("div");
      const block = document.createElement("div");
      block.setAttribute("data-node-id", blockId);
      block.setAttribute("data-type", "NodeParagraph");
      block.innerHTML = html;
      root.appendChild(block);
      document.body.appendChild(root);
      return { root, block };
    }

    function selectRange(block: HTMLElement, start: number, end: number): void {
      const textNode = block.querySelector("div")!.firstChild!;
      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, end);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    }

    test("replaces selected text inside a single block and clears selection", () => {
      const { root, block } = createEditableDoc('<div contenteditable="true">hello abc world</div>');
      selectRange(block, 6, 9);
      const result = applyTextTransformToPartialSelection(root, countUpperTransform);
      expect(result).toEqual({ handled: true, changedCount: 3 });
      expect(block.querySelector("div")?.textContent).toBe("hello  world");
      expect(window.getSelection()!.isCollapsed).toBe(true);
    });

    test("reports handled with zero changes for untouched selection", () => {
      const { root, block } = createEditableDoc('<div contenteditable="true">xyz</div>');
      selectRange(block, 0, 3);
      const result = applyTextTransformToPartialSelection(root, countUpperTransform);
      expect(result).toEqual({ handled: true, changedCount: 0 });
      expect(block.querySelector("div")?.textContent).toBe("xyz");
    });

    test("does not handle collapsed selections", () => {
      const { root, block } = createEditableDoc('<div contenteditable="true">abc</div>');
      selectRange(block, 1, 1);
      expect(applyTextTransformToPartialSelection(root, countUpperTransform)).toEqual({
        handled: false,
        changedCount: 0
      });
    });

    test("does not handle selections crossing two blocks", () => {
      const { block: first } = createEditableDoc('<div contenteditable="true">abc</div>', "first");
      const { block: second } = createEditableDoc('<div contenteditable="true">abc</div>', "second");
      first.parentElement!.appendChild(second.parentElement!.querySelector("[data-node-id='second']")!);
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(first.querySelector("div")!.firstChild!, 0);
      range.setEnd(second.querySelector("div")!.firstChild!, 3);
      selection.removeAllRanges();
      selection.addRange(range);
      expect(
        applyTextTransformToPartialSelection(first.parentElement!, countUpperTransform)
      ).toEqual({ handled: false, changedCount: 0 });
    });

    test("does not handle when selection is outside any block", () => {
      const root = document.createElement("div");
      const outside = document.createElement("div");
      outside.textContent = "abc";
      root.appendChild(outside);
      document.body.appendChild(root);
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(outside.firstChild!, 0);
      range.setEnd(outside.firstChild!, 3);
      selection.removeAllRanges();
      selection.addRange(range);
      expect(
        applyTextTransformToPartialSelection(root, countUpperTransform)
      ).toEqual({ handled: false, changedCount: 0 });
    });
  });

  describe("resolveRangeBoundaryBlockId", () => {
    test("resolves the block id of the container element", () => {
      const root = document.createElement("div");
      const block = document.createElement("div");
      block.setAttribute("data-node-id", "b1");
      root.appendChild(block);
      expect(resolveRangeBoundaryBlockId(root, block)).toBe("b1");
    });

    test("resolves through parent elements for text nodes", () => {
      const root = document.createElement("div");
      const block = document.createElement("div");
      block.setAttribute("data-node-id", "b2");
      block.textContent = "text";
      root.appendChild(block);
      expect(resolveRangeBoundaryBlockId(root, block.firstChild!)).toBe("b2");
    });

    test("returns empty string for nodes outside the root", () => {
      const root = document.createElement("div");
      const outside = document.createElement("div");
      outside.setAttribute("data-node-id", "outside");
      expect(resolveRangeBoundaryBlockId(root, outside)).toBe("");
    });
  });

  describe("filterOutNestedSelectedBlockIds", () => {
    test("keeps ids without nesting and passes through small sets", () => {
      expect(filterOutNestedSelectedBlockIds(undefined, ["a", "b"])).toEqual(["a", "b"]);
      expect(filterOutNestedSelectedBlockIds(document.createElement("div"), ["a"])).toEqual(["a"]);
    });

    test("removes ids whose ancestors are also selected", () => {
      const root = document.createElement("div");
      const parent = document.createElement("div");
      parent.setAttribute("data-node-id", "parent");
      const child = document.createElement("div");
      child.setAttribute("data-node-id", "child");
      parent.appendChild(child);
      root.appendChild(parent);
      expect(filterOutNestedSelectedBlockIds(root, ["child", "parent"])).toEqual(["parent"]);
    });
  });

  describe("resolveEditableForRange", () => {
    test("resolves the closest contenteditable ancestor of the range", () => {
      const block = document.createElement("div");
      const editable = document.createElement("div");
      editable.setAttribute("contenteditable", "true");
      editable.textContent = "abc";
      block.appendChild(editable);
      expect(resolveEditableForRange(document.createRange(), block)).toBe(editable);
    });

    test("resolves table cells for selections inside tables", () => {
      const block = document.createElement("div");
      const cell = document.createElement("td");
      cell.textContent = "abc";
      block.appendChild(cell);
      const range = document.createRange();
      range.setStart(cell.firstChild!, 0);
      expect(resolveEditableForRange(range, block)).toBe(cell);
    });

    test("falls back to the block element when nothing matches", () => {
      const block = document.createElement("div");
      block.textContent = "plain";
      const range = document.createRange();
      expect(resolveEditableForRange(range, block)).toBe(block);
    });
  });

  describe("findBlockElementById", () => {
    test("finds the first block with the given data-node-id", () => {
      const root = document.createElement("div");
      const block = document.createElement("div");
      block.setAttribute("data-node-id", "target");
      root.appendChild(block);
      expect(findBlockElementById(root, "target")).toBe(block);
      expect(findBlockElementById(root, "other")).toBeNull();
    });
  });
});
