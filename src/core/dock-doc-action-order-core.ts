import { DockDocAction } from "@/core/dock-panel-core";

export function normalizeDocActionsByGroup(
  actions: DockDocAction[]
): DockDocAction[] {
  const groupOrder: string[] = [];
  const grouped = new Map<string, DockDocAction[]>();
  actions.forEach((action) => {
    if (!grouped.has(action.group)) {
      grouped.set(action.group, []);
      groupOrder.push(action.group);
    }
    grouped.get(action.group)?.push(action);
  });
  const normalized: DockDocAction[] = [];
  groupOrder.forEach((group) => {
    const entries = grouped.get(group);
    if (!entries?.length) {
      return;
    }
    normalized.push(...entries);
  });
  return normalized;
}

export function buildDocActionGroupMap(
  actions: DockDocAction[]
): Map<string, string> {
  return new Map(actions.map((action) => [action.key, action.group]));
}

export function canDropDocActionWithinGroup(
  groupMap: Map<string, string>,
  sourceKey: string,
  targetKey: string
): boolean {
  if (!sourceKey || sourceKey === targetKey) {
    return false;
  }
  const sourceGroup = groupMap.get(sourceKey);
  const targetGroup = groupMap.get(targetKey);
  return Boolean(sourceGroup && targetGroup && sourceGroup === targetGroup);
}

export function reorderDocActionsWithinGroup(
  actions: DockDocAction[],
  sourceKey: string,
  targetKey: string,
  insertBefore: boolean
): DockDocAction[] {
  const groupMap = buildDocActionGroupMap(actions);
  if (!canDropDocActionWithinGroup(groupMap, sourceKey, targetKey)) {
    return actions;
  }
  const sourceIndex = actions.findIndex((action) => action.key === sourceKey);
  const targetIndex = actions.findIndex((action) => action.key === targetKey);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return actions;
  }
  const next = [...actions];
  const [dragged] = next.splice(sourceIndex, 1);
  const currentTargetIndex = next.findIndex((action) => action.key === targetKey);
  if (currentTargetIndex < 0 || !dragged) {
    return actions;
  }
  const insertIndex = insertBefore ? currentTargetIndex : currentTargetIndex + 1;
  next.splice(insertIndex, 0, dragged);
  return next;
}

export function moveDocActionToGroupEnd(
  actions: DockDocAction[],
  sourceKey: string
): DockDocAction[] {
  const groupMap = buildDocActionGroupMap(actions);
  const sourceGroup = groupMap.get(sourceKey);
  if (!sourceGroup) {
    return actions;
  }
  const sourceIndex = actions.findIndex((action) => action.key === sourceKey);
  if (sourceIndex < 0) {
    return actions;
  }
  let lastInGroupIndex = -1;
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    if (actions[index]?.group === sourceGroup) {
      lastInGroupIndex = index;
      break;
    }
  }
  if (lastInGroupIndex < 0 || sourceIndex === lastInGroupIndex) {
    return actions;
  }
  const next = [...actions];
  const [dragged] = next.splice(sourceIndex, 1);
  if (!dragged) {
    return actions;
  }
  const insertIndex = sourceIndex < lastInGroupIndex ? lastInGroupIndex : lastInGroupIndex + 1;
  next.splice(insertIndex, 0, dragged);
  return next;
}

export function hasDocActionOrderChanged(
  current: DockDocAction[],
  next: DockDocAction[]
): boolean {
  return (
    current.length !== next.length ||
    next.some((action, index) => action.key !== current[index]?.key)
  );
}
