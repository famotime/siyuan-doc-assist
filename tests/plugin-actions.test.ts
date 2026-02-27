import { describe, expect, test } from "vitest";
import { ACTIONS, isActionKey } from "@/plugin/actions";

describe("plugin actions", () => {
  test("contains unique action keys", () => {
    const keys = ACTIONS.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("recognizes valid action keys", () => {
    expect(isActionKey("export-current")).toBe(true);
    expect(isActionKey("insert-backlinks")).toBe(true);
    expect(isActionKey("move-forward-links")).toBe(true);
    expect(isActionKey("trim-trailing-whitespace")).toBe(true);
    expect(isActionKey("insert-blank-before-headings")).toBe(true);
    expect(isActionKey("delete-from-current-to-end")).toBe(true);
    expect(isActionKey("invalid-key")).toBe(false);
  });
});
