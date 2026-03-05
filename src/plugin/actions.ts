import { DockDocActionGroup } from "@/core/dock-panel-core";

export type ActionKey =
  | "export-current"
  | "insert-backlinks"
  | "insert-child-docs"
  | "export-child-key-info-zip"
  | "export-backlinks-zip"
  | "export-forward-zip"
  | "move-backlinks"
  | "move-forward-links"
  | "dedupe"
  | "remove-extra-blank-lines"
  | "trim-trailing-whitespace"
  | "convert-images-to-webp"
  | "convert-images-to-png"
  | "remove-doc-images"
  | "toggle-links-refs"
  | "clean-ai-output"
  | "mark-invalid-links-refs"
  | "insert-blank-before-headings"
  | "delete-from-current-to-end"
  | "bold-selected-blocks"
  | "highlight-selected-blocks"
  | "toggle-linebreaks-paragraphs";

export type ActionConfig = {
  key: ActionKey;
  commandText: string;
  menuText: string;
  group: DockDocActionGroup;
  desktopOnly?: boolean;
  icon: string;
  dockIconText: string;
};

type BaseActionConfig = Omit<ActionConfig, "dockIconText">;

const ACTION_DOCK_ICON_TEXT: Record<ActionKey, string> = {
  "export-current": "导",
  "export-child-key-info-zip": "键",
  "export-backlinks-zip": "反",
  "export-forward-zip": "正",
  "move-backlinks": "移",
  "move-forward-links": "正",
  dedupe: "重",
  "insert-backlinks": "反",
  "insert-child-docs": "子",
  "insert-blank-before-headings": "空",
  "mark-invalid-links-refs": "标",
  "convert-images-to-webp": "图",
  "convert-images-to-png": "图",
  "remove-doc-images": "删",
  "bold-selected-blocks": "粗",
  "highlight-selected-blocks": "亮",
  "toggle-linebreaks-paragraphs": "段",
  "remove-extra-blank-lines": "空",
  "clean-ai-output": "净",
  "trim-trailing-whitespace": "尾",
  "toggle-links-refs": "转",
  "delete-from-current-to-end": "删",
};

const BASE_ACTIONS: BaseActionConfig[] = [
  {
    key: "export-current",
    commandText: "仅导出当前文档",
    menuText: "仅导出当前文档",
    group: "export",
    icon: "iconDownload",
  },
  {
    key: "export-child-key-info-zip",
    commandText: "打包导出子文档关键内容",
    menuText: "打包导出子文档关键内容",
    group: "export",
    icon: "iconDownload",
  },
  {
    key: "export-backlinks-zip",
    commandText: "打包导出反链文档",
    menuText: "打包导出反链文档",
    group: "export",
    icon: "iconDownload",
  },
  {
    key: "export-forward-zip",
    commandText: "打包导出正链文档",
    menuText: "打包导出正链文档",
    group: "export",
    icon: "iconDownload",
  },
  {
    key: "move-backlinks",
    commandText: "移动反链文档为子文档",
    menuText: "移动反链文档为子文档",
    group: "organize",
    desktopOnly: true,
    icon: "iconMove",
  },
  {
    key: "move-forward-links",
    commandText: "移动正链文档为子文档",
    menuText: "移动正链文档为子文档",
    group: "organize",
    desktopOnly: true,
    icon: "iconMove",
  },
  {
    key: "dedupe",
    commandText: "识别本层级重复文档",
    menuText: "识别本层级重复文档",
    group: "organize",
    desktopOnly: true,
    icon: "iconTrashcan",
  },
  {
    key: "insert-backlinks",
    commandText: "插入反链文档列表（去重）",
    menuText: "插入反链文档列表（去重）",
    group: "insert",
    icon: "iconList",
  },
  {
    key: "insert-child-docs",
    commandText: "插入子文档列表（去重）",
    menuText: "插入子文档列表（去重）",
    group: "insert",
    icon: "iconList",
  },
  {
    key: "insert-blank-before-headings",
    commandText: "标题前增加空段落",
    menuText: "标题前增加空段落",
    group: "insert",
    icon: "iconList",
  },
  {
    key: "mark-invalid-links-refs",
    commandText: "标示无效链接/引用",
    menuText: "标示无效链接/引用",
    group: "organize",
    icon: "iconLink",
  },
  {
    key: "toggle-links-refs",
    commandText: "链接<->引用批量互转",
    menuText: "链接<->引用批量互转",
    group: "edit",
    icon: "iconLink",
  },
  {
    key: "clean-ai-output",
    commandText: "清理AI输出内容",
    menuText: "清理AI输出内容",
    group: "edit",
    icon: "iconTrashcan",
  },
  {
    key: "bold-selected-blocks",
    commandText: "选中块全部加粗",
    menuText: "选中块全部加粗",
    group: "edit",
    icon: "iconBold",
  },
  {
    key: "highlight-selected-blocks",
    commandText: "选中块全部高亮",
    menuText: "选中块全部高亮",
    group: "edit",
    icon: "iconInfo",
  },
  {
    key: "toggle-linebreaks-paragraphs",
    commandText: "选中内容换行-分段互转",
    menuText: "选中内容换行-分段互转",
    group: "edit",
    icon: "iconList",
  },
  {
    key: "remove-extra-blank-lines",
    commandText: "去除本文档空段落",
    menuText: "去除本文档空段落",
    group: "edit",
    icon: "iconTrashcan",
  },
  {
    key: "trim-trailing-whitespace",
    commandText: "清理行尾空格（含Tab）",
    menuText: "清理行尾空格（含Tab）",
    group: "edit",
    icon: "iconTrashcan",
  },
  {
    key: "delete-from-current-to-end",
    commandText: "删除后续段落（含本段）",
    menuText: "删除后续段落（含本段）",
    group: "edit",
    icon: "iconTrashcan",
  },
  {
    key: "convert-images-to-webp",
    commandText: "批量转换为WebP",
    menuText: "批量转换为WebP",
    group: "image",
    icon: "iconImage",
  },
  {
    key: "convert-images-to-png",
    commandText: "批量转换为PNG",
    menuText: "批量转换为PNG",
    group: "image",
    icon: "iconImage",
  },
  {
    key: "remove-doc-images",
    commandText: "删除本文档图片",
    menuText: "删除本文档图片",
    group: "image",
    icon: "iconImage",
  },
];

export const ACTIONS: ActionConfig[] = BASE_ACTIONS.map((action) => ({
  ...action,
  dockIconText: ACTION_DOCK_ICON_TEXT[action.key],
}));

export const ACTION_CONFIG_BY_KEY = new Map<ActionKey, ActionConfig>(
  ACTIONS.map((action) => [action.key, action])
);

const ACTION_KEY_SET = new Set<ActionKey>(ACTIONS.map((action) => action.key));

export function isActionKey(value: string): value is ActionKey {
  return ACTION_KEY_SET.has(value as ActionKey);
}

export function getActionConfigByKey(key: ActionKey): ActionConfig {
  const action = ACTION_CONFIG_BY_KEY.get(key);
  if (!action) {
    throw new Error(`Unknown action key: ${key}`);
  }
  return action;
}

export function getActionDockIconTextByKey(key: string): string | undefined {
  return ACTION_CONFIG_BY_KEY.get(key as ActionKey)?.dockIconText;
}
