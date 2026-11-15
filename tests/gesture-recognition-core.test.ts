import { describe, expect, test } from "vitest";
import {
  DEFAULT_GESTURE_BINDINGS,
  findGestureConflict,
  formatGestureHint,
  formatGestureSequence,
  GesturePoint,
  GestureRecognizer,
  isValidGestureSequence,
  matchGestureAction,
  MAX_GESTURE_LENGTH,
  normalizeGestureBindings,
  parseGestureSequence,
  serializeDirections,
} from "@/core/gesture-recognition-core";

function feedStroke(points: Array<[number, number]>): GestureRecognizer {
  const recognizer = new GestureRecognizer();
  for (const [x, y] of points) {
    recognizer.feed(x, y);
  }
  return recognizer;
}

describe("gesture recognition core", () => {
  test("ignores movement below the start threshold (plain right-click)", () => {
    const recognizer = feedStroke([
      [100, 100],
      [104, 103],
      [107, 105],
    ]);
    expect(recognizer.getDirections()).toEqual([]);
    expect(recognizer.isMoved()).toBe(false);
  });

  test("recognizes a single straight left stroke", () => {
    const recognizer = feedStroke([
      [300, 300],
      [260, 300],
      [220, 300],
    ]);
    expect(recognizer.getDirections()).toEqual(["L"]);
    expect(recognizer.isMoved()).toBe(true);
  });

  test("recognizes down-then-right corner (close-doc gesture)", () => {
    const recognizer = feedStroke([
      [0, 0],
      [0, 30],
      [0, 50],
      [30, 55],
      [70, 60],
    ]);
    expect(recognizer.getDirections()).toEqual(["D", "R"]);
  });

  test("recognizes eight directions", () => {
    expect(feedStroke([[0, 0], [0, -60]]).getDirections()).toEqual(["U"]);
    expect(feedStroke([[0, 0], [-60, 0]]).getDirections()).toEqual(["L"]);
    expect(feedStroke([[0, 0], [60, 0]]).getDirections()).toEqual(["R"]);
    expect(feedStroke([[0, 0], [-40, -40]]).getDirections()).toEqual(["UL"]);
    expect(feedStroke([[0, 0], [40, -40]]).getDirections()).toEqual(["UR"]);
    expect(feedStroke([[0, 0], [-40, 40]]).getDirections()).toEqual(["DL"]);
    expect(feedStroke([[0, 0], [40, 40]]).getDirections()).toEqual(["DR"]);
  });

  test("does not commit extra segments for drift during a long straight stroke", () => {
    const recognizer = feedStroke([
      [0, 0],
      [5, 30],
      [12, 70],
      [20, 120],
    ]);
    expect(recognizer.getDirections()).toEqual(["D"]);
  });

  test("reset clears recognized state", () => {
    const recognizer = feedStroke([
      [0, 0],
      [0, 60],
    ]);
    expect(recognizer.getDirections()).toEqual(["D"]);
    recognizer.reset();
    expect(recognizer.getDirections()).toEqual([]);
    expect(recognizer.isMoved()).toBe(false);
    recognizer.feed(0, 0);
    recognizer.feed(-80, -2);
    expect(recognizer.getDirections()).toEqual(["L"]);
  });

  test("serialize/parse/format gesture sequences", () => {
    expect(serializeDirections(["D", "R"])).toBe("D,R");
    expect(parseGestureSequence("D,R")).toEqual(["D", "R"]);
    expect(parseGestureSequence("D,,R")).toEqual(["D", "R"]);
    expect(parseGestureSequence("X,R")).toEqual([]);
    expect(parseGestureSequence("")).toEqual([]);
    expect(formatGestureSequence("D,R")).toBe("↓→");
    expect(formatGestureSequence("L")).toBe("←");
    expect(formatGestureSequence("")).toBe("未设置");
    expect(formatGestureSequence("Q")).toBe("未设置");
  });

  test("validates gesture sequence length", () => {
    expect(isValidGestureSequence("L")).toBe(true);
    expect(isValidGestureSequence("L,R,L,R")).toBe(true);
    expect(isValidGestureSequence("L,R,L,R,L")).toBe(false);
    expect(isValidGestureSequence("")).toBe(false);
    expect(MAX_GESTURE_LENGTH).toBe(4);
  });

  test("matches gesture bindings", () => {
    expect(matchGestureAction(["L"], DEFAULT_GESTURE_BINDINGS)).toBe("previous-doc");
    expect(matchGestureAction(["R"], DEFAULT_GESTURE_BINDINGS)).toBe("next-doc");
    expect(matchGestureAction(["D", "R"], DEFAULT_GESTURE_BINDINGS)).toBe(
      "close-current-doc"
    );
    expect(matchGestureAction(["U"], DEFAULT_GESTURE_BINDINGS)).toBeNull();
    expect(matchGestureAction(["D"], DEFAULT_GESTURE_BINDINGS)).toBeNull();
  });

  test("formats stroke hint with matched action name", () => {
    expect(formatGestureHint(["D", "R"], DEFAULT_GESTURE_BINDINGS)).toBe(
      "↓→ 关闭当前文档"
    );
    expect(formatGestureHint(["L"], DEFAULT_GESTURE_BINDINGS)).toBe("← 切换上一个文档");
    expect(formatGestureHint(["U"], DEFAULT_GESTURE_BINDINGS)).toBe("↑");
    expect(formatGestureHint([], DEFAULT_GESTURE_BINDINGS)).toBe("");
    expect(
      formatGestureHint(["D"], { ...DEFAULT_GESTURE_BINDINGS, "close-current-doc": "D,R" })
    ).toBe("↓");
  });

  test("finds gesture conflicts with exclusion", () => {
    expect(findGestureConflict("L", DEFAULT_GESTURE_BINDINGS)).toBe("previous-doc");
    expect(findGestureConflict("L", DEFAULT_GESTURE_BINDINGS, "previous-doc")).toBeNull();
  });

  test("normalizes gesture bindings and resolves conflicts", () => {
    expect(normalizeGestureBindings(undefined)).toEqual(DEFAULT_GESTURE_BINDINGS);
    expect(normalizeGestureBindings({
      "previous-doc": "U",
      "next-doc": "bad",
      "close-current-doc": 123,
    })).toEqual({
      "previous-doc": "U",
      "next-doc": "R",
      "close-current-doc": "D,R",
    });

    // 同一序列重复绑定：靠后的动作回退到默认值
    expect(normalizeGestureBindings({
      "previous-doc": "L",
      "next-doc": "L",
      "close-current-doc": "D,R",
    })).toEqual(DEFAULT_GESTURE_BINDINGS);
  });

  test("gesture points round-trip via stroke", () => {
    const points: GesturePoint[] = [
      { x: 0, y: 0 },
      { x: 0, y: 40 },
    ];
    const recognizer = new GestureRecognizer();
    for (const point of points) {
      recognizer.feed(point.x, point.y);
    }
    expect(serializeDirections(recognizer.getDirections())).toBe("D");
  });
});
