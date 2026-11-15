import { describe, expect, test } from "vitest";
import { mergeKeymap } from "@/services/kernel-conf";
import type { KeymapData } from "@/services/kernel-conf";

function makeKeymap(overrides: Partial<KeymapData> = {}): KeymapData {
  return {
    editor: {
      general: { undo: { custom: "", default: "⌘Z" }, redo: { custom: "", default: "⌘⇧Z" } },
      heading: { heading1: { custom: "", default: "⌘1" } },
      insert: { bold: { custom: "", default: "⌘B" }, italic: { custom: "", default: "⌘I" } },
      list: { indent: { custom: "", default: "Tab" } },
      table: { "insert-row-below": { custom: "", default: "⌘⏎" } }
    },
    general: {
      search: { custom: "", default: "⌘F" },
      config: { custom: "", default: "⌘," }
    },
    plugin: {},
    ...overrides
  };
}

describe("mergeKeymap", () => {
  test("保留 target 中存在且 source 中也存在的 key，用 source 的值覆盖", () => {
    const target = makeKeymap();
    const source = makeKeymap({
      editor: {
        ...makeKeymap().editor,
        general: { undo: { custom: "⌘U", default: "⌘Z" }, redo: { custom: "", default: "⌘⇧Z" } }
      }
    });

    const merged = mergeKeymap(target, source);
    expect(merged.editor.general.undo.custom).toBe("⌘U");
    expect(merged.editor.general.redo.custom).toBe("");
  });

  test("过滤掉 source 中有但 target 中没有的 key", () => {
    const target = makeKeymap();
    const source = makeKeymap({
      editor: {
        ...makeKeymap().editor,
        general: {
          undo: { custom: "", default: "⌘Z" },
          redo: { custom: "", default: "⌘⇧Z" },
          extraAction: { custom: "⌘E", default: "" }
        }
      }
    });

    const merged = mergeKeymap(target, source);
    expect(merged.editor.general).not.toHaveProperty("extraAction");
  });

  test("target 中有但 source 中没有的 key 保持不变", () => {
    const target = makeKeymap();
    const source: KeymapData = {
      editor: {
        general: { undo: { custom: "", default: "⌘Z" } },
        heading: {},
        insert: {},
        list: {},
        table: {}
      },
      general: {},
      plugin: {}
    };

    const merged = mergeKeymap(target, source);
    expect(merged.editor.general.redo).toEqual({ custom: "", default: "⌘⇧Z" });
    expect(merged.editor.heading.heading1).toEqual({ custom: "", default: "⌘1" });
    expect(merged.general.search).toEqual({ custom: "", default: "⌘F" });
  });

  test("插件快捷键仅在目标实例也存在同名插件时才合并", () => {
    const target = makeKeymap({
      plugin: {
        "plugin-a": { cmd1: { custom: "", default: "⌘1" } }
      }
    });
    const source = makeKeymap({
      plugin: {
        "plugin-a": { cmd1: { custom: "⌘9", default: "⌘1" }, cmd2: { custom: "⌘8", default: "" } },
        "plugin-b": { cmd3: { custom: "⌘7", default: "" } }
      }
    });

    const merged = mergeKeymap(target, source);
    // plugin-a 存在于 target，cmd1 被 source 覆盖，cmd2 被过滤
    expect(merged.plugin["plugin-a"].cmd1.custom).toBe("⌘9");
    expect(merged.plugin["plugin-a"]).not.toHaveProperty("cmd2");
    // plugin-b 不存在于 target，被完全过滤
    expect(merged.plugin).not.toHaveProperty("plugin-b");
  });

  test("general 快捷键同样只覆盖 target 中已有的 key", () => {
    const target = makeKeymap();
    const source = makeKeymap({
      general: {
        search: { custom: "⌘⇧F", default: "⌘F" },
        newFeature: { custom: "⌘N", default: "" }
      }
    });

    const merged = mergeKeymap(target, source);
    expect(merged.general.search.custom).toBe("⌘⇧F");
    expect(merged.general).not.toHaveProperty("newFeature");
    expect(merged.general.config).toEqual({ custom: "", default: "⌘," });
  });

  test("target 和 source 完全相同的情况", () => {
    const keymap = makeKeymap();
    const merged = mergeKeymap(keymap, keymap);
    expect(merged).toEqual(keymap);
  });
});
