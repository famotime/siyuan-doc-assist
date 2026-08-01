// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  findSelectFromCurrentToEndBlockIds,
  findSelectFromStartToCurrentBlockIds,
} from "@/core/markdown-cleanup-core";
import {
  applyBlockSelectionInDom,
  ensureRangeBlocksLoadedInDom,
  isBlockOrAncestorInTargetSet,
  RangeSelectionObserverManager,
} from "@/plugin/action-runner-select-range-handlers";

describe("select block range core logic", () => {
  const mockBlocks = [
    { id: "block-1" },
    { id: "block-2" },
    { id: "block-3" },
    { id: "block-4" },
    { id: "block-5" },
  ];

  describe("findSelectFromStartToCurrentBlockIds", () => {
    it("returns empty result when currentBlockId is empty", () => {
      const res = findSelectFromStartToCurrentBlockIds(mockBlocks, "");
      expect(res.selectedIds).toEqual([]);
      expect(res.selectedCount).toBe(0);
    });

    it("returns empty result when currentBlockId is not in blocks", () => {
      const res = findSelectFromStartToCurrentBlockIds(mockBlocks, "non-existent");
      expect(res.selectedIds).toEqual([]);
      expect(res.selectedCount).toBe(0);
    });

    it("selects only first block when currentBlockId is the first block", () => {
      const res = findSelectFromStartToCurrentBlockIds(mockBlocks, "block-1");
      expect(res.selectedIds).toEqual(["block-1"]);
      expect(res.selectedCount).toBe(1);
    });

    it("selects from start to middle block", () => {
      const res = findSelectFromStartToCurrentBlockIds(mockBlocks, "block-3");
      expect(res.selectedIds).toEqual(["block-1", "block-2", "block-3"]);
      expect(res.selectedCount).toBe(3);
    });

    it("selects all blocks when currentBlockId is the last block", () => {
      const res = findSelectFromStartToCurrentBlockIds(mockBlocks, "block-5");
      expect(res.selectedIds).toEqual(["block-1", "block-2", "block-3", "block-4", "block-5"]);
      expect(res.selectedCount).toBe(5);
    });
  });

  describe("findSelectFromCurrentToEndBlockIds", () => {
    it("returns empty result when currentBlockId is empty", () => {
      const res = findSelectFromCurrentToEndBlockIds(mockBlocks, "");
      expect(res.selectedIds).toEqual([]);
      expect(res.selectedCount).toBe(0);
    });

    it("returns empty result when currentBlockId is not in blocks", () => {
      const res = findSelectFromCurrentToEndBlockIds(mockBlocks, "non-existent");
      expect(res.selectedIds).toEqual([]);
      expect(res.selectedCount).toBe(0);
    });

    it("selects all blocks when currentBlockId is the first block", () => {
      const res = findSelectFromCurrentToEndBlockIds(mockBlocks, "block-1");
      expect(res.selectedIds).toEqual(["block-1", "block-2", "block-3", "block-4", "block-5"]);
      expect(res.selectedCount).toBe(5);
    });

    it("selects from middle block to end", () => {
      const res = findSelectFromCurrentToEndBlockIds(mockBlocks, "block-3");
      expect(res.selectedIds).toEqual(["block-3", "block-4", "block-5"]);
      expect(res.selectedCount).toBe(3);
    });

    it("selects only last block when currentBlockId is the last block", () => {
      const res = findSelectFromCurrentToEndBlockIds(mockBlocks, "block-5");
      expect(res.selectedIds).toEqual(["block-5"]);
      expect(res.selectedCount).toBe(1);
    });
  });

  describe("DOM selection application and dynamic loading helper", () => {
    it("applies protyle-wysiwyg--select class to matching target DOM elements", () => {
      const container = document.createElement("div");
      container.innerHTML = `
        <div data-node-id="b1" class="p"></div>
        <div data-node-id="b2" class="p"></div>
        <div data-node-id="b3" class="p"></div>
      `;
      const selectedCount = applyBlockSelectionInDom(container, ["b1", "b2"]);
      expect(selectedCount).toBe(2);

      const b1 = container.querySelector('[data-node-id="b1"]');
      const b2 = container.querySelector('[data-node-id="b2"]');
      const b3 = container.querySelector('[data-node-id="b3"]');
      expect(b1?.classList.contains("protyle-wysiwyg--select")).toBe(true);
      expect(b2?.classList.contains("protyle-wysiwyg--select")).toBe(true);
      expect(b3?.classList.contains("protyle-wysiwyg--select")).toBe(false);
    });

    it("correctly selects all nested sub-blocks and paragraphs when container block is targeted", () => {
      const container = document.createElement("div");
      container.innerHTML = `
        <div data-node-id="list-1" class="list">
          <div data-node-id="li-1" class="li">
            <div data-node-id="p-inside-li" class="p">Text</div>
          </div>
        </div>
        <div data-node-id="p-outside" class="p">Outside</div>
      `;

      const targetSet = new Set(["list-1"]);
      const pInside = container.querySelector('[data-node-id="p-inside-li"]') as HTMLElement;
      const pOutside = container.querySelector('[data-node-id="p-outside"]') as HTMLElement;

      expect(isBlockOrAncestorInTargetSet(pInside, targetSet)).toBe(true);
      expect(isBlockOrAncestorInTargetSet(pOutside, targetSet)).toBe(false);

      applyBlockSelectionInDom(container, ["list-1"]);
      const listElem = container.querySelector('[data-node-id="list-1"]');
      const liElem = container.querySelector('[data-node-id="li-1"]');
      expect(listElem?.classList.contains("protyle-wysiwyg--select")).toBe(true);
      expect(liElem?.classList.contains("protyle-wysiwyg--select")).toBe(true);
      expect(pInside.classList.contains("protyle-wysiwyg--select")).toBe(true);
      expect(pOutside.classList.contains("protyle-wysiwyg--select")).toBe(false);
    });

    it("ensureRangeBlocksLoadedInDom triggers scroll and confirms boundary block loading", async () => {
      const scrollParent = document.createElement("div");
      scrollParent.className = "protyle-content";
      const root = document.createElement("div");
      root.className = "protyle-wysiwyg";
      root.innerHTML = `<div data-node-id="b1" class="p"></div>`;
      scrollParent.appendChild(root);

      let scrollCount = 0;
      scrollParent.addEventListener("scroll", () => {
        scrollCount++;
        // Simulate multi-step chunk loading
        if (scrollCount >= 2 && !root.querySelector('[data-node-id="b3"]')) {
          const b2 = document.createElement("div");
          b2.setAttribute("data-node-id", "b2");
          b2.className = "p";
          root.appendChild(b2);

          const b3 = document.createElement("div");
          b3.setAttribute("data-node-id", "b3");
          b3.className = "p";
          root.appendChild(b3);
        }
      });

      const count = await ensureRangeBlocksLoadedInDom(root, ["b1", "b2", "b3"], "to-end", 10, 10);
      expect(scrollCount).toBeGreaterThanOrEqual(2);
      expect(count).toBe(3);
      expect(root.querySelector('[data-node-id="b3"]')?.classList.contains("protyle-wysiwyg--select")).toBe(true);
    });

    it("RangeSelectionObserverManager maintains active target set and handles activation/deactivation", () => {
      const manager = new RangeSelectionObserverManager();
      const scrollParent = document.createElement("div");
      scrollParent.className = "protyle-content";
      const root = document.createElement("div");
      root.className = "protyle-wysiwyg";
      root.innerHTML = `<div data-node-id="b1" class="p"></div><div data-node-id="b2" class="p"></div>`;
      scrollParent.appendChild(root);

      manager.activate(root, ["b1"]);
      expect(manager.getActiveTargetSet().has("b1")).toBe(true);
      expect(root.querySelector('[data-node-id="b1"]')?.classList.contains("protyle-wysiwyg--select")).toBe(true);
      expect(root.querySelector('[data-node-id="b2"]')?.classList.contains("protyle-wysiwyg--select")).toBe(false);

      manager.deactivate();
      expect(manager.getActiveTargetSet().size).toBe(0);
    });
  });
});
