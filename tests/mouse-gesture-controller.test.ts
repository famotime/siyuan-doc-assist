/** @vitest-environment jsdom */

import { beforeEach, describe, expect, test, vi } from "vitest";

import { DEFAULT_GESTURE_BINDINGS } from "@/core/gesture-recognition-core";
import { createMouseGestureController } from "@/plugin/mouse-gesture-controller";

const { showMessageMock, trailMocks } = vi.hoisted(() => ({
  showMessageMock: vi.fn(),
  trailMocks: {
    showGestureTrail: vi.fn(),
    drawGestureTrail: vi.fn(),
    hideGestureTrail: vi.fn(),
    destroyGestureTrail: vi.fn()
  }
}));

vi.mock("siyuan", () => ({
  showMessage: showMessageMock
}));

const {
  closeDocTabMock,
  fetchSiblingDocsMock,
  findProtyleByElementMock,
  openDocTabMock
} = vi.hoisted(() => ({
  closeDocTabMock: vi.fn(),
  fetchSiblingDocsMock: vi.fn(),
  findProtyleByElementMock: vi.fn(),
  openDocTabMock: vi.fn()
}));

vi.mock("@/services/doc-navigation", () => ({
  closeDocTab: closeDocTabMock,
  fetchSiblingDocs: fetchSiblingDocsMock,
  findProtyleByElement: findProtyleByElementMock,
  openDocTab: openDocTabMock
}));

vi.mock("@/ui/gesture-trail-overlay", () => ({
  showGestureTrail: trailMocks.showGestureTrail,
  drawGestureTrail: trailMocks.drawGestureTrail,
  hideGestureTrail: trailMocks.hideGestureTrail,
  destroyGestureTrail: trailMocks.destroyGestureTrail
}));

const drawnHints = () => trailMocks.drawGestureTrail.mock.calls.map((call) => String(call[1]));

function dispatchMouse(
  type: string,
  options: { x: number; y: number; button?: number; target?: HTMLElement }
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: options.button ?? 0,
    clientX: options.x,
    clientY: options.y
  });
  (options.target ?? document).dispatchEvent(event);
  return event;
}

