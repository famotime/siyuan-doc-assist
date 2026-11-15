// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addFloatDocTreeMenuItem,
  addFloatSelectedTextBlockMenuItem,
  addFloatSelectedTextContentMenuItem,
  captureFloatingSelectionRange,
  isFloatSelectedTextHidden,
} from "@/plugin/plugin-lifecycle-menu";
import { extractFloatingMarkdownFromSelection } from "@/services/floating-text/floating-selection-helper";

vi.mock("@/services/floating-text/floating-selection-helper", () => ({
  extractFloatingMarkdownFromSelection: vi.fn(),
}));

const extractMock = extractFloatingMarkdownFromSelection as unknown as ReturnType<typeof vi.fn>;

type CapturedItem = { icon: string; label: string; click: () => void };

function createMenu() {
  const items: CapturedItem[] = [];
  return {
    items,
    addItem: (config: CapturedItem) => {
      items.push(config);
    },
  };
}

beforeEach(() => {
  extractMock.mockReset();
});

describe("isFloatSelectedTextHidden", () => {
  it("returns true when the action key is in the hidden set", () => {
    expect(isFloatSelectedTextHidden(new Set(["float-selected-text"]), undefined)).toBe(true);
  });

  it("returns true when the action is disabled by state", () => {
    expect(
      isFloatSelectedTextHidden(new Set<string>(), { "float-selected-text": false } as any)
    ).toBe(true);
  });

  it("returns false when visible and enabled", () => {
    expect(isFloatSelectedTextHidden(new Set<string>(), undefined)).toBe(false);
    expect(
      isFloatSelectedTextHidden(new Set<string>(), { "float-selected-text": true } as any)
    ).toBe(false);
  });
});

describe("addFloatSelectedTextContentMenuItem", () => {
  it("adds the menu item for a text range and uses extracted markdown on click", async () => {
    const menu = createMenu();
    const range = document.createRange();
    const element = document.createElement("div");
    element.textContent = "选中内容";
    range.selectNodeContents(element);

    const opened: string[] = [];
    extractMock.mockResolvedValue("提取后的 Markdown");

    const added = addFloatSelectedTextContentMenuItem({
      menu,
      protyle: undefined,
      range,
      openFloatingText: (text) => opened.push(text),
    });

    expect(added).toBe(true);
    expect(menu.items).toHaveLength(1);
    expect(menu.items[0].icon).toBe("iconPin");
    expect(menu.items[0].label).toBe("悬浮选中文本");

    await menu.items[0].click();
    expect(extractMock).toHaveBeenCalledTimes(1);
    expect(opened).toEqual(["提取后的 Markdown"]);
  });

  it("falls back to the raw selected text when extraction returns empty", async () => {
    const menu = createMenu();
    const element = document.createElement("div");
    element.textContent = "原始选中文本";
    const range = document.createRange();
    range.selectNodeContents(element);

    const opened: string[] = [];
    extractMock.mockResolvedValue("");

    addFloatSelectedTextContentMenuItem({
      menu,
      protyle: undefined,
      range,
      openFloatingText: (text) => opened.push(text),
    });
    await menu.items[0].click();
    expect(opened).toEqual(["原始选中文本"]);
  });

  it("does not add an item when the selection is blank", () => {
    const menu = createMenu();
    const element = document.createElement("div");
    element.textContent = "   ";
    const range = document.createRange();
    range.selectNodeContents(element);

    const added = addFloatSelectedTextContentMenuItem({
      menu,
      protyle: undefined,
      range,
      openFloatingText: () => undefined,
    });
    expect(added).toBe(false);
    expect(menu.items).toHaveLength(0);
  });

  it("clones the range so later DOM changes do not affect the captured selection", () => {
    const menu = createMenu();
    const element = document.createElement("div");
    element.textContent = "文本内容";
    const range = document.createRange();
    range.selectNodeContents(element);
    const cloneSpy = vi.spyOn(range, "cloneRange");

    addFloatSelectedTextContentMenuItem({
      menu,
      protyle: undefined,
      range,
      openFloatingText: () => undefined,
    });
    expect(cloneSpy).toHaveBeenCalledTimes(1);
  });
});

