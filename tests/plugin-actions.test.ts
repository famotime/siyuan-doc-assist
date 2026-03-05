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
    expect(isActionKey("toggle-links-refs")).toBe(true);
    expect(isActionKey("convert-images-to-webp")).toBe(true);
    expect(isActionKey("convert-images-to-png")).toBe(true);
    expect(isActionKey("remove-doc-images")).toBe(true);
    expect(isActionKey("trim-trailing-whitespace")).toBe(true);
    expect(isActionKey("clean-ai-output")).toBe(true);
    expect(isActionKey("insert-blank-before-headings")).toBe(true);
    expect(isActionKey("mark-invalid-links-refs")).toBe(true);
    expect(isActionKey("delete-from-current-to-end")).toBe(true);
    expect(isActionKey("toggle-linebreaks-paragraphs")).toBe(true);
    expect(isActionKey("invalid-key")).toBe(false);
  });

  test("defines consistent command/menu labels and dock icon text", () => {
    for (const action of ACTIONS) {
      expect(action.commandText.trim().length).toBeGreaterThan(0);
      expect(action.menuText).toBe(action.commandText);
      expect(action.dockIconText?.trim().length).toBe(1);
    }
  });
});
