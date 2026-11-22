/** @vitest-environment jsdom */

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("siyuan", () => ({
  showMessage: vi.fn()
}));

vi.mock("@/services/kernel", () => ({
  exportMdContent: vi.fn(),
  getDocMetaByID: vi.fn()
}));

vi.mock("@/services/exporter", () => ({
  exportCurrentDocMarkdown: vi.fn(),
  exportDocAndChildDocsAsMarkdownZip: vi.fn(),
  exportDocAndChildKeyInfoAsZip: vi.fn(),
  exportDocIdsAsMarkdownZip: vi.fn()
}));

vi.mock("@/services/link-resolver", () => ({
  getBacklinkDocs: vi.fn(),
  getChildDocs: vi.fn(),
  getForwardLinkedDocIds: vi.fn()
}));

vi.mock("@/services/kernel-conf", () => ({
  getKeymap: vi.fn(),
  setKeymap: vi.fn(),
  mergeKeymap: vi.fn()
}));

describe("action-runner import-keymap cancel safety (SM-02)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("resolves cleanly when file input fires cancel event", async () => {
    const { createExportActionHandlers } = await import("@/plugin/action-runner-export-handlers");
    const handlers = createExportActionHandlers();

    const originalCreateElement = document.createElement.bind(document);
    let createdInput: HTMLInputElement | null = null;
    const createSpy = vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName.toLowerCase() === "input") {
        createdInput = el as HTMLInputElement;
        createdInput.click = () => {
          createdInput!.dispatchEvent(new Event("cancel"));
        };
      }
      return el;
    });

    try {
      await expect(handlers["import-keymap"]?.("doc-1")).resolves.toBeUndefined();
      expect(createdInput).not.toBeNull();
    } finally {
      createSpy.mockRestore();
    }
  });

  test("resolves via window focus fallback when cancel event is not supported", async () => {
    vi.useFakeTimers();
    const { createExportActionHandlers } = await import("@/plugin/action-runner-export-handlers");
    const handlers = createExportActionHandlers();

    const originalCreateElement = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName.toLowerCase() === "input") {
        (el as HTMLInputElement).click = () => {
          window.dispatchEvent(new Event("focus"));
        };
      }
      return el;
    });

    try {
      const pending = handlers["import-keymap"]?.("doc-1");
      await vi.advanceTimersByTimeAsync(350);
      await expect(pending).resolves.toBeUndefined();
    } finally {
      createSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
