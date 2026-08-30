import type { ActionKey } from "@/plugin/actions";

export type ActionDefaultState = {
  defaultEnabled: boolean;
  defaultMenuRegistered: boolean;
};

/**
 * 默认不启用的命令集合（未在集合中的命令默认全部启用）
 * 当前包括：文档处理-编辑 分类下的“选中块全部加粗”与“选中块全部高亮”
 */
const DEFAULT_DISABLED_ACTION_KEYS = new Set<ActionKey>([
  "bold-selected-blocks",
  "highlight-selected-blocks",
]);

/**
 * 默认注册到文档菜单的命令集合（当前默认全部不注册）
 */
const DEFAULT_MENU_REGISTERED_ACTION_KEYS = new Set<ActionKey>([]);

export function getDefaultActionState(key: ActionKey): ActionDefaultState {
  const isDefaultDisabled = DEFAULT_DISABLED_ACTION_KEYS.has(key);
  const isDefaultMenuRegistered = DEFAULT_MENU_REGISTERED_ACTION_KEYS.has(key);
  return {
    defaultEnabled: !isDefaultDisabled,
    defaultMenuRegistered: isDefaultMenuRegistered,
  };
}

export function isActionDefaultEnabled(key: ActionKey): boolean {
  return !DEFAULT_DISABLED_ACTION_KEYS.has(key);
}

export function isActionDefaultMenuRegistered(key: ActionKey): boolean {
  return DEFAULT_MENU_REGISTERED_ACTION_KEYS.has(key);
}

/**
 * 全量命令初始配置映射表
 */
export const ACTION_DEFAULT_CONFIGS: Record<ActionKey, ActionDefaultState> = {
  // 导出
  "export-current": { defaultEnabled: true, defaultMenuRegistered: false },
  "export-child-docs-zip": { defaultEnabled: true, defaultMenuRegistered: false },
  "export-related-docs-zip": { defaultEnabled: true, defaultMenuRegistered: false },
  "export-backlinks-zip": { defaultEnabled: true, defaultMenuRegistered: false },
  "export-forward-zip": { defaultEnabled: true, defaultMenuRegistered: false },
  "export-child-key-info-zip": { defaultEnabled: true, defaultMenuRegistered: false },
  "extract-web-links": { defaultEnabled: true, defaultMenuRegistered: false },
  "export-keymap": { defaultEnabled: true, defaultMenuRegistered: false },
  "import-keymap": { defaultEnabled: true, defaultMenuRegistered: false },

  // 整理
  "move-backlinks": { defaultEnabled: true, defaultMenuRegistered: false },
  "move-forward-links": { defaultEnabled: true, defaultMenuRegistered: false },
  "create-open-docs-summary": { defaultEnabled: true, defaultMenuRegistered: false },
  "create-top100-large-documents-report": { defaultEnabled: true, defaultMenuRegistered: false },
  dedupe: { defaultEnabled: true, defaultMenuRegistered: false },
  "split-doc-by-headings": { defaultEnabled: true, defaultMenuRegistered: false },

  // 插入
  "insert-backlinks": { defaultEnabled: true, defaultMenuRegistered: false },
  "insert-child-docs": { defaultEnabled: true, defaultMenuRegistered: false },
  "toggle-links-refs": { defaultEnabled: true, defaultMenuRegistered: false },
  "mark-invalid-links-refs": { defaultEnabled: true, defaultMenuRegistered: false },
  "insert-blank-before-headings": { defaultEnabled: true, defaultMenuRegistered: false },
  "set-selection-as-title": { defaultEnabled: true, defaultMenuRegistered: false },

  // AI
  "generate-canvas-from-selected": { defaultEnabled: true, defaultMenuRegistered: false },
  "create-doc-concept-map": { defaultEnabled: true, defaultMenuRegistered: false },
  "insert-doc-summary": { defaultEnabled: true, defaultMenuRegistered: false },
  "mark-irrelevant-paragraphs": { defaultEnabled: true, defaultMenuRegistered: false },
  "mark-key-content": { defaultEnabled: true, defaultMenuRegistered: false },
  "recognize-doc-images": { defaultEnabled: true, defaultMenuRegistered: false },
  "translate-doc-paragraphs": { defaultEnabled: true, defaultMenuRegistered: false },
  "clean-ai-output": { defaultEnabled: true, defaultMenuRegistered: false },
  "add-related-links-and-tags": { defaultEnabled: true, defaultMenuRegistered: false },
  "generate-llm-wiki": { defaultEnabled: true, defaultMenuRegistered: false },

  // 编辑
  "toggle-heading-bold": { defaultEnabled: true, defaultMenuRegistered: false },
  "merge-selected-list-blocks": { defaultEnabled: true, defaultMenuRegistered: false },
  "bold-selected-blocks": { defaultEnabled: false, defaultMenuRegistered: false },
  "highlight-selected-blocks": { defaultEnabled: false, defaultMenuRegistered: false },
  "toggle-linebreaks-paragraphs": { defaultEnabled: true, defaultMenuRegistered: false },
  "toggle-selected-punctuation": { defaultEnabled: true, defaultMenuRegistered: false },
  "remove-selected-spacing": { defaultEnabled: true, defaultMenuRegistered: false },
  "trim-trailing-whitespace": { defaultEnabled: true, defaultMenuRegistered: false },
  "clean-clipped-list-prefixes": { defaultEnabled: true, defaultMenuRegistered: false },
  "remove-extra-blank-lines": { defaultEnabled: true, defaultMenuRegistered: false },
  "delete-from-current-to-end": { defaultEnabled: true, defaultMenuRegistered: false },
  "delete-from-start-to-current": { defaultEnabled: true, defaultMenuRegistered: false },
  "select-from-start-to-current": { defaultEnabled: true, defaultMenuRegistered: false },
  "select-from-current-to-end": { defaultEnabled: true, defaultMenuRegistered: false },
  "remove-strikethrough-marked-content": { defaultEnabled: true, defaultMenuRegistered: false },

  // 图片
  "convert-images-to-webp": { defaultEnabled: true, defaultMenuRegistered: false },
  "convert-images-to-png": { defaultEnabled: true, defaultMenuRegistered: false },
  "resize-images-to-display": { defaultEnabled: true, defaultMenuRegistered: false },
  "remove-doc-images": { defaultEnabled: true, defaultMenuRegistered: false },
};
