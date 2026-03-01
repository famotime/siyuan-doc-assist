export type DockTabKey = "key-info" | "doc-process";

export type DockTab = {
  key: DockTabKey;
  label: string;
};

export type DockDocActionSource<T extends string = string> = {
  key: T;
  commandText: string;
  icon: string;
  group: DockDocActionGroup;
  desktopOnly?: boolean;
};

export type DockDocActionGroup = "export" | "insert" | "organize" | "edit" | "image";

export type DockDocAction<T extends string = string> = {
  key: T;
  label: string;
  icon: string;
  group: DockDocActionGroup;
  groupLabel: string;
  disabled: boolean;
  disabledReason?: string;
  menuRegistered: boolean;
  menuToggleDisabled: boolean;
  menuToggleDisabledReason?: string;
};

export const DOCK_TABS: DockTab[] = [
  { key: "key-info", label: "关键内容" },
  { key: "doc-process", label: "文档处理" },
];

const DOCK_ACTION_GROUP_LABELS: Record<DockDocActionGroup, string> = {
  export: "导出",
  insert: "插入",
  organize: "整理",
  image: "图片",
  edit: "编辑",
};

export function buildDockDocActions<T extends string>(
  actions: DockDocActionSource<T>[],
  isMobile: boolean,
  menuRegistrationState: Partial<Record<T, boolean>> = {}
): DockDocAction<T>[] {
  return actions.map((action) => {
    const disabled = Boolean(action.desktopOnly && isMobile);
    const menuRegistered = menuRegistrationState[action.key] !== false;
    return {
      key: action.key,
      label: action.commandText,
      icon: action.icon,
      group: action.group,
      groupLabel: DOCK_ACTION_GROUP_LABELS[action.group],
      disabled,
      menuRegistered,
      menuToggleDisabled: disabled,
      ...(disabled ? { disabledReason: "该操作当前仅支持桌面端" } : {}),
      ...(disabled ? { menuToggleDisabledReason: "该操作当前仅支持桌面端" } : {}),
    };
  });
}
