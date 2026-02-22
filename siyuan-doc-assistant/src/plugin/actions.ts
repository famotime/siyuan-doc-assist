import { DockDocActionGroup } from "@/core/dock-panel-core";

export type ActionKey =
  | "export-current"
  | "insert-backlinks"
  | "insert-child-docs"
  | "export-backlinks-zip"
  | "export-forward-zip"
  | "move-backlinks"
  | "dedupe"
  | "remove-extra-blank-lines"
  | "insert-blank-before-headings"
  | "delete-from-current-to-end";

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
    key: "dedupe",
    commandText: "识别本层级重复文档",
    menuText: "识别本层级重复文档",
    group: "organize",
    desktopOnly: true,
    icon: "iconTrashcan",
  },
  {
    key: "insert-backlinks",
    commandText: "插入反链文档列表到正文",
    menuText: "插入反链文档列表到正文",
    group: "edit",
    icon: "iconList",
  },
  {
    key: "insert-child-docs",
    commandText: "插入子文档列表到正文",
    menuText: "插入子文档列表到正文",
    group: "edit",
    icon: "iconList",
  },
  {
    key: "insert-blank-before-headings",
    commandText: "为标题前补空段落",
    menuText: "为标题前补空段落",
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
    key: "delete-from-current-to-end",
    commandText: "删除后续全部段落（含本段）",
    menuText: "删除后续全部段落（含本段）",
    group: "edit",
    icon: "iconTrashcan",
  },
];

const ACTION_KEY_SET = new Set<ActionKey>(ACTIONS.map((action) => action.key));

export function isActionKey(value: string): value is ActionKey {
  return ACTION_KEY_SET.has(value as ActionKey);
}
