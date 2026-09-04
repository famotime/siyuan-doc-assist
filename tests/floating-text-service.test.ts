/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  loadFloatingTextConfig,
  saveFloatingTextConfig,
  resetFloatingTextConfigCache,
} from "@/services/floating-text/floating-text-storage";
import { FloatingTextService } from "@/services/floating-text/floating-text-service";
import * as kernel from "@/services/kernel";
import * as windowAdapter from "@/services/floating-text/floating-window-adapter";
import { showMessage } from "siyuan";
import { createOrganizeActionHandlers } from "@/plugin/action-runner-organize-handlers";

vi.mock("siyuan", () => ({
  showMessage: vi.fn(),
  Dialog: vi.fn(),
  getActiveEditor: vi.fn(),
}));

vi.mock("@/services/kernel", () => ({
  exportMdContent: vi.fn(),
  getDocMetaByID: vi.fn(),
  getBlockKramdowns: vi.fn(),
  appendBlock: vi.fn(),
  getChildBlocksByParentId: vi.fn(),
}));

vi.mock("@/services/floating-text/floating-window-adapter", () => ({
  openFloatingTextWindow: vi.fn(),
}));

describe("floating-text-storage & floating-text-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFloatingTextConfigCache();
  });

  describe("storage", () => {
    it("returns default config when storage is empty", () => {
      const mockStorage: Record<string, string> = {};
      const storageAdapter = {
        getItem: (k: string) => mockStorage[k] || null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = v;
        },
      };

      const cfg = loadFloatingTextConfig(storageAdapter);
      expect(cfg.opacity).toBe(0.85);
      expect(cfg.fontSize).toBe(15);
      expect(cfg.rememberSize).toBe(true);
    });

    it("saves and loads updated config", () => {
      const mockStorage: Record<string, string> = {};
      const storageAdapter = {
        getItem: (k: string) => mockStorage[k] || null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = v;
        },
      };

      saveFloatingTextConfig({ opacity: 0.6, fontSize: 20 }, storageAdapter);
      const loaded = loadFloatingTextConfig(storageAdapter);
      expect(loaded.opacity).toBe(0.6);
      expect(loaded.fontSize).toBe(20);
    });

    it("handles corrupted storage gracefully", () => {
      const storageAdapter = {
        getItem: () => "invalid json {{",
      };
      const loaded = loadFloatingTextConfig(storageAdapter);
      expect(loaded.opacity).toBe(0.85);
    });

    it("triggers plugin persistence handler on save", async () => {
      const { bindPluginFloatingPersistence } = await import(
        "@/services/floating-text/floating-text-storage"
      );
      const mockHandler = vi.fn();
      bindPluginFloatingPersistence(mockHandler);

      saveFloatingTextConfig({ opacity: 0.5, fontSize: 18 });
      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({ opacity: 0.5, fontSize: 18 })
      );

      bindPluginFloatingPersistence(null);
    });
  });

  describe("FloatingTextService", () => {
    it("warns when text is empty", async () => {
      const service = new FloatingTextService();
      await service.openFloatingText("   ");
      expect(showMessage).toHaveBeenCalledWith("没有可悬浮的文本内容", 4000, "info");
      expect(windowAdapter.openFloatingTextWindow).not.toHaveBeenCalled();
    });

    it("opens floating window when text is provided", async () => {
      const service = new FloatingTextService();
      await service.openFloatingText("hello world", "自定义标题");
      expect(windowAdapter.openFloatingTextWindow).toHaveBeenCalledWith({
        title: "自定义标题",
        text: "hello world",
      });
      expect(showMessage).toHaveBeenCalledWith("已开启桌面置顶悬浮窗", 3000, "info");
    });

    it("exports doc content and opens floating doc", async () => {
      vi.mocked(kernel.exportMdContent).mockResolvedValue({
        hPath: "/我的文档/测试页面",
        content: "# 测试内容\n\n正文段落",
      });
      vi.mocked(kernel.getDocMetaByID).mockResolvedValue({
        id: "doc-1",
        title: "测试页面",
        icon: "",
        box: "notebook-1",
      });

      const service = new FloatingTextService();
      await service.openFloatingDoc("doc-1");

      expect(kernel.exportMdContent).toHaveBeenCalledWith("doc-1", { addTitle: true });
      expect(windowAdapter.openFloatingTextWindow).toHaveBeenCalledWith({
        title: "测试页面",
        text: "# 测试内容\n\n正文段落",
      });
      expect(showMessage).toHaveBeenCalledWith("已将文档《测试页面》置顶悬浮", 3000, "info");
    });
  });

  describe("organize handler float-selected-text", () => {
    it("floats selected blocks when multiple blocks are selected", async () => {
      vi.mocked(kernel.getBlockKramdowns).mockResolvedValue([
        { id: "b1", kramdown: "第一段块内容" },
        { id: "b2", kramdown: "第二段块内容" },
      ]);
      const domRoot = document.createElement("div");
      const block1 = document.createElement("div");
      block1.setAttribute("data-node-id", "b1");
      block1.className = "protyle-wysiwyg--select";
      const block2 = document.createElement("div");
      block2.setAttribute("data-node-id", "b2");
      block2.className = "protyle-wysiwyg--select";
      domRoot.appendChild(block1);
      domRoot.appendChild(block2);

      const fakeProtyle = {
        wysiwyg: { element: domRoot },
      };

      const handlers = createOrganizeActionHandlers({
        askConfirmWithVisibleDialog: vi.fn(),
        ensureDocWritable: vi.fn(),
      });

      await handlers["float-selected-text"]("doc-1", fakeProtyle as any);

      expect(windowAdapter.openFloatingTextWindow).toHaveBeenCalledWith({
        title: "悬浮选中文本",
        text: "第一段块内容\n\n第二段块内容",
      });
    });

    it("falls back to full doc when neither text nor blocks are selected", async () => {
      vi.mocked(kernel.exportMdContent).mockResolvedValue({
        hPath: "/我的文档/测试页面",
        content: "# 全文内容",
      });
      vi.mocked(kernel.getDocMetaByID).mockResolvedValue({
        id: "doc-1",
        title: "测试页面",
        icon: "",
        box: "notebook-1",
      });

      const handlers = createOrganizeActionHandlers({
        askConfirmWithVisibleDialog: vi.fn(),
        ensureDocWritable: vi.fn(),
      });

      await handlers["float-selected-text"]("doc-1", undefined);

      expect(kernel.exportMdContent).toHaveBeenCalledWith("doc-1", { addTitle: true });
      expect(windowAdapter.openFloatingTextWindow).toHaveBeenCalledWith({
        title: "测试页面",
        text: "# 全文内容",
      });
    });
  });
});
