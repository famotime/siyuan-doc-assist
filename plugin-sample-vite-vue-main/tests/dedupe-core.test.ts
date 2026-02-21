import { describe, expect, test } from "vitest";
import {
  buildDuplicateGroups,
  normalizeTitle,
  suggestKeepDocId,
} from "@/core/dedupe-core";

describe("dedupe-core", () => {
  test("normalizes full width chars and punctuation", () => {
    expect(normalizeTitle("  思源-笔记（测试）  ")).toBe("思源笔记测试");
    expect(normalizeTitle("SiYuan  Note")).toBe("siyuannote");
  });

  test("removes bracketed duplicate suffix before comparing", () => {
    const a = "我的 OpenClaw Token 账单降了72%，只因装了这个插件";
    const b =
      "我的 OpenClaw Token 账单降了72%，只因装了这个插件 (Duplicated 2026-02-21 15:38:08)";

    expect(normalizeTitle(a)).toBe(normalizeTitle(b));
  });

  test("keeps non-duplicated bracket content", () => {
    const a = "周报（第二版）";
    const b = "周报";
    expect(normalizeTitle(a)).not.toBe(normalizeTitle(b));
  });

  test("groups similar docs by threshold", () => {
    const docs = [
      { id: "1", title: "Weekly Plan", updated: "20260101101010" },
      { id: "2", title: "Weekly-Plan", updated: "20260101101011" },
      { id: "3", title: "Project Log", updated: "20260101101012" },
    ];

    const groups = buildDuplicateGroups(docs, 0.85);
    expect(groups).toHaveLength(1);
    expect(groups[0].docs.map((doc) => doc.id)).toEqual(["1", "2"]);
  });

  test("suggests keep latest updated doc id", () => {
    const keep = suggestKeepDocId([
      { id: "1", updated: "20260101101010" },
      { id: "2", updated: "20260101101011" },
      { id: "3", updated: "20250101101011" },
    ]);

    expect(keep).toBe("2");
  });
});
