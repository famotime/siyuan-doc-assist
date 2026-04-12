/** @vitest-environment jsdom */

import { afterEach, describe, expect, test } from "vitest";
import {
  destroyActionProcessingOverlay,
  hideActionProcessingOverlay,
  showActionProcessingOverlay,
} from "@/ui/action-processing-overlay";

const OVERLAY_ID = "doc-assistant-action-processing-overlay";
const VISIBLE_CLASS = "is-visible";

describe("action processing overlay", () => {
  afterEach(() => {
    destroyActionProcessingOverlay();
  });

  test("hides after one hide call even if show was called repeatedly for the same busy state", () => {
    showActionProcessingOverlay("文档处理中，请稍候...");
    showActionProcessingOverlay("文档处理中，请稍候...");

    hideActionProcessingOverlay();

    const overlay = document.getElementById(OVERLAY_ID);
    expect(overlay?.classList.contains(VISIBLE_CLASS)).toBe(false);
  });
});
