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
  | "create-open-docs-summary"
  | "dedupe"
  | "remove-extra-blank-lines"
  | "trim-trailing-whitespace"
  | "convert-images-to-webp"
  | "convert-images-to-png"
  | "resize-images-to-display"
  | "remove-doc-images"
  | "toggle-links-refs"
  | "clean-ai-output"
  | "clean-clipped-list-prefixes"
  | "mark-invalid-links-refs"
  | "insert-blank-before-headings"
  | "toggle-heading-bold"
  | "merge-selected-list-blocks"
  | "delete-from-current-to-end"
  | "bold-selected-blocks"
  | "highlight-selected-blocks"
  | "toggle-linebreaks-paragraphs"
  | "remove-selected-spacing"
  | "toggle-selected-punctuation";

export type ActionConfig = {
  key: ActionKey;
  commandText: string;
  menuText: string;
  group: DockDocActionGroup;
  desktopOnly?: boolean;
  requiresWritableDoc?: boolean;
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
  "create-open-docs-summary": "汇",
  dedupe: "重",
  "insert-backlinks": "反",
  "insert-child-docs": "子",
  "insert-blank-before-headings": "空",
  "toggle-heading-bold": "题",
  "merge-selected-list-blocks": "列",
  "mark-invalid-links-refs": "标",
  "convert-images-to-webp": "图",
  "convert-images-to-png": "图",
  "resize-images-to-display": "缩",
  "remove-doc-images": "删",
  "bold-selected-blocks": "粗",
  "highlight-selected-blocks": "亮",
  "toggle-linebreaks-paragraphs": "段",
  "remove-selected-spacing": "格",
  "toggle-selected-punctuation": "标",
  "remove-extra-blank-lines": "空",
  "clean-ai-output": "净",
  "clean-clipped-list-prefixes": "序",
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
    key: "export-child-key-info-zip",
    commandText: "打包导出子文档关键内容",
    menuText: "打包导出子文档关键内容",
    group: "export",
    icon: "iconDownload",
  },
  {
    key: "move-backlinks",
    commandText: "移动反链文档为子文档",
    menuText: "移动反链文档为子文档",
    group: "organize",
    desktopOnly: true,
    requiresWritableDoc: true,
    icon: "iconMove",
  },
  {
    key: "move-forward-links",
    commandText: "移动正链文档为子文档",
    menuText: "移动正链文档为子文档",
    group: "organize",
    desktopOnly: true,
    requiresWritableDoc: true,
    icon: "iconMove",
  },
  {
    key: "create-open-docs-summary",
    commandText: "生成已打开文档的汇总页",
    menuText: "生成已打开文档的汇总页",
    group: "organize",
    icon: "iconList",
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
    requiresWritableDoc: true,
    icon: "iconList",
  },
  {
    key: "insert-child-docs",
    commandText: "插入子文档列表（去重）",
    menuText: "插入子文档列表（去重）",
    group: "insert",
    requiresWritableDoc: true,
    icon: "iconList",
  },
  {
    key: "toggle-links-refs",
    commandText: "链接<->引用批量互转",
    menuText: "链接<->引用批量互转",
    group: "insert",
    requiresWritableDoc: true,
    icon: "iconLink",
  },
  {
    key: "mark-invalid-links-refs",
    commandText: "标示无效链接/引用",
    menuText: "标示无效链接/引用",
    group: "insert",
    requiresWritableDoc: true,
    icon: "iconLink",
  },
  {
    key: "insert-blank-before-headings",
    commandText: "标题前增加空段落",
    menuText: "标题前增加空段落",
    group: "insert",
    requiresWritableDoc: true,
    icon: "iconList",
  },
  {
    key: "toggle-heading-bold",
    commandText: "标题块加粗状态切换",
    menuText: "标题块加粗状态切换",
    group: "edit",
    requiresWritableDoc: true,
    icon: "iconBold",
  },
  {
    key: "merge-selected-list-blocks",
    commandText: "选中内容合并列表块",
    menuText: "选中内容合并列表块",
    group: "edit",
    requiresWritableDoc: true,
    icon: "iconList",
  },
  {
    key: "bold-selected-blocks",
    commandText: "选中块全部加粗",
    menuText: "选中块全部加粗",
    group: "edit",
    requiresWritableDoc: true,
    icon: "iconBold",
  },
  {
    key: "highlight-selected-blocks",
    commandText: "选中块全部高亮",
    menuText: "选中块全部高亮",
    group: "edit",
    requiresWritableDoc: true,
    icon: "iconInfo",
  },
  {
    key: "toggle-linebreaks-paragraphs",
    commandText: "选中内容换行-分段互转",
    menuText: "选中内容换行-分段互转",
    group: "edit",
    requiresWritableDoc: true,
    icon: "iconRefresh",
  },
  {
    key: "toggle-selected-punctuation",
    commandText: "选中内容中英文标点互转",
    menuText: "选中内容中英文标点互转",
    group: "edit",
    requiresWritableDoc: true,
    icon: "iconRefresh",
  },
  {
    key: "remove-selected-spacing",
    commandText: "选中内容删除空格",
    menuText: "选中内容删除空格",
    group: "edit",
    requiresWritableDoc: true,
    icon: "iconTrashcan",
  },
  {
    key: "trim-trailing-whitespace",
    commandText: "清理行尾空格（含Tab）",
    menuText: "清理行尾空格（含Tab）",
    group: "edit",
    requiresWritableDoc: true,
    icon: "iconTrashcan",
  },
  {
    key: "clean-ai-output",
    commandText: "清理AI输出内容",
    menuText: "清理AI输出内容",
    group: "edit",
    requiresWritableDoc: true,
    icon: "iconTrashcan",
  },
  {
    key: "clean-clipped-list-prefixes",
    commandText: "清理剪藏内容",
    menuText: "清理剪藏内容",
    group: "edit",
    requiresWritableDoc: true,
    icon: "iconTrashcan",
  },
  {
    key: "remove-extra-blank-lines",
    commandText: "去除本文档空段落",
    menuText: "去除本文档空段落",
    group: "edit",
    requiresWritableDoc: true,
    icon: "iconTrashcan",
  },
  {
    key: "delete-from-current-to-end",
    commandText: "删除后续段落（含本段）",
    menuText: "删除后续段落（含本段）",
    group: "edit",
    requiresWritableDoc: true,
    icon: "iconTrashcan",
  },
  {
    key: "convert-images-to-webp",
    commandText: "批量转换为WebP",
    menuText: "批量转换为WebP",
    group: "image",
    requiresWritableDoc: true,
    icon: "iconImage",
  },
  {
    key: "convert-images-to-png",
    commandText: "批量转换为PNG",
    menuText: "批量转换为PNG",
    group: "image",
    requiresWritableDoc: true,
    icon: "iconImage",
  },
  {
    key: "resize-images-to-display",
    commandText: "按当前显示调整图片尺寸",
    menuText: "按当前显示调整图片尺寸",
    group: "image",
    requiresWritableDoc: true,
    icon: "iconImage",
  },
  {
    key: "remove-doc-images",
    commandText: "删除本文档图片",
    menuText: "删除本文档图片",
    group: "image",
    requiresWritableDoc: true,
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
