import {
  hasDocActionOrderChanged,
  moveDocActionToGroupEnd,
  normalizeDocActionsByGroup,
  reorderDocActionsWithinGroup,
  canDropDocActionWithinGroup,
  buildDocActionGroupMap,
} from "@/core/dock-doc-action-order-core";
import { DockDocAction } from "@/core/dock-panel-core";

type RenderDocActionsOptions = {
  container: HTMLDivElement;
  actions: DockDocAction[];
  onDocActionClick?: (actionKey: string) => void;
  onDocActionMenuToggle?: (actionKey: string, enabled: boolean) => void;
  onDocActionsReorder?: (actions: DockDocAction[]) => void;
  selectionPreservedActionKeys?: ReadonlySet<string>;
};

const ACTION_ICON_TEXT: Record<string, string> = {
  "export-current": "导",
  "export-backlinks-zip": "反",
  "export-forward-zip": "正",
  "move-backlinks": "移",
  dedupe: "重",
  "insert-backlinks": "反",
  "insert-child-docs": "子",
  "insert-blank-before-headings": "空",
  "bold-selected-blocks": "粗",
  "highlight-selected-blocks": "亮",
  "remove-extra-blank-lines": "空",
  "trim-trailing-whitespace": "尾",
  "delete-from-current-to-end": "删",
};

function resolveActionIconText(action: DockDocAction): string {
  const preset = ACTION_ICON_TEXT[action.key];
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

function buildGroupLabel(text: string): HTMLDivElement {
  const separator = document.createElement("div");
  separator.className = "doc-assistant-keyinfo__action-separator";
  const separatorLabel = document.createElement("span");
  separatorLabel.className = "doc-assistant-keyinfo__action-separator-label";
  separatorLabel.textContent = text;
  separator.appendChild(separatorLabel);
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

export function renderKeyInfoDockDocActions({
  container,
  actions,
  onDocActionClick,
  onDocActionMenuToggle,
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
  const actionGroupMap = buildDocActionGroupMap(docActions);

  const updateDocActionOrder = (next: DockDocAction[]) => {
    if (!hasDocActionOrderChanged(docActions, next)) {
      return;
    }
    onDocActionsReorder?.(next);
  };

  let draggingKey = "";
  const resolveSourceKey = (event: DragEvent) =>
    draggingKey ||
    (event.dataTransfer?.getData("text/plain") || "").trim();
  const canDropToTarget = (sourceKey: string, targetKey: string) =>
    canDropDocActionWithinGroup(actionGroupMap, sourceKey, targetKey);

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
  let previousGroup = "";
  docActions.forEach((action) => {
    if (!previousGroup || previousGroup !== action.group) {
      const separator = buildGroupLabel(action.groupLabel);
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

    const row = document.createElement("div");
    row.className = "doc-assistant-keyinfo__action-row";
    row.dataset.actionKey = action.key;
    row.draggable = true;

    const dragHandle = document.createElement("span");
    dragHandle.className = "doc-assistant-keyinfo__action-drag-handle";
    dragHandle.textContent = "⋮⋮";
    dragHandle.title = "拖动排序";
    dragHandle.setAttribute("aria-hidden", "true");

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
    if (action.disabledReason) {
      button.title = action.disabledReason;
    }
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

    const menuSwitch = document.createElement("input");
    menuSwitch.type = "checkbox";
    menuSwitch.className = "doc-assistant-keyinfo__action-switch";
    menuSwitch.checked = action.menuRegistered;
    menuSwitch.disabled = action.menuToggleDisabled;
    if (action.menuToggleDisabledReason) {
      menuSwitch.title = action.menuToggleDisabledReason;
    }
    menuSwitch.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    menuSwitch.addEventListener("change", (event) => {
      event.stopPropagation();
      onDocActionMenuToggle?.(action.key, menuSwitch.checked);
    });

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
    row.appendChild(button);
    row.appendChild(menuSwitch);
    fragment.appendChild(row);
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
