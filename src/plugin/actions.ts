import { DockDocActionGroup } from "@/core/dock-panel-core";

export type ActionKey =
  | "export-current"
  | "insert-backlinks"
  | "insert-child-docs"
  | "export-backlinks-zip"
  | "export-forward-zip"
  | "move-backlinks"
  | "move-forward-links"
  | "dedupe"
  | "remove-extra-blank-lines"
  | "trim-trailing-whitespace"
  | "insert-blank-before-headings"
  | "delete-from-current-to-end"
  | "bold-selected-blocks"
  | "highlight-selected-blocks";

export type ActionConfig = {
  key: ActionKey;
  commandText: string;
  menuText: string;
  group: DockDocActionGroup;
  desktopOnly?: boolean;
  icon: string;
};

export const ACTIONS: ActionConfig[] = [
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
];

const ACTION_KEY_SET = new Set<ActionKey>(ACTIONS.map((action) => action.key));

export function isActionKey(value: string): value is ActionKey {
  return ACTION_KEY_SET.has(value as ActionKey);
}
