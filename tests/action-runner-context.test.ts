/** @vitest-environment jsdom */

import { describe, expect, test } from "vitest";
import {
  getExplicitlySelectedBlockIds,
  getSelectedBlockIds,
  getSelectedImageAssetPaths,
} from "@/plugin/action-runner-context";

describe("action-runner-context selection", () => {
  test("extracts block id and asset path from selected image DOM (.img--select)", () => {
    // 构造类似用户提供的真实 DOM
    const container = document.createElement("div");
    container.innerHTML = `
      <div data-node-id="20260606145504-vj2j63g" data-node-index="17" data-type="NodeParagraph" class="p" updated="20260621102909" data-editing="true">
        <div contenteditable="true" spellcheck="false">
          <span contenteditable="false" data-type="img" class="img img--select">
            <span> </span>
            <span>
              <span class="protyle-action protyle-icons"><span class="protyle-icon protyle-icon--only"><svg class="svg"></svg></span></span>
              <img src="assets/640_d9ef0ff395d8-20260221075849-sgdfm0j.png" data-src="assets/640_d9ef0ff395d8-20260221075849-sgdfm0j.png" loading="lazy">
              <span class="protyle-action__drag"></span>
              <span class="protyle-action__title"><span></span></span>
            </span>
            <span> </span>
          </span>
        </div>
        <div class="protyle-attr" contenteditable="false"></div>
      </div>
    `;

    const protyle = {
      wysiwyg: {
        element: container,
      },
    } as any;

    const blockIds = getSelectedBlockIds(protyle);
    expect(blockIds).toEqual(["20260606145504-vj2j63g"]);

    const explicitBlockIds = getExplicitlySelectedBlockIds(protyle);
    expect(explicitBlockIds).toEqual(["20260606145504-vj2j63g"]);

    const assetPaths = getSelectedImageAssetPaths(protyle);
    expect(assetPaths).toEqual(["/assets/640_d9ef0ff395d8-20260221075849-sgdfm0j.png"]);
  });

  test("returns empty lists when no element is selected", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div data-node-id="block-1" class="p">
        <div><img src="assets/a.png"></div>
      </div>
    `;
    const protyle = {
      wysiwyg: {
        element: container,
      },
    } as any;

    expect(getExplicitlySelectedBlockIds(protyle)).toEqual([]);
    expect(getSelectedImageAssetPaths(protyle)).toEqual([]);
  });
});