describe("captureFloatingSelectionRange", () => {
  it("prefers the protyle toolbar range clone", () => {
    const toolbarRange = document.createRange();
    const element = document.createElement("div");
    element.textContent = "工具栏选区";
    toolbarRange.selectNodeContents(element);
    const cloneSpy = vi.spyOn(toolbarRange, "cloneRange");
    const protyle = { toolbar: { range: toolbarRange } };
    const captured = captureFloatingSelectionRange(protyle as any);
    expect(captured).not.toBeNull();
    expect(captured!.toString()).toBe("工具栏选区");
    expect(cloneSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to the window selection range", () => {
    const element = document.createElement("div");
    element.textContent = "窗口选区";
    document.body.appendChild(element);
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    const captured = captureFloatingSelectionRange(undefined);
    expect(captured).not.toBeNull();
    expect(captured!.toString()).toBe("窗口选区");
    selection.removeAllRanges();
  });

  it("returns null when neither toolbar nor window selection exists", () => {
    window.getSelection()!.removeAllRanges();
    expect(captureFloatingSelectionRange(undefined)).toBeNull();
    expect(captureFloatingSelectionRange({} as any)).toBeNull();
  });
});

describe("addFloatSelectedTextBlockMenuItem", () => {
  it("adds the menu item and opens floating text when extraction succeeds", async () => {
    const menu = createMenu();
    const opened: string[] = [];
    const fallback = vi.fn();
    extractMock.mockResolvedValue("块提取结果");

    const added = addFloatSelectedTextBlockMenuItem({
      menu,
      protyle: undefined,
      blockElements: [document.createElement("div")],
      openFloatingText: (text) => opened.push(text),
      runFloatActionFallback: fallback,
    });

    expect(added).toBe(true);
    await menu.items[0].click();
    expect(opened).toEqual(["块提取结果"]);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("runs the action runner fallback when extraction returns empty", async () => {
    const menu = createMenu();
    const opened: string[] = [];
    const fallback = vi.fn();
    extractMock.mockResolvedValue("");

    addFloatSelectedTextBlockMenuItem({
      menu,
      protyle: undefined,
      blockElements: undefined,
      openFloatingText: (text) => opened.push(text),
      runFloatActionFallback: fallback,
    });
    await menu.items[0].click();
    expect(opened).toEqual([]);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("passes collected block elements to extraction", async () => {
    const menu = createMenu();
    const first = document.createElement("div");
    const second = document.createElement("div");
    extractMock.mockResolvedValue("x");

    addFloatSelectedTextBlockMenuItem({
      menu,
      protyle: undefined,
      blockElements: [first, second],
      openFloatingText: () => undefined,
      runFloatActionFallback: () => undefined,
    });
    await menu.items[0].click();
    const call = extractMock.mock.calls[0];
    expect(call[2]).toEqual([first, second]);
  });

  it("returns false without a menu", () => {
    expect(
      addFloatSelectedTextBlockMenuItem({
        menu: undefined,
        protyle: undefined,
        blockElements: undefined,
        openFloatingText: () => undefined,
        runFloatActionFallback: () => undefined,
      })
    ).toBe(false);
  });
});

describe("addFloatDocTreeMenuItem", () => {
  function createDocElement(docId: string | null): HTMLElement {
    const element = document.createElement("div");
    if (docId) {
      element.setAttribute("data-node-id", docId);
    }
    return element;
  }

  it("adds the menu item for doc tree elements and opens the doc on click", () => {
    const menu = createMenu();
    const opened: string[] = [];
    const elements = [createDocElement("20260101120000-abc")] as unknown as NodeListOf<HTMLElement>;

    const added = addFloatDocTreeMenuItem({
      menu,
      elements,
      eventType: "doc",
      openFloatingDoc: (docId) => opened.push(docId),
    });

    expect(added).toBe(true);
    expect(menu.items).toHaveLength(1);
    expect(menu.items[0].icon).toBe("iconPin");
    expect(menu.items[0].label).toBe("悬浮整篇文档");
    menu.items[0].click();
    expect(opened).toEqual(["20260101120000-abc"]);
  });

  it("rejects non-doc event types", () => {
    const menu = createMenu();
    const added = addFloatDocTreeMenuItem({
      menu,
      elements: [createDocElement("id")] as unknown as NodeListOf<HTMLElement>,
      eventType: "notebook",
      openFloatingDoc: () => undefined,
    });
    expect(added).toBe(false);
    expect(menu.items).toHaveLength(0);
  });

  it("rejects empty element lists and elements without node ids", () => {
    const menu = createMenu();
    expect(
      addFloatDocTreeMenuItem({ menu, elements: undefined, eventType: "doc", openFloatingDoc: () => undefined })
    ).toBe(false);
    expect(
      addFloatDocTreeMenuItem({
        menu,
        elements: [] as unknown as NodeListOf<HTMLElement>,
        eventType: "doc",
        openFloatingDoc: () => undefined,
      })
    ).toBe(false);
    expect(
      addFloatDocTreeMenuItem({
        menu,
        elements: [createDocElement(null)] as unknown as NodeListOf<HTMLElement>,
        eventType: "doc",
        openFloatingDoc: () => undefined,
      })
    ).toBe(false);
  });

  it("returns false without a menu", () => {
    expect(
      addFloatDocTreeMenuItem({
        menu: undefined,
        elements: [createDocElement("id")] as unknown as NodeListOf<HTMLElement>,
        eventType: "doc",
        openFloatingDoc: () => undefined,
      })
    ).toBe(false);
  });
});
