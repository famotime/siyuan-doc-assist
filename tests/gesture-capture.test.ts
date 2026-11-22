/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createGestureCapture } from "@/ui/gesture-capture";

describe("gesture capture trail throttling (audit low-risk)", () => {
  let moveCalls: number;
  let lastMoveState: { points: Array<{ x: number; y: number }> } | null;
  let rafCallback: (() => void) | null;

  function dispatchMouse(type: string, x: number, y: number, button = 2) {
    document.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button,
      clientX: x,
      clientY: y
    }));
  }

  beforeEach(() => {
    moveCalls = 0;
    lastMoveState = null;
    rafCallback = null;
    // 用确定性桩替换 jsdom 的 rAF，测试手动驱动帧
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
      rafCallback = cb;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {
      rafCallback = null;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function createCaptured() {
    return createGestureCapture({
      shouldHandle: () => true,
      onStrokeMove: (state) => {
        moveCalls += 1;
        lastMoveState = state;
      }
    });
  }

  function fireFrame() {
    const cb = rafCallback;
    rafCallback = null;
    cb?.();
  }

  test("coalesces a burst of mousemoves into one trail update per frame", () => {
    const capture = createCaptured();
    capture.bind();
    dispatchMouse("mousedown", 0, 0);

    for (let i = 1; i <= 5; i += 1) {
      dispatchMouse("mousemove", i * 10, 0);
    }
    // 帧未到来前不触发重绘
    expect(moveCalls).toBe(0);

    fireFrame();
    expect(moveCalls).toBe(1);
    expect(lastMoveState?.points.length).toBe(2);

    // 同一帧内的后续 move 等下一帧
    dispatchMouse("mousemove", 100, 0);
    expect(moveCalls).toBe(1);
    fireFrame();
    expect(moveCalls).toBe(2);
  });

  test("caps trail points so redraw cost stays bounded", () => {
    const capture = createCaptured();
    capture.bind();
    dispatchMouse("mousedown", 0, 0);

    // 每次移动后立即触发一帧，让每个采样点都入列
    for (let i = 1; i <= 1500; i += 1) {
      dispatchMouse("mousemove", i, 0);
      fireFrame();
    }

    expect(lastMoveState?.points.length).toBe(600);
  });

  test("final stroke state includes the last pending point", () => {
    let endState: { points: Array<{ x: number; y: number }>; moved: boolean } | null = null;
    const capture = createGestureCapture({
      shouldHandle: () => true,
      onStrokeEnd: (state) => {
        endState = state;
      }
    });
    capture.bind();
    dispatchMouse("mousedown", 0, 0);
    dispatchMouse("mousemove", 500, 0);
    fireFrame();
    dispatchMouse("mousemove", 600, 0);
    dispatchMouse("mouseup", 600, 0);

    expect(endState?.moved).toBe(true);
    expect(endState?.points.at(-1)).toEqual({ x: 600, y: 0 });
  });

  test("unbind mid-drag cancels active stroke, resets dragging state, and clears pending rAF", () => {
    let cancelCalls = 0;
    let endCalls = 0;
    const capture = createGestureCapture({
      shouldHandle: () => true,
      onStrokeEnd: () => {
        endCalls += 1;
      },
      onStrokeCancel: () => {
        cancelCalls += 1;
      }
    });
    capture.bind();
    dispatchMouse("mousedown", 0, 0);
    dispatchMouse("mousemove", 50, 0);
    expect(capture.isDragging()).toBe(true);
    expect(rafCallback).not.toBeNull();

    capture.unbind();

    expect(capture.isDragging()).toBe(false);
    expect(rafCallback).toBeNull();
    expect(cancelCalls).toBe(1);
    expect(endCalls).toBe(0);
  });
});
