import {
  GestureDirection,
  GesturePoint,
  GestureRecognizer
} from "@/core/gesture-recognition-core";

export type GestureStrokeState = {
  /** 采样到的轨迹点 */
  points: GesturePoint[];
  /** 已识别的方向序列 */
  directions: GestureDirection[];
  /** 是否已越过起始阈值（区别于普通右键点击） */
  moved: boolean;
  /** 按下时的事件目标（用于反查所属编辑器） */
  startTarget: HTMLElement | null;
};

export type GestureCaptureCallbacks = {
  /** 是否处理本次右键按下（过滤条件：功能开关、生效区域等） */
  shouldHandle: (event: MouseEvent) => boolean;
  onStrokeStart?: (point: GesturePoint, startTarget: HTMLElement | null) => void;
  onStrokeMove?: (state: GestureStrokeState) => void;
  onStrokeEnd?: (state: GestureStrokeState) => void;
  onStrokeCancel?: () => void;
};

/**
 * 通用右键手势捕获：document 捕获阶段监听鼠标事件，驱动方向序列识别，
 * 并在识别出划动手势时抑制随后的原生右键菜单；未划动的普通右键不受影响。
 */
export function createGestureCapture(callbacks: GestureCaptureCallbacks) {
  const recognizer = new GestureRecognizer();
  let dragging = false;
  let suppressNextContextMenu = false;
  let points: GesturePoint[] = [];
  let startTarget: HTMLElement | null = null;
  let bound = false;

  const buildState = (): GestureStrokeState => ({
    points: [...points],
    directions: recognizer.getDirections(),
    moved: recognizer.isMoved(),
    startTarget
  });

  const handleMouseDown = (event: MouseEvent) => {
    suppressNextContextMenu = false;
    if (event.button !== 2 || !callbacks.shouldHandle(event)) {
      return;
    }
    recognizer.reset();
    // 以按下坐标作为识别原点，保证快速划动（仅一次 mousemove）也能识别首段方向
    recognizer.feed(event.clientX, event.clientY);
    points = [{ x: event.clientX, y: event.clientY }];
    startTarget = event.target instanceof HTMLElement ? event.target : null;
    dragging = true;
    callbacks.onStrokeStart?.(points[0], startTarget);
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (!dragging) {
      return;
    }
    recognizer.feed(event.clientX, event.clientY);
    points.push({ x: event.clientX, y: event.clientY });
    callbacks.onStrokeMove?.(buildState());
  };

  const finishDrag = (commit: boolean) => {
    if (!dragging) {
      return;
    }
    dragging = false;
    const state = buildState();
    if (commit && state.moved) {
      suppressNextContextMenu = true;
      callbacks.onStrokeEnd?.(state);
    } else {
      callbacks.onStrokeCancel?.();
    }
  };

  const handleMouseUp = (event: MouseEvent) => {
    if (!dragging) {
      return;
    }
    finishDrag(event.button === 2);
  };

  const handleContextMenu = (event: MouseEvent) => {
    if (!suppressNextContextMenu) {
      return;
    }
    suppressNextContextMenu = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const handleBlur = () => {
    if (dragging) {
      finishDrag(false);
    }
    suppressNextContextMenu = false;
  };

  const bind = () => {
    if (bound) {
      return;
    }
    bound = true;
    document.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("mouseup", handleMouseUp, true);
    document.addEventListener("contextmenu", handleContextMenu, true);
    window.addEventListener("blur", handleBlur);
  };

  const unbind = () => {
    if (!bound) {
      return;
    }
    bound = false;
    document.removeEventListener("mousedown", handleMouseDown, true);
    document.removeEventListener("mousemove", handleMouseMove, true);
    document.removeEventListener("mouseup", handleMouseUp, true);
    document.removeEventListener("contextmenu", handleContextMenu, true);
    window.removeEventListener("blur", handleBlur);
  };

  return {
    bind,
    unbind,
    isDragging: () => dragging
  };
}
