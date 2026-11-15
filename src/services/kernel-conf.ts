import { requestApi } from "@/services/request";

// --- 类型定义 ---

export type KeyEntry = { custom: string; default: string };
export type KeySet = Record<string, KeyEntry>;

export type KeymapEditor = {
  general: KeySet;
  heading: KeySet;
  insert: KeySet;
  list: KeySet;
  table: KeySet;
};

export type KeymapData = {
  editor: KeymapEditor;
  general: KeySet;
  plugin: Record<string, KeySet>;
};

type SystemConfResponse = {
  conf?: { keymap?: KeymapData };
};

// --- API 函数 ---

export async function getKeymap(): Promise<KeymapData> {
  const conf = await requestApi<SystemConfResponse>("/api/system/getConf");
  if (!conf?.conf?.keymap) {
    throw new Error("无法获取快捷键配置");
  }
  return conf.conf.keymap;
}

export async function setKeymap(keymap: KeymapData): Promise<void> {
  await requestApi("/api/setting/setKeymap", { data: keymap });
}

// --- 合并逻辑 ---

function mergeKeySet(target: KeySet, source: KeySet): KeySet {
  const result: KeySet = {};
  for (const key of Object.keys(target)) {
    result[key] = Object.prototype.hasOwnProperty.call(source, key) ?
      source[key] :
      target[key];
  }
  return result;
}

function mergeEditor(target: KeymapEditor, source: KeymapEditor): KeymapEditor {
  return {
    general: mergeKeySet(target.general, source.general),
    heading: mergeKeySet(target.heading, source.heading),
    insert: mergeKeySet(target.insert, source.insert),
    list: mergeKeySet(target.list, source.list),
    table: mergeKeySet(target.table, source.table)
  };
}

/**
 * 以 target 为骨架，仅将 source 中 target 也存在的 key 覆盖进去。
 * - 不引入 source 中 target 不存在的 key（防止目标实例无对应命令）
 * - 插件快捷键仅在目标实例也存在同名插件时才合并
 */
export function mergeKeymap(target: KeymapData, source: KeymapData): KeymapData {
  const mergedPlugin: Record<string, KeySet> = {};
  for (const pluginName of Object.keys(target.plugin)) {
    mergedPlugin[pluginName] = Object.prototype.hasOwnProperty.call(source.plugin, pluginName) ?
        mergeKeySet(target.plugin[pluginName], source.plugin[pluginName]) :
        { ...target.plugin[pluginName] };
  }

  return {
    editor: mergeEditor(target.editor, source.editor),
    general: mergeKeySet(target.general, source.general),
    plugin: mergedPlugin
  };
}
