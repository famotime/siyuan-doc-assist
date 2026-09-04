// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { extractFloatingMarkdownFromSelection } from "@/services/floating-text/floating-selection-helper";
import * as kernel from "@/services/kernel";
import * as actionRunnerContext from "@/plugin/action-runner-context";

describe("floating-selection-helper", () => {
  it("prioritizes block selection when selectedBlockIds exist", async () => {
    vi.spyOn(actionRunnerContext, "getSelectedBlockIds").mockReturnValue(["block-1", "block-2"]);
    vi.spyOn(kernel, "getBlockKramdowns").mockResolvedValue([
      { id: "block-1", kramdown: '- {: id="block-1"}列表项 1' },
      { id: "block-2", kramdown: '- {: id="block-2"}列表项 2' },
    ]);

    const result = await extractFloatingMarkdownFromSelection(undefined);
    expect(result).toBe("- 列表项 1\n\n- 列表项 2");
    vi.restoreAllMocks();
  });

  it("returns plain text when range selection is outside list items", async () => {
    vi.spyOn(actionRunnerContext, "getSelectedBlockIds").mockReturnValue([]);

    const mockRange = {
      toString: () => "普通划选文本",
      cloneRange: () => mockRange,
      startContainer: document.createTextNode("普通划选文本"),
      endContainer: document.createTextNode("普通划选文本"),
    } as any;

    const mockProtyle = {
      toolbar: {
        range: mockRange,
      },
    } as any;

    const result = await extractFloatingMarkdownFromSelection(mockProtyle);
    expect(result).toBe("普通划选文本");
    vi.restoreAllMocks();
  });

  it("extracts multi-item list markdown when selection spans across list items", async () => {
    vi.spyOn(actionRunnerContext, "getSelectedBlockIds").mockReturnValue([]);

    // 构造包含两个列表项的 DOM 树
    const listEl = document.createElement("div");
    listEl.setAttribute("data-type", "NodeList");
    listEl.setAttribute("data-subtype", "u");

    const li1 = document.createElement("div");
    li1.setAttribute("data-type", "NodeListItem");
    li1.setAttribute("data-node-id", "li-1");
    const textNode1 = document.createTextNode("第一项文本");
    li1.appendChild(textNode1);

    const li2 = document.createElement("div");
    li2.setAttribute("data-type", "NodeListItem");
    li2.setAttribute("data-node-id", "li-2");
    const textNode2 = document.createTextNode("第二项文本");
    li2.appendChild(textNode2);

    listEl.appendChild(li1);
    listEl.appendChild(li2);
    document.body.appendChild(listEl);

    const mockRange = {
      toString: () => "第一项文本\n第二项文本",
      cloneRange: () => mockRange,
      startContainer: textNode1,
      endContainer: textNode2,
    } as any;

    const mockProtyle = {
      toolbar: {
        range: mockRange,
      },
    } as any;

    vi.spyOn(kernel, "getBlockKramdowns").mockResolvedValue([
      { id: "li-1", kramdown: '- {: id="li-1"}第一项文本' },
      { id: "li-2", kramdown: '- {: id="li-2"}第二项文本' },
    ]);

    const result = await extractFloatingMarkdownFromSelection(mockProtyle);
    expect(result).toBe("- 第一项文本\n- 第二项文本");

    document.body.removeChild(listEl);
    vi.restoreAllMocks();
  });

  it("extracts single list item markdown when selection covers the list item", async () => {
    vi.spyOn(actionRunnerContext, "getSelectedBlockIds").mockReturnValue([]);

    const listEl = document.createElement("div");
    listEl.setAttribute("data-type", "NodeList");
    listEl.setAttribute("data-subtype", "u");

    const li = document.createElement("div");
    li.setAttribute("data-type", "NodeListItem");
    li.setAttribute("data-node-id", "single-li");
    const textNode = document.createTextNode("单条列表内容");
    li.appendChild(textNode);
    listEl.appendChild(li);
    document.body.appendChild(listEl);

    const mockRange = {
      toString: () => "单条列表内容",
      cloneRange: () => mockRange,
      startContainer: textNode,
      endContainer: textNode,
    } as any;

    const mockProtyle = {
      toolbar: {
        range: mockRange,
      },
    } as any;

    vi.spyOn(kernel, "getBlockKramdowns").mockResolvedValue([
      { id: "single-li", kramdown: '- {: id="single-li"}单条列表内容' },
    ]);

    const result = await extractFloatingMarkdownFromSelection(mockProtyle);
    expect(result).toBe("- 单条列表内容");

    document.body.removeChild(listEl);
    vi.restoreAllMocks();
  });

  it("falls back to formatting list item prefix if getBlockKramdowns fails", async () => {
    vi.spyOn(actionRunnerContext, "getSelectedBlockIds").mockReturnValue([]);

    const listEl = document.createElement("div");
    listEl.setAttribute("data-type", "NodeList");
    listEl.setAttribute("data-subtype", "t"); // 待办列表

    const li = document.createElement("div");
    li.setAttribute("data-type", "NodeListItem");
    li.setAttribute("data-node-id", "todo-li");
    const textNode = document.createTextNode("买牛奶");
    li.appendChild(textNode);
    listEl.appendChild(li);
    document.body.appendChild(listEl);

    const mockRange = {
      toString: () => "买牛奶",
      cloneRange: () => mockRange,
      startContainer: textNode,
      endContainer: textNode,
    } as any;

    const mockProtyle = {
      toolbar: {
        range: mockRange,
      },
    } as any;

    vi.spyOn(kernel, "getBlockKramdowns").mockRejectedValue(new Error("API Error"));

    const result = await extractFloatingMarkdownFromSelection(mockProtyle);
    expect(result).toBe("- [ ] 买牛奶");

    document.body.removeChild(listEl);
    vi.restoreAllMocks();
  });
});
