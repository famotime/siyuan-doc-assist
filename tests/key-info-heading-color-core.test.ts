import { describe, expect, test } from "vitest";
import { keyInfoItemBadgeText } from "@/core/key-info-core";
import {
  DEFAULT_HEADING_COLORS_DARK,
  DEFAULT_HEADING_COLORS_LIGHT,
  isEffectiveHeadingColor,
  normalizeColorValue,
  resolveHeadingColorMap
} from "@/core/key-info-heading-color-core";

describe("keyInfoItemBadgeText", () => {
  test("renders H1-H6 badge text for title key-info items based on headingLevel", () => {
    expect(keyInfoItemBadgeText({ type: "title", headingLevel: 1 })).toBe("H1");
    expect(keyInfoItemBadgeText({ type: "title", headingLevel: 2 })).toBe("H2");
    expect(keyInfoItemBadgeText({ type: "title", headingLevel: 3 })).toBe("H3");
    expect(keyInfoItemBadgeText({ type: "title", headingLevel: 4 })).toBe("H4");
    expect(keyInfoItemBadgeText({ type: "title", headingLevel: 5 })).toBe("H5");
    expect(keyInfoItemBadgeText({ type: "title", headingLevel: 6 })).toBe("H6");
  });

  test("falls back to H1 for missing or out-of-range headingLevel", () => {
    expect(keyInfoItemBadgeText({ type: "title" })).toBe("H1");
    expect(keyInfoItemBadgeText({ type: "title", headingLevel: 0 })).toBe("H1");
    expect(keyInfoItemBadgeText({ type: "title", headingLevel: 7 })).toBe("H1");
    expect(keyInfoItemBadgeText({ type: "title", headingLevel: -2 })).toBe("H1");
  });

  test("returns standard localized label for non-title items", () => {
    expect(keyInfoItemBadgeText({ type: "bold" })).toBe("加粗");
    expect(keyInfoItemBadgeText({ type: "highlight" })).toBe("高亮");
    expect(keyInfoItemBadgeText({ type: "italic" })).toBe("斜体");
    expect(keyInfoItemBadgeText({ type: "underline" })).toBe("下划");
    expect(keyInfoItemBadgeText({ type: "code" })).toBe("代码");
    expect(keyInfoItemBadgeText({ type: "remark" })).toBe("备注");
    expect(keyInfoItemBadgeText({ type: "tag" })).toBe("标签");
    expect(keyInfoItemBadgeText({ type: "link" })).toBe("链接");
    expect(keyInfoItemBadgeText({ type: "ref" })).toBe("引用");
  });
});

describe("normalizeColorValue", () => {
  test("normalizes rgb and hex colors by trimming whitespace and lowercasing", () => {
    expect(normalizeColorValue("  #FF0000 ")).toBe("#ff0000");
    expect(normalizeColorValue("RGB( 33, 37, 41 )")).toBe("rgb(33,37,41)");
  });

  test("returns empty string for transparent, none, inherit, initial, or empty strings", () => {
    expect(normalizeColorValue("")).toBe("");
    expect(normalizeColorValue(null)).toBe("");
    expect(normalizeColorValue("transparent")).toBe("");
    expect(normalizeColorValue("rgba(0, 0, 0, 0)")).toBe("");
    expect(normalizeColorValue("inherit")).toBe("");
    expect(normalizeColorValue("initial")).toBe("");
  });
});

describe("isEffectiveHeadingColor", () => {
  test("returns false if color is empty or matches base text color", () => {
    expect(isEffectiveHeadingColor("", "rgb(33, 37, 41)")).toBe(false);
    expect(isEffectiveHeadingColor("rgb(33, 37, 41)", "rgb(33, 37, 41)")).toBe(false);
    expect(isEffectiveHeadingColor("#212529", "#212529")).toBe(false);
    expect(isEffectiveHeadingColor("transparent", "#212529")).toBe(false);
  });

  test("returns true if color is valid and distinct from base text color", () => {
    expect(isEffectiveHeadingColor("#e57373", "rgb(33, 37, 41)")).toBe(true);
    expect(isEffectiveHeadingColor("rgb(255, 0, 0)", "rgb(33, 37, 41)")).toBe(true);
  });
});

describe("resolveHeadingColorMap", () => {
  test("returns default light palette when no probed colors provided in light mode", () => {
    const map = resolveHeadingColorMap({}, false, "rgb(33, 37, 41)");
    expect(map[1]).toBe(DEFAULT_HEADING_COLORS_LIGHT[1]);
    expect(map[2]).toBe(DEFAULT_HEADING_COLORS_LIGHT[2]);
    expect(map[6]).toBe(DEFAULT_HEADING_COLORS_LIGHT[6]);
  });

  test("returns default dark palette when no probed colors provided in dark mode", () => {
    const map = resolveHeadingColorMap({}, true, "rgb(240, 240, 240)");
    expect(map[1]).toBe(DEFAULT_HEADING_COLORS_DARK[1]);
    expect(map[2]).toBe(DEFAULT_HEADING_COLORS_DARK[2]);
    expect(map[6]).toBe(DEFAULT_HEADING_COLORS_DARK[6]);
  });

  test("uses probed colors when valid and distinct, while falling back for others", () => {
    const probed = {
      1: "#ff3366",
      3: "rgb(33, 37, 41)"
    };
    const map = resolveHeadingColorMap(probed, false, "rgb(33, 37, 41)");
    expect(map[1]).toBe("#ff3366");
    expect(map[2]).toBe(DEFAULT_HEADING_COLORS_LIGHT[2]);
    expect(map[3]).toBe(DEFAULT_HEADING_COLORS_LIGHT[3]);
  });
});