describe("mouse gesture controller", () => {
  let editorArea: HTMLElement;
  let elsewhere: HTMLElement;
  let fakeProtyle: { block: { rootID: string }; model: { parent: { close: ReturnType<typeof vi.fn> } } };
  let enabled = true;

  const createBoundController = () => {
    const controller = createMouseGestureController({
      getApp: () => ({ app: true }),
      isEnabled: () => enabled,
      getBindings: () => ({ ...DEFAULT_GESTURE_BINDINGS })
    });
    controller.bind();
    return controller;
  };

  beforeEach(() => {
    showMessageMock.mockReset();
    trailMocks.showGestureTrail.mockReset();
    trailMocks.drawGestureTrail.mockReset();
    trailMocks.hideGestureTrail.mockReset();
    trailMocks.destroyGestureTrail.mockReset();
    closeDocTabMock.mockReset();
    fetchSiblingDocsMock.mockReset();
    findProtyleByElementMock.mockReset();
    openDocTabMock.mockReset();
    openDocTabMock.mockResolvedValue(undefined);
    closeDocTabMock.mockReturnValue(true);
    enabled = true;

    document.body.innerHTML = "";
    editorArea = document.createElement("div");
    editorArea.className = "protyle";
    const inner = document.createElement("div");
    inner.className = "protyle-content";
    editorArea.appendChild(inner);
    document.body.appendChild(editorArea);

    elsewhere = document.createElement("div");
    elsewhere.className = "layout-tab-bar";
    document.body.appendChild(elsewhere);

    fakeProtyle = {
      block: { rootID: "doc-1" },
      model: { parent: { close: vi.fn() } }
    };
    findProtyleByElementMock.mockImplementation(
      (target: HTMLElement | null) => (target?.closest(".protyle") ? fakeProtyle : undefined)
    );
  });

  test("right-drag left inside the editor switches to the previous sibling doc (moving style)", async () => {
    fetchSiblingDocsMock.mockResolvedValue([
      { id: "doc-a", name: "A" },
      { id: "doc-1", name: "B" }
    ]);

    const controller = createBoundController();
    dispatchMouse("mousedown", { x: 300, y: 300, button: 2, target: editorArea.firstElementChild as HTMLElement });
    dispatchMouse("mousemove", { x: 200, y: 302, button: 2, target: editorArea });
    dispatchMouse("mouseup", { x: 190, y: 302, button: 2, target: editorArea });

    await vi.waitFor(() => expect(openDocTabMock).toHaveBeenCalled());
    expect(openDocTabMock).toHaveBeenCalledWith(expect.anything(), "doc-a");
    expect(closeDocTabMock).toHaveBeenCalledWith(fakeProtyle);
    expect(showMessageMock).toHaveBeenCalledWith("已切换到《A》", 3500);
    // 划动过程中的轨迹提示应包含命中的动作名称
    expect(drawnHints()).toContain("← 切换上一个文档");
    controller.destroy();
  });

  test("wraps from the first doc back to the last one with a toast", async () => {
    fakeProtyle.block.rootID = "doc-a";
    fetchSiblingDocsMock.mockResolvedValue([
      { id: "doc-a", name: "A" },
      { id: "doc-b", name: "B" },
      { id: "doc-c", name: "C" }
    ]);

    const controller = createBoundController();
    dispatchMouse("mousedown", { x: 300, y: 300, button: 2, target: editorArea.firstElementChild as HTMLElement });
    dispatchMouse("mousemove", { x: 200, y: 300, button: 2, target: editorArea });
    dispatchMouse("mouseup", { x: 190, y: 300, button: 2, target: editorArea });

    await vi.waitFor(() => expect(openDocTabMock).toHaveBeenCalled());
    expect(openDocTabMock).toHaveBeenCalledWith(expect.anything(), "doc-c");
    expect(showMessageMock).toHaveBeenCalledWith(
      "已循环：从第一个文档切换回最后一个文档",
      4000
    );
    controller.destroy();
  });

  test("down-right gesture closes the current doc tab without confirmation", async () => {
    const controller = createBoundController();
    dispatchMouse("mousedown", { x: 300, y: 300, button: 2, target: editorArea.firstElementChild as HTMLElement });
    dispatchMouse("mousemove", { x: 300, y: 360, button: 2, target: editorArea });
    dispatchMouse("mousemove", { x: 360, y: 365, button: 2, target: editorArea });
    dispatchMouse("mouseup", { x: 370, y: 366, button: 2, target: editorArea });

    await vi.waitFor(() => expect(closeDocTabMock).toHaveBeenCalled());
    expect(openDocTabMock).not.toHaveBeenCalled();
    expect(showMessageMock).toHaveBeenCalledWith("已关闭当前文档标签", 3500);
    // ↓→ 划动过程中提示应带上动作名称
    expect(drawnHints()).toContain("↓→ 关闭当前文档");
    controller.destroy();
  });

  test("toasts when the current doc has no siblings", async () => {
    fetchSiblingDocsMock.mockResolvedValue([{ id: "doc-1" }]);

    const controller = createBoundController();
    dispatchMouse("mousedown", { x: 300, y: 300, button: 2, target: editorArea.firstElementChild as HTMLElement });
    dispatchMouse("mousemove", { x: 200, y: 300, button: 2, target: editorArea });
    dispatchMouse("mouseup", { x: 190, y: 300, button: 2, target: editorArea });

    await vi.waitFor(() => expect(showMessageMock).toHaveBeenCalled());
    expect(openDocTabMock).not.toHaveBeenCalled();
    expect(showMessageMock).toHaveBeenCalledWith("当前文档没有同级文档", 3500, "info");
    controller.destroy();
  });

  test("ignores gestures when disabled and outside the editor area", () => {
    enabled = false;
    const controller = createBoundController();
    dispatchMouse("mousedown", { x: 300, y: 300, button: 2, target: editorArea.firstElementChild as HTMLElement });
    dispatchMouse("mousemove", { x: 200, y: 300, button: 2, target: editorArea });
    dispatchMouse("mouseup", { x: 190, y: 300, button: 2, target: editorArea });
    expect(openDocTabMock).not.toHaveBeenCalled();
    expect(closeDocTabMock).not.toHaveBeenCalled();
    controller.destroy();

    // 编辑区外（如标签栏）不触发
    enabled = true;
    const controller2 = createMouseGestureController({
      getApp: () => ({}),
      isEnabled: () => enabled,
      getBindings: () => ({ ...DEFAULT_GESTURE_BINDINGS })
    });
    controller2.bind();
    dispatchMouse("mousedown", { x: 300, y: 300, button: 2, target: elsewhere });
    dispatchMouse("mousemove", { x: 200, y: 300, button: 2, target: elsewhere });
    dispatchMouse("mouseup", { x: 190, y: 300, button: 2, target: elsewhere });
    expect(openDocTabMock).not.toHaveBeenCalled();
    controller2.destroy();
  });

  test("plain right-click keeps the native context menu; a recognized stroke suppresses it", () => {
    const controller = createBoundController();

    // 普通右键点击（未划动）：不抑制原生菜单
    dispatchMouse("mousedown", { x: 300, y: 300, button: 2, target: editorArea.firstElementChild as HTMLElement });
    dispatchMouse("mouseup", { x: 300, y: 300, button: 2, target: editorArea });
    const plainMenu = dispatchMouse("contextmenu", { x: 300, y: 300, button: 2, target: editorArea });
    expect(plainMenu.defaultPrevented).toBe(false);

    // 划动手势后：抑制原生菜单
    dispatchMouse("mousedown", { x: 300, y: 300, button: 2, target: editorArea.firstElementChild as HTMLElement });
    dispatchMouse("mousemove", { x: 200, y: 300, button: 2, target: editorArea });
    dispatchMouse("mouseup", { x: 190, y: 300, button: 2, target: editorArea });
    const gestureMenu = dispatchMouse("contextmenu", { x: 190, y: 300, button: 2, target: editorArea });
    expect(gestureMenu.defaultPrevented).toBe(true);
    controller.destroy();
  });
});
