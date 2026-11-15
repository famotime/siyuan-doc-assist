import { describe, expect, test } from "vitest";
import {
  reorderFavoriteActionKeys,
  resolveInsertBeforeFromGeometry
} from "@/core/dock-doc-action-drag-core";

describe("dock doc action drag core", () => {
  test("resolves insert side from row geometry", () => {
    expect(resolveInsertBeforeFromGeometry({ top: 10, height: 20, clientY: 15 })).toBe(true);
    expect(resolveInsertBeforeFromGeometry({ top: 10, height: 20, clientY: 25 })).toBe(false);
    expect(resolveInsertBeforeFromGeometry({ top: 10, height: 0, clientY: 15 })).toBe(false);
  });

  test("reorders favorite actions preserving unrelated order", () => {
    expect(reorderFavoriteActionKeys(["a", "b", "c"], "c", "a", true)).toEqual(["c", "a", "b"]);
    expect(reorderFavoriteActionKeys(["a", "b", "c"], "a", "c", false)).toEqual(["b", "c", "a"]);
    expect(reorderFavoriteActionKeys(["a", "b"], "missing", "a", true)).toEqual(["a", "b"]);
  });
});
