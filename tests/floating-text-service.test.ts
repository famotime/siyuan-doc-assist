import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  loadFloatingTextConfig,
  saveFloatingTextConfig,
} from "@/services/floating-text/floating-text-storage";
import { FloatingTextService } from "@/services/floating-text/floating-text-service";
import * as kernel from "@/services/kernel";
import * as windowAdapter from "@/services/floating-text/floating-window-adapter";
import { showMessage } from "siyuan";

vi.mock("siyuan", () => ({
  showMessage: vi.fn(),
  Dialog: vi.fn(),
}));

vi.mock("@/services/kernel", () => ({
  exportMdContent: vi.fn(),
  getDocMetaByID: vi.fn(),
}));

vi.mock("@/services/floating-text/floating-window-adapter", () => ({
  openFloatingTextWindow: vi.fn(),
}));

describe("floating-text-storage & floating-text-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
