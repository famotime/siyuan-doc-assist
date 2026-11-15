/** @vitest-environment jsdom */

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createKeyInfoNavigation

} from "@/plugin/key-info-navigation";
import type { KeyInfoNavigationItem } from "@/plugin/key-info-navigation";

function item(blockId: string): KeyInfoNavigationItem {
  return {
    id: `item-${blockId}`,
    type: "bold",
    text: blockId,
    raw: blockId,
    blockId,
    blockSort: 0,
    order: 0
  };
}

describe("key-info navigation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("scrolls to in-doc block and flashes it after scroll settles", () => {
    vi.useFakeTimers();
    const root = document.createElement("div");
    const target = document.createElement("div");
    target.dataset.nodeId = "block-1";
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;
    target.getBoundingClientRect = () => ({
      top: 200,
      height: 40,
      bottom: 240,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
    root.appendChild(target);
    Object.defineProperty(window, "innerHeight", { value: 480, configurable: true });
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      return window.setTimeout(() => cb(performance.now()), 16) as unknown as number;
    });

    const navigation = createKeyInfoNavigation();
    navigation.handleItemClick(item("block-1"), () => ({ wysiwyg: { element: root } }) as any);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });

    vi.advanceTimersByTime(220);

    expect(target.classList.contains("doc-assistant-keyinfo__flash")).toBe(true);
    raf.mockRestore();
    vi.useRealTimers();
  });

  test("falls back to protocol open when block is missing from current editor", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const navigation = createKeyInfoNavigation();

    navigation.handleItemClick(item("block-2"), () => ({ wysiwyg: { element: document.createElement("div") } }) as any);

    expect(openSpy).toHaveBeenCalledWith("siyuan://blocks/block-2");
  });

  test("throttles duplicate protocol opens for the same block", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const nowSpy = vi.spyOn(performance, "now");
    nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1200).mockReturnValueOnce(1900);

    const navigation = createKeyInfoNavigation();
    const resolve = () => undefined;

    navigation.handleItemClick(item("block-3"), resolve);
    navigation.handleItemClick(item("block-3"), resolve);
    navigation.handleItemClick(item("block-3"), resolve);

    expect(openSpy).toHaveBeenCalledTimes(2);
  });
});
