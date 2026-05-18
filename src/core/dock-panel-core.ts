export type DockTabKey = "key-info" | "doc-process";

export type DockTab = {
  key: DockTabKey;
  label: string;
};

export type DockDocActionSource<T extends string = string> = {
  key: T;
  commandText: string;
  tooltip?: string;
  icon: string;
  dockIconText?: string;
  group: DockDocActionGroup;
  desktopOnly?: boolean;
  requiresWritableDoc?: boolean;
  runInBackground?: boolean;
};

export type DockDocActionGroup = "export" | "insert" | "organize" | "ai" | "edit" | "image";

export type DockDocAction<T extends string = string> = {
  key: T;
  label: string;
  tooltip?: string;
  icon: string;
  dockIconText?: string;
  group: DockDocActionGroup;
  groupLabel: string;
  disabled: boolean;
  disabledReason?: string;
  menuRegistered: boolean;
  menuToggleDisabled: boolean;
  menuToggleDisabledReason?: string;
  runInBackground?: boolean;
};

export const DOCK_TABS: DockTab[] = [
  { key: "key-info", label: "关键内容" },
  { key: "doc-process", label: "文档处理" },
];

export const DOCK_ACTIVE_TAB_STORAGE_KEY = "doc-assistant.key-info-dock.active-tab";

export function isDockTabKey(value: unknown): value is DockTabKey {
  return value === "key-info" || value === "doc-process";
}

export function normalizeDockTabKey(value: unknown, fallback: DockTabKey = "key-info"): DockTabKey {
  return isDockTabKey(value) ? value : fallback;
}

export function loadPersistedDockActiveTab(storage: Pick<Storage, "getItem"> | null | undefined): DockTabKey {
  if (!storage || typeof storage.getItem !== "function") {
    return "key-info";
  }
  try {
    return normalizeDockTabKey(storage.getItem(DOCK_ACTIVE_TAB_STORAGE_KEY));
  } catch {
    return "key-info";
  }
}

export function savePersistedDockActiveTab(
  storage: Pick<Storage, "setItem"> | null | undefined,
  tab: DockTabKey
): void {
  if (!storage || typeof storage.setItem !== "function") {
    return;
  }
  try {
    storage.setItem(DOCK_ACTIVE_TAB_STORAGE_KEY, tab);
  } catch {
    // Ignore storage write errors so tab switching still works.
  }
}

const DOCK_ACTION_GROUP_LABELS: Record<DockDocActionGroup, string> = {
  export: "导出",
  insert: "插入",
  organize: "整理",
  ai: "AI",
  image: "图片",
  edit: "编辑",
};

export const DOC_READONLY_DISABLED_REASON = "当前文档已锁定，仅支持导出、筛选等只读操作";

export function buildDockDocActions<T extends string>(
  actions: DockDocActionSource<T>[],
  isMobile: boolean,
  menuRegistrationState: Partial<Record<T, boolean>> = {},
  docReadonly = false
): DockDocAction<T>[] {
  return actions.map((action) => {
    const disabledByMobile = Boolean(action.desktopOnly && isMobile);
    const disabledByReadonly = Boolean(action.requiresWritableDoc && docReadonly);
    const disabled = disabledByMobile || disabledByReadonly;
    const disabledReason = disabledByMobile
      ? "该操作当前仅支持桌面端"
      : disabledByReadonly
        ? DOC_READONLY_DISABLED_REASON
        : undefined;
    const menuRegistered = menuRegistrationState[action.key] !== false;
    return {
      key: action.key,
      label: action.commandText,
      tooltip: action.tooltip || action.commandText,
      icon: action.icon,
      ...(action.dockIconText ? { dockIconText: action.dockIconText } : {}),
      group: action.group,
      groupLabel: DOCK_ACTION_GROUP_LABELS[action.group],
      disabled,
      ...(action.runInBackground ? { runInBackground: true } : {}),
      menuRegistered,
      menuToggleDisabled: disabled,
      ...(disabledReason ? { disabledReason } : {}),
      ...(disabledReason ? { menuToggleDisabledReason: disabledReason } : {}),
    };
  });
}
