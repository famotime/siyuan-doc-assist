import {
  hasDocActionOrderChanged,
  moveDocActionToGroupEnd,
  normalizeDocActionsByGroup,
  reorderDocActionsWithinGroup,
  canDropDocActionWithinGroup,
  buildDocActionGroupMap
} from "@/core/dock-doc-action-order-core";
import { reorderFavoriteActionKeys, resolveInsertBeforeFromGeometry } from "@/core/dock-doc-action-drag-core";
import { DockDocAction } from "@/core/dock-panel-core";
import { formatActionTooltip, getActionDockIconTextByKey } from "@/plugin/actions";

type RenderDocActionsOptions = {
  container: HTMLDivElement;
  actions: DockDocAction[];
  favoriteActionKeys?: readonly string[];
  onDocActionClick?: (actionKey: string) => void | Promise<void>;
  runningActionKeys?: readonly string[];
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
const actionSearchKeywordsByContainer = new WeakMap<HTMLDivElement, string>();
// Drag state lives per container so a re-render while a drag is in flight
// (e.g. a background task finishing) keeps the drag working instead of
// silently resetting the gesture.
const dragStateByContainer = new WeakMap<
  HTMLDivElement,
  { draggingKey: string; draggingFavoriteKey: string }
>();

function getDragState(container: HTMLDivElement): {
  draggingKey: string;
  draggingFavoriteKey: string;
} {
  let existing = dragStateByContainer.get(container);
  if (!existing) {
    existing = { draggingKey: "", draggingFavoriteKey: "" };
    dragStateByContainer.set(container, existing);
  }
  return existing;
}

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

const GROUP_SVG_PATHS: Record<string, string> = {
  __favorite__:
    '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />',
  organize:
    '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" /><path d="M8 10v4" /><path d="M12 10v2" /><path d="M16 10v6" />',
  insert:
    '<path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M3 15h6" /><path d="M6 12v6" />',
  export:
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /><path d="M12 10v6" /><path d="m9 13 3-3 3 3" />',
  ai:
    '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /><path d="M20 3v4" /><path d="M22 5h-4" /><path d="M4 17v2" /><path d="M5 18H3" />',
  edit:
    '<path d="m18 5-2.414-2.414A2 2 0 0 0 14.172 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9.828a2 2 0 0 0-.586-1.414z" /><path d="M21.378 12.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" /><path d="M8 18h1" />',
  image:
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />'
};

function createGroupIconNode(groupKey: string): SVGSVGElement | null {
  const innerSvg = GROUP_SVG_PATHS[groupKey];
  if (!innerSvg) {
    return null;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("doc-assistant-keyinfo__action-separator-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute(
    "style",
    "fill: none !important; stroke: var(--doc-assistant-accent-strong, currentColor) !important; color: var(--doc-assistant-accent-strong, currentColor) !important;"
  );
  svg.innerHTML = innerSvg;
  return svg;
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
  const iconNode = createGroupIconNode(groupKey);
  const separatorLabel = document.createElement("span");
  separatorLabel.className = "doc-assistant-keyinfo__action-separator-label";
  separatorLabel.textContent = text;
  toggle.appendChild(toggleIcon);
  if (iconNode) {
    toggle.appendChild(iconNode);
  }
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
  return resolveInsertBeforeFromGeometry({
    top: rect.top,
    height: rect.height,
    clientY: event.clientY
  });
}

function clearContainerDropIndicators(container: HTMLDivElement): void {
  container
    .querySelectorAll(".doc-assistant-keyinfo__action-row.is-drop-before, .doc-assistant-keyinfo__action-row.is-drop-after")
    .forEach((node) => {
      node.classList.remove("is-drop-before", "is-drop-after");
    });
  container
    .querySelectorAll(".doc-assistant-keyinfo__action-separator.is-drop-target")
    .forEach((node) => {
      node.classList.remove("is-drop-target");
    });
}

function setActionButtonRunning(button: HTMLButtonElement, running: boolean): void {
  button.classList.toggle("is-running", running);
  button.setAttribute("aria-busy", running ? "true" : "false");
  let spinner = button.querySelector(".doc-assistant-keyinfo__action-running-spinner") as HTMLSpanElement | null;
  if (running) {
    if (!spinner) {
      spinner = document.createElement("span");
      spinner.className = "doc-assistant-keyinfo__action-running-spinner";
      spinner.setAttribute("aria-hidden", "true");
      button.appendChild(spinner);
    }
    return;
  }
  spinner?.remove();
}

function buildFavoriteButton(
  action: DockDocAction,
  isFavorited: boolean,
  onToggle?: (actionKey: string, favorited: boolean) => void
): HTMLButtonElement {
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
    onToggle?.(action.key, !isFavorited);
  });
  return favoriteButton;
}

