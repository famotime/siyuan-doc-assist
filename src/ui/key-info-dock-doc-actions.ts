import {
  hasDocActionOrderChanged,
  moveDocActionToGroupEnd,
  normalizeDocActionsByGroup,
  reorderDocActionsWithinGroup,
  canDropDocActionWithinGroup,
  buildDocActionGroupMap,
} from "@/core/dock-doc-action-order-core";
import { DockDocAction } from "@/core/dock-panel-core";
import { formatActionTooltip, getActionDockIconTextByKey } from "@/plugin/actions";

type RenderDocActionsOptions = {
  container: HTMLDivElement;
  actions: DockDocAction[];
  favoriteActionKeys?: readonly string[];
  onDocActionClick?: (actionKey: string) => void;
  onDocActionFavoriteToggle?: (actionKey: string, favorited: boolean) => void;
  onFavoriteActionsReorder?: (actionKeys: string[]) => void;
  onDocActionsReorder?: (actions: DockDocAction[]) => void;
  selectionPreservedActionKeys?: ReadonlySet<string>;
};

const FAVORITE_DOC_ACTION_GROUP_KEY = "__favorite__";
const collapsedDocActionGroupsByContainer = new WeakMap<
  HTMLDivElement,
  Set<string>
>();

function resolveActionIconText(action: DockDocAction): string {
  const preset = action.dockIconText || getActionDockIconTextByKey(action.key);
  if (preset) {
    return preset;
  }
  const label = (action.label || "").trim();
  return label ? label[0] : "•";
}

function hasSvgSymbol(iconId: string): boolean {
  if (!iconId) {
    return false;
  }
  return !!document.getElementById(iconId);
}

function createActionIconNode(action: DockDocAction): SVGSVGElement | HTMLSpanElement {
  if (hasSvgSymbol(action.icon)) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("doc-assistant-keyinfo__action-icon-svg");
    svg.setAttribute("aria-hidden", "true");
    const useNode = document.createElementNS("http://www.w3.org/2000/svg", "use");
    const href = `#${action.icon}`;
    useNode.setAttribute("href", href);
    useNode.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", href);
    svg.appendChild(useNode);
    return svg;
  }
  const iconText = document.createElement("span");
  iconText.className = "doc-assistant-keyinfo__action-icon-text";
  iconText.textContent = resolveActionIconText(action);
  return iconText;
}

function getCollapsedDocActionGroups(container: HTMLDivElement): Set<string> {
  const existing = collapsedDocActionGroupsByContainer.get(container);
  if (existing) {
    return existing;
  }
  const next = new Set<string>();
  collapsedDocActionGroupsByContainer.set(container, next);
  return next;
}

function buildGroupLabel(options: {
  text: string;
  groupKey: string;
  collapsed: boolean;
  onToggle: () => void;
}): HTMLDivElement {
  const { text, groupKey, collapsed, onToggle } = options;
  const separator = document.createElement("div");
  separator.className = "doc-assistant-keyinfo__action-separator";
  separator.dataset.groupKey = groupKey;
  separator.classList.toggle("is-collapsed", collapsed);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "doc-assistant-keyinfo__action-separator-toggle";
  toggle.classList.toggle("is-collapsed", collapsed);
  toggle.setAttribute("aria-expanded", String(!collapsed));
  const toggleIcon = document.createElement("span");
  toggleIcon.className = "doc-assistant-keyinfo__action-separator-toggle-icon";
  toggleIcon.textContent = collapsed ? "+" : "-";
  const separatorLabel = document.createElement("span");
  separatorLabel.className = "doc-assistant-keyinfo__action-separator-label";
  separatorLabel.textContent = text;
  toggle.appendChild(toggleIcon);
  toggle.appendChild(separatorLabel);
  toggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onToggle();
  });
  separator.appendChild(toggle);
  return separator;
}

function resolveInsertBefore(row: HTMLDivElement, event: DragEvent): boolean {
  const rect = row.getBoundingClientRect();
  if (!rect.height || Number.isNaN(event.clientY)) {
    return false;
  }
  const centerY = rect.top + rect.height / 2;
  return event.clientY < centerY;
}

