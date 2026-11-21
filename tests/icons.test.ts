import fs from "node:fs";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { DOC_ASSIST_ICON_ID, DOC_ASSIST_ICON_SVG } from "@/icons";
import { KeyInfoController } from "@/plugin/key-info-controller";

describe("plugin icons", () => {
  test("doc assist icon id and svg match specification", () => {
    expect(DOC_ASSIST_ICON_ID).toBe("iconDocAssist");
    expect(DOC_ASSIST_ICON_SVG).toContain(`id="${DOC_ASSIST_ICON_ID}"`);
    expect(DOC_ASSIST_ICON_SVG).toContain('viewBox="0 0 16 16"');
    expect(DOC_ASSIST_ICON_SVG).toContain('stroke="currentColor"');
    expect(DOC_ASSIST_ICON_SVG).toContain('stroke-width="0.833"');
    expect(DOC_ASSIST_ICON_SVG).toContain('<rect x="1.75" y="2.5" width="12.5" height="11" rx="2"');
    expect(DOC_ASSIST_ICON_SVG).toContain('<line x1="7.5" y1="2.5" x2="7.5" y2="13.5"');
    expect(DOC_ASSIST_ICON_SVG).toContain('<line x1="4" y1="5.5" x2="5.25" y2="5.5"');
    expect(DOC_ASSIST_ICON_SVG).toContain('<line x1="4" y1="8.5" x2="5.25" y2="8.5"');
  });

  test("registerDock registers dock with DOC_ASSIST_ICON_ID", () => {
    const controller = new KeyInfoController({
      isMobile: () => false,
      getCurrentDocId: () => "doc-1",
      getCurrentProtyle: () => undefined,
      getKeyInfoFilter: () => ({
        bold: true,
        heading: true,
        link: true,
        remark: true
      }),
      setKeyInfoFilter: () => {},
      resolveDocId: () => "doc-1",
      runAction: vi.fn(),
      actions: () => [],
      getDocMenuRegistrationState: () => ({} as any),
      setAllDocMenuRegistration: () => {},
      setSingleDocMenuRegistration: () => {},
      setDocActionOrder: () => {},
      resetDocActionOrder: () => {},
      getDocFavoriteActionKeys: () => [],
      setDocActionFavorite: () => {},
      setDocFavoriteActionOrder: () => {},
      resolveCanvasPlugin: () => undefined
    });

    let dockConfig: any = null;
    controller.registerDock({
      addDock: (config: unknown) => {
        dockConfig = config;
      }
    });

    expect(dockConfig).not.toBeNull();
    expect(dockConfig.config.icon).toBe(DOC_ASSIST_ICON_ID);
    expect(dockConfig.config.title).toBe("文档助手");
  });

  test("icon.svg exists and matches user svg specification", () => {
    const iconSvgPath = path.resolve(__dirname, "../icon.svg");
    expect(fs.existsSync(iconSvgPath)).toBe(true);
    const content = fs.readFileSync(iconSvgPath, "utf-8");
    expect(content).toContain('viewBox="0 0 16 16"');
    expect(content).toContain('stroke="currentColor"');
    expect(content).toContain('stroke-width="0.833"');
    expect(content).toContain('<rect x="1.75" y="2.5" width="12.5" height="11" rx="2"');
    expect(content).toContain('<line x1="7.5" y1="2.5" x2="7.5" y2="13.5"');
  });
});