function buildActionButton(
  action: DockDocAction,
  params: {
    running: boolean;
    selectionPreservedActionKeys: ReadonlySet<string>;
    onDocActionClick?: (actionKey: string) => void | Promise<void>;
  }
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "b3-button doc-assistant-keyinfo__action-btn";

  const iconWrap = document.createElement("span");
  iconWrap.className = "doc-assistant-keyinfo__action-icon";
  iconWrap.appendChild(createActionIconNode(action));

  const label = document.createElement("span");
  label.className = "doc-assistant-keyinfo__action-label";
  label.textContent = action.label;

  button.append(iconWrap, label);
  button.disabled = action.disabled;
  button.title = formatActionTooltip(action.tooltip, action.label, action.disabledReason);
  setActionButtonRunning(button, params.running);
  button.addEventListener("mousedown", (event) => {
    if (params.selectionPreservedActionKeys.has(action.key)) {
      event.preventDefault();
    }
  });
  button.addEventListener("click", () => {
    if (action.disabled) {
      return;
    }
    const result = params.onDocActionClick?.(action.key);
    if (action.runInBackground && result && typeof result.then === "function") {
      setActionButtonRunning(button, true);
      result.finally(() => {
        setActionButtonRunning(button, false);
      });
    }
  });
  return button;
}

function bindSortableRowDragEvents(params: {
  row: HTMLDivElement;
  targetKey: string;
  transferPayload: string;
  onDragStart: () => void;
  onDragEnd: () => void;
  resolveSourceKey: (event: DragEvent) => string;
  canDrop: (sourceKey: string, targetKey: string) => boolean;
  onDrop: (sourceKey: string, insertBefore: boolean) => void;
  clearDropIndicator: () => void;
}): void {
  const { row, targetKey, clearDropIndicator } = params;
  row.draggable = true;

  row.addEventListener("dragstart", (event) => {
    params.onDragStart();
    row.classList.add("is-dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", params.transferPayload);
    }
  });

  row.addEventListener("dragend", () => {
    params.onDragEnd();
    row.classList.remove("is-dragging");
    clearDropIndicator();
  });

  row.addEventListener("dragover", (event) => {
    const sourceKey = params.resolveSourceKey(event as DragEvent);
    if (!params.canDrop(sourceKey, targetKey)) {
      clearDropIndicator();
      return;
    }
    event.preventDefault();
    clearDropIndicator();
    row.classList.add(
      resolveInsertBefore(row, event as DragEvent) ? "is-drop-before" : "is-drop-after"
    );
  });

  row.addEventListener("dragleave", () => {
    row.classList.remove("is-drop-before", "is-drop-after");
  });

  row.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceKey = params.resolveSourceKey(event as DragEvent);
    if (!params.canDrop(sourceKey, targetKey)) {
      clearDropIndicator();
      return;
    }
    params.onDrop(sourceKey, resolveInsertBefore(row, event as DragEvent));
    clearDropIndicator();
  });
}