function reorderFavoriteActionKeys(
  order: readonly string[],
  sourceKey: string,
  targetKey: string,
  insertBefore: boolean
): string[] {
  if (!sourceKey || !targetKey || sourceKey === targetKey) {
    return [...order];
  }
  const sourceIndex = order.indexOf(sourceKey);
  const targetIndex = order.indexOf(targetKey);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return [...order];
  }
  const next = [...order];
  const [dragged] = next.splice(sourceIndex, 1);
  if (!dragged) {
    return [...order];
  }
  const currentTargetIndex = next.indexOf(targetKey);
  if (currentTargetIndex < 0) {
    return [...order];
  }
  const insertIndex = insertBefore ? currentTargetIndex : currentTargetIndex + 1;
  next.splice(insertIndex, 0, dragged);
  return next;
}

export function renderKeyInfoDockDocActions({
  container,
  actions,
  favoriteActionKeys = [],
  onDocActionClick,
  onDocActionFavoriteToggle,
  onFavoriteActionsReorder,
  onDocActionsReorder,
  selectionPreservedActionKeys = new Set<string>(),
}: RenderDocActionsOptions) {
  const clearDropIndicator = () => {
    container
      .querySelectorAll(".doc-assistant-keyinfo__action-row.is-drop-before, .doc-assistant-keyinfo__action-row.is-drop-after")
      .forEach((node) => {
        node.classList.remove("is-drop-before");
        node.classList.remove("is-drop-after");
      });
    container
      .querySelectorAll(".doc-assistant-keyinfo__action-separator.is-drop-target")
      .forEach((node) => {
        node.classList.remove("is-drop-target");
      });
  };

  const docActions = normalizeDocActionsByGroup(actions);
  const docActionMap = new Map(docActions.map((action) => [action.key, action]));
  const actionGroupMap = buildDocActionGroupMap(docActions);
  const favoriteActionSet = new Set(favoriteActionKeys);
  const collapsedGroups = getCollapsedDocActionGroups(container);
  const toggleGroup = (groupKey: string) => {
    if (collapsedGroups.has(groupKey)) {
      collapsedGroups.delete(groupKey);
    } else {
      collapsedGroups.add(groupKey);
    }
    renderKeyInfoDockDocActions({
      container,
      actions,
      favoriteActionKeys,
      onDocActionClick,
      onDocActionFavoriteToggle,
      onFavoriteActionsReorder,
      onDocActionsReorder,
      selectionPreservedActionKeys,
    });
  };

  const updateDocActionOrder = (next: DockDocAction[]) => {
    if (!hasDocActionOrderChanged(docActions, next)) {
      return;
    }
    onDocActionsReorder?.(next);
  };

  let draggingKey = "";
  let draggingFavoriteKey = "";
  const resolveSourceKey = (event: DragEvent) =>
    draggingKey ||
    (event.dataTransfer?.getData("text/plain") || "").trim();
  const resolveFavoriteSourceKey = (event: DragEvent) => {
    if (draggingFavoriteKey) {
      return draggingFavoriteKey;
    }
    const raw = (event.dataTransfer?.getData("text/plain") || "").trim();
    if (!raw.startsWith("favorite:")) {
      return "";
    }
    return raw.slice("favorite:".length);
  };
  const canDropToTarget = (sourceKey: string, targetKey: string) =>
    canDropDocActionWithinGroup(actionGroupMap, sourceKey, targetKey);
  const canDropToFavoriteTarget = (sourceKey: string, targetKey: string) =>
    Boolean(
      sourceKey &&
        targetKey &&
        sourceKey !== targetKey &&
        favoriteActionSet.has(sourceKey) &&
        favoriteActionSet.has(targetKey)
    );

  const buildFavoriteButton = (
    action: DockDocAction,
    isFavorited: boolean
  ): HTMLButtonElement => {
    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = "b3-button b3-button--small doc-assistant-keyinfo__action-favorite-btn";
    if (isFavorited) {
      favoriteButton.classList.add("is-active");
    }
    favoriteButton.textContent = isFavorited ? "★" : "☆";
    favoriteButton.title = isFavorited ? "取消收藏" : "收藏到快捷区";
    favoriteButton.setAttribute("aria-label", favoriteButton.title);
    favoriteButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onDocActionFavoriteToggle?.(action.key, !isFavorited);
    });
    return favoriteButton;
  };

  const buildActionButton = (action: DockDocAction): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "b3-button doc-assistant-keyinfo__action-btn";

    const iconWrap = document.createElement("span");
    iconWrap.className = "doc-assistant-keyinfo__action-icon";
    iconWrap.appendChild(createActionIconNode(action));

    const label = document.createElement("span");
    label.className = "doc-assistant-keyinfo__action-label";
    label.textContent = action.label;

    button.appendChild(iconWrap);
    button.appendChild(label);
    button.disabled = action.disabled;
    button.title = formatActionTooltip(action.tooltip, action.label, action.disabledReason);
    button.addEventListener("mousedown", (event) => {
      if (!selectionPreservedActionKeys.has(action.key)) {
        return;
      }
      event.preventDefault();
    });
    button.addEventListener("click", () => {
      if (action.disabled) {
        return;
      }
      onDocActionClick?.(action.key);
    });
    return button;
  };

  const buildActionRow = (
    action: DockDocAction,
    options: { favoriteCopy: boolean }
  ): HTMLDivElement => {
    const row = document.createElement("div");
    row.className = "doc-assistant-keyinfo__action-row";
    row.dataset.actionKey = action.key;
    row.dataset.favoriteCopy = options.favoriteCopy ? "true" : "false";

    const favoriteButton = buildFavoriteButton(
      action,
      favoriteActionSet.has(action.key)
    );
    const actionButton = buildActionButton(action);

    if (options.favoriteCopy) {
      row.draggable = true;
      const dragHandle = document.createElement("span");
      dragHandle.className = "doc-assistant-keyinfo__action-drag-handle";
      dragHandle.textContent = "⋮⋮";
      dragHandle.title = "拖动收藏排序";
      dragHandle.setAttribute("aria-hidden", "true");

      row.addEventListener("dragstart", (event) => {
        draggingFavoriteKey = action.key;
        row.classList.add("is-dragging");
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", `favorite:${action.key}`);
        }
      });

      row.addEventListener("dragend", () => {
        draggingFavoriteKey = "";
        row.classList.remove("is-dragging");
        clearDropIndicator();
      });

      row.addEventListener("dragover", (event) => {
        const sourceKey = resolveFavoriteSourceKey(event as DragEvent);
        if (!canDropToFavoriteTarget(sourceKey, action.key)) {
          clearDropIndicator();
          return;
        }
        event.preventDefault();
        clearDropIndicator();
        if (resolveInsertBefore(row, event as DragEvent)) {
          row.classList.add("is-drop-before");
        } else {
          row.classList.add("is-drop-after");
        }
      });

      row.addEventListener("dragleave", () => {
        row.classList.remove("is-drop-before");
        row.classList.remove("is-drop-after");
      });

      row.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const sourceKey = resolveFavoriteSourceKey(event as DragEvent);
        if (!canDropToFavoriteTarget(sourceKey, action.key)) {
          clearDropIndicator();
          return;
        }
        const next = reorderFavoriteActionKeys(
          favoriteActionKeys,
          sourceKey,
          action.key,
          resolveInsertBefore(row, event as DragEvent)
        );
        onFavoriteActionsReorder?.(next);
        clearDropIndicator();
      });

      row.appendChild(dragHandle);
      row.appendChild(favoriteButton);
      row.appendChild(actionButton);
      return row;
    }

    row.draggable = true;
    const dragHandle = document.createElement("span");
    dragHandle.className = "doc-assistant-keyinfo__action-drag-handle";
    dragHandle.textContent = "⋮⋮";
    dragHandle.title = "拖动排序";
    dragHandle.setAttribute("aria-hidden", "true");

    row.addEventListener("dragstart", (event) => {
      draggingKey = action.key;
      row.classList.add("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", action.key);
      }
    });

    row.addEventListener("dragend", () => {
      draggingKey = "";
      row.classList.remove("is-dragging");
      clearDropIndicator();
    });

    row.addEventListener("dragover", (event) => {
      const sourceKey = resolveSourceKey(event as DragEvent);
      if (!canDropToTarget(sourceKey, action.key)) {
        clearDropIndicator();
        return;
      }
      event.preventDefault();
      clearDropIndicator();
      if (resolveInsertBefore(row, event as DragEvent)) {
        row.classList.add("is-drop-before");
      } else {
        row.classList.add("is-drop-after");
      }
    });

    row.addEventListener("dragleave", () => {
      row.classList.remove("is-drop-before");
      row.classList.remove("is-drop-after");
    });

    row.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const sourceKey = resolveSourceKey(event as DragEvent);
      if (!canDropToTarget(sourceKey, action.key)) {
        clearDropIndicator();
        return;
      }
      const next = reorderDocActionsWithinGroup(
        docActions,
        sourceKey,
        action.key,
        resolveInsertBefore(row, event as DragEvent)
      );
      updateDocActionOrder(next);
      clearDropIndicator();
    });

    row.appendChild(dragHandle);
    row.appendChild(favoriteButton);
    row.appendChild(actionButton);
    return row;
  };

  if (!docActions.length) {
    const empty = document.createElement("div");
    empty.className = "doc-assistant-keyinfo__empty ft__secondary";
    empty.textContent = "暂无文档处理命令";
    container.replaceChildren(empty);
    container.ondragover = null;
    container.ondrop = null;
    return;
  }

  const fragment = document.createDocumentFragment();
  const favoriteCollapsed = collapsedGroups.has(FAVORITE_DOC_ACTION_GROUP_KEY);
  const favoriteSeparator = buildGroupLabel({
    text: "收藏",
    groupKey: FAVORITE_DOC_ACTION_GROUP_KEY,
    collapsed: favoriteCollapsed,
    onToggle: () => {
      toggleGroup(FAVORITE_DOC_ACTION_GROUP_KEY);
    },
  });
  fragment.appendChild(favoriteSeparator);
  if (!favoriteCollapsed) {
    const favoriteActions = favoriteActionKeys
      .map((key) => docActionMap.get(key))
      .filter((action): action is DockDocAction => Boolean(action));
    if (favoriteActions.length) {
      favoriteActions.forEach((action) => {
        fragment.appendChild(buildActionRow(action, { favoriteCopy: true }));
      });
    } else {
      const emptyFavorite = document.createElement("div");
      emptyFavorite.className =
        "doc-assistant-keyinfo__action-favorite-empty ft__secondary";
      emptyFavorite.textContent = "暂无收藏命令";
      fragment.appendChild(emptyFavorite);
    }
  }

  let previousGroup = "";
  docActions.forEach((action) => {
    if (!previousGroup || previousGroup !== action.group) {
      const separator = buildGroupLabel({
        text: action.groupLabel,
        groupKey: action.group,
        collapsed: collapsedGroups.has(action.group),
        onToggle: () => {
          toggleGroup(action.group);
        },
      });
      separator.addEventListener("dragover", (event) => {
        const sourceKey = resolveSourceKey(event as DragEvent);
        if (!canDropToTarget(sourceKey, action.key)) {
          clearDropIndicator();
          return;
        }
        event.preventDefault();
        clearDropIndicator();
        separator.classList.add("is-drop-target");
      });
      separator.addEventListener("dragleave", () => {
        separator.classList.remove("is-drop-target");
      });
      separator.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const sourceKey = resolveSourceKey(event as DragEvent);
        if (!canDropToTarget(sourceKey, action.key)) {
          clearDropIndicator();
          return;
        }
        const next = reorderDocActionsWithinGroup(docActions, sourceKey, action.key, true);
        updateDocActionOrder(next);
        clearDropIndicator();
      });
      fragment.appendChild(separator);
    }
    if (collapsedGroups.has(action.group)) {
      previousGroup = action.group;
      return;
    }
    fragment.appendChild(buildActionRow(action, { favoriteCopy: false }));
    previousGroup = action.group;
  });

  container.replaceChildren(fragment);

  container.ondragover = (event) => {
    if (!draggingKey) {
      return;
    }
    event.preventDefault();
  };

  container.ondrop = (event) => {
    event.preventDefault();
    if (event.target instanceof Element && event.target !== container) {
      clearDropIndicator();
      return;
    }
    const sourceKey = resolveSourceKey(event as DragEvent);
    if (!sourceKey) {
      clearDropIndicator();
      return;
    }
    const next = moveDocActionToGroupEnd(docActions, sourceKey);
    updateDocActionOrder(next);
    clearDropIndicator();
  };
}
