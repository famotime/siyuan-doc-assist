import { describe, expect, test } from "vitest";
import { getProtyleDocId } from "@/plugin/doc-context";

describe("plugin doc context", () => {
  test("returns id from rootID/rootId/root_id/id in order", () => {
    expect(getProtyleDocId({ block: { rootID: "a", rootId: "b", root_id: "c", id: "d" } })).toBe("a");
    expect(getProtyleDocId({ block: { rootId: "b", root_id: "c", id: "d" } })).toBe("b");
    expect(getProtyleDocId({ block: { root_id: "c", id: "d" } })).toBe("c");
    expect(getProtyleDocId({ block: { id: "d" } })).toBe("d");
  });

  test("returns empty string when protyle context is missing", () => {
    expect(getProtyleDocId(undefined)).toBe("");
    expect(getProtyleDocId({})).toBe("");
  });
});