function buildActionSearchBox(params: {
  container: HTMLDivElement;
  searchKeyword: string;
  onRerender: () => void;
}): HTMLDivElement {
  const { container, searchKeyword, onRerender } = params;
  const wrapper = document.createElement("div");
  wrapper.className = "doc-assistant-keyinfo__action-search";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "doc-assistant-keyinfo__action-search-input";
  input.placeholder = "搜索命令…";
  input.value = searchKeyword;
  let isComposing = false;
  const triggerSearch = () => {
    actionSearchKeywordsByContainer.set(container, input.value);
    onRerender();
  };
  input.addEventListener("compositionstart", () => {
    isComposing = true;
  });
  input.addEventListener("compositionend", () => {
    isComposing = false;
    triggerSearch();
  });
  input.addEventListener("input", () => {
    if (!isComposing) {
      triggerSearch();
    }
  });
  wrapper.appendChild(input);
  if (searchKeyword) {
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "doc-assistant-keyinfo__action-search-clear";
    clearBtn.textContent = "×";
    clearBtn.title = "清除搜索";
    clearBtn.addEventListener("click", () => {
      actionSearchKeywordsByContainer.set(container, "");
      onRerender();
    });
    wrapper.appendChild(clearBtn);
  }
  return wrapper;
}

export function renderKeyInfoDockDocActions(options: RenderDocActionsOptions) {
  const {
    container,
    actions,
    favoriteActionKeys = [],
    onDocActionClick,
    runningActionKeys = [],
    onDocActionFavoriteToggle,
    onFavoriteActionsReorder,
    onDocActionsReorder,
    selectionPreservedActionKeys = new Set<string>()
  } = options;

  const clearDropIndicator = () => clearContainerDropIndicators(container);
  const rerender = () => renderKeyInfoDockDocActions(options);

  const docActions = normalizeDocActionsByGroup(actions);
  const docActionMap = new Map(docActions.map((action) => [action.key, action]));
  const actionGroupMap = buildDocActionGroupMap(docActions);
  const favoriteActionSet = new Set(favoriteActionKeys);
  const runningActionSet = new Set(runningActionKeys);
  const collapsedGroups = getCollapsedDocActionGroups(container);
  const dragState = getDragState(container);

  const toggleGroup = (groupKey: string) => {
    if (collapsedGroups.has(groupKey)) {
      collapsedGroups.delete(groupKey);
    } else {
      collapsedGroups.add(groupKey);
    }
    rerender();
  };

  const updateDocActionOrder = (next: DockDocAction[]) => {
    if (hasDocActionOrderChanged(docActions, next)) {
      onDocActionsReorder?.(next);
    }
  };

  const resolveSourceKey = (event: DragEvent) =>
    dragState.draggingKey || (event.dataTransfer?.getData("text/plain") || "").trim();
  const resolveFavoriteSourceKey = (event: DragEvent) => {
    if (dragState.draggingFavoriteKey) {
      return dragState.draggingFavoriteKey;
    }
    const raw = (event.dataTransfer?.getData("text/plain") || "").trim();
    return raw.startsWith("favorite:") ? raw.slice("favorite:".length) : "";
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

  const buildActionRow = (
    action: DockDocAction,
    rowOptions: { favoriteCopy: boolean }
  ): HTMLDivElement => {
    const row = document.createElement("div");
    row.className = "doc-assistant-keyinfo__action-row";
    row.dataset.actionKey = action.key;
    row.dataset.favoriteCopy = rowOptions.favoriteCopy ? "true" : "false";

    const dragHandle = document.createElement("span");
    dragHandle.className = "doc-assistant-keyinfo__action-drag-handle";
    dragHandle.textContent = "⋮⋮";
    dragHandle.title = rowOptions.favoriteCopy ? "拖动收藏排序" : "拖动排序";
    dragHandle.setAttribute("aria-hidden", "true");

    const favoriteButton = buildFavoriteButton(
      action,
      favoriteActionSet.has(action.key),
      onDocActionFavoriteToggle
    );
    const actionButton = buildActionButton(action, {
      running: Boolean(action.runInBackground && runningActionSet.has(action.key)),
      selectionPreservedActionKeys,
      onDocActionClick
    });

    if (rowOptions.favoriteCopy) {
      bindSortableRowDragEvents({
        row,
        targetKey: action.key,
        transferPayload: `favorite:${action.key}`,
        onDragStart: () => {
          dragState.draggingFavoriteKey = action.key;
        },
        onDragEnd: () => {
          dragState.draggingFavoriteKey = "";
        },
        resolveSourceKey: resolveFavoriteSourceKey,
        canDrop: canDropToFavoriteTarget,
        onDrop: (sourceKey, insertBefore) => {
          const next = reorderFavoriteActionKeys(
            favoriteActionKeys,
            sourceKey,
            action.key,
            insertBefore
          );
          onFavoriteActionsReorder?.(next);
        },
        clearDropIndicator
      });
    } else {
      bindSortableRowDragEvents({
        row,
        targetKey: action.key,
        transferPayload: action.key,
        onDragStart: () => {
          dragState.draggingKey = action.key;
        },
        onDragEnd: () => {
          dragState.draggingKey = "";
        },
        resolveSourceKey,
        canDrop: canDropToTarget,
        onDrop: (sourceKey, insertBefore) => {
          const next = reorderDocActionsWithinGroup(
            docActions,
            sourceKey,
            action.key,
            insertBefore
          );
          updateDocActionOrder(next);
        },
        clearDropIndicator
      });
    }

    row.append(dragHandle, favoriteButton, actionButton);
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
  fragment.appendChild(
    buildGroupLabel({
      text: "收藏",
      groupKey: FAVORITE_DOC_ACTION_GROUP_KEY,
      collapsed: favoriteCollapsed,
      onToggle: () => toggleGroup(FAVORITE_DOC_ACTION_GROUP_KEY)
    })
  );
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

  const searchKeyword = (actionSearchKeywordsByContainer.get(container) || "").trim();
  fragment.appendChild(
    buildActionSearchBox({
      container,
      searchKeyword,
      onRerender: rerender
    })
  );

  const lowerKeyword = searchKeyword.toLowerCase();
  const matchesKeyword = (action: DockDocAction): boolean => {
    if (!lowerKeyword) {
      return true;
    }
    const label = (action.label || "").toLowerCase();
    const tooltip = (action.tooltip || "").toLowerCase();
    return label.includes(lowerKeyword) || tooltip.includes(lowerKeyword);
  };

  let previousGroup = "";
  let hasVisibleAction = false;
  docActions.forEach((action) => {
    if (!previousGroup || previousGroup !== action.group) {
      if (lowerKeyword && !collapsedGroups.has(action.group)) {
        const groupHasMatch = docActions.some(
          (a) => a.group === action.group && matchesKeyword(a)
        );
        if (!groupHasMatch) {
          previousGroup = action.group;
          return;
        }
      }
      const separator = buildGroupLabel({
        text: action.groupLabel,
        groupKey: action.group,
        collapsed: collapsedGroups.has(action.group),
        onToggle: () => toggleGroup(action.group)
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
    if (collapsedGroups.has(action.group) || !matchesKeyword(action)) {
      previousGroup = action.group;
      return;
    }
    hasVisibleAction = true;
    fragment.appendChild(buildActionRow(action, { favoriteCopy: false }));
    previousGroup = action.group;
  });

  if (lowerKeyword && !hasVisibleAction) {
    const noResult = document.createElement("div");
    noResult.className = "doc-assistant-keyinfo__action-no-result ft__secondary";
    noResult.textContent = `未找到匹配"${searchKeyword}"的命令`;
    fragment.appendChild(noResult);
  }

  const wasSearchFocused = !!container.querySelector(".doc-assistant-keyinfo__action-search-input:focus");
  container.replaceChildren(fragment);
  if (wasSearchFocused) {
    const newInput = container.querySelector<HTMLInputElement>(".doc-assistant-keyinfo__action-search-input");
    if (newInput) {
      newInput.focus();
      newInput.setSelectionRange(newInput.value.length, newInput.value.length);
    }
  }

  container.ondragover = (event) => {
    if (dragState.draggingKey) {
      event.preventDefault();
    }
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
