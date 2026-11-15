import { filterDocMenuActions } from "@/core/doc-menu-registration-core";
import { ActionConfig, ActionKey } from "@/plugin/actions";
import { ProtyleLike } from "@/plugin/doc-context";
import { extractFloatingMarkdownFromSelection } from "@/services/floating-text/floating-selection-helper";

type EditorTitleMenu = {
  addSeparator: () => void;
  addItem: (config: { icon: string; label: string; click: () => void }) => void;
};

type SimpleMenu = {
  addItem: (config: { icon: string; label: string; click: () => void }) => void;
};

type RegisterCommand = (config: {
  langKey: string;
  langText: string;
  hotkey: string;
  callback: () => void;
  editorCallback: (protyle: unknown) => void;
}) => void;

type RunAction = (
  action: ActionKey,
  explicitId?: string,
  protyle?: ProtyleLike
) => Promise<void> | void;

export function populateEditorTitleMenu(options: {
  menu?: EditorTitleMenu;
  docId?: string;
  protyle?: ProtyleLike;
  actions: ActionConfig[];
  docMenuRegistrationState: Record<ActionKey, boolean>;
  docActionEnabledState?: Record<ActionKey, boolean>;
  runAction: RunAction;
}): boolean {
  const {
    menu,
    docId,
    protyle,
    actions,
    docMenuRegistrationState,
    docActionEnabledState,
    runAction,
  } = options;
  if (!menu || !docId) {
    return false;
  }

  const menuActions = filterDocMenuActions(
    actions,
    docMenuRegistrationState,
    docActionEnabledState
  );
  if (!menuActions.length) {
    return false;
  }

  menu.addSeparator();
  for (const action of menuActions) {
    menu.addItem({
      icon: action.icon,
      label: action.menuText,
      click: () => {
        void runAction(action.key, docId, protyle);
      },
    });
  }
  return true;
}

export function registerPluginCommands(options: {
  actions: ActionConfig[];
  register: RegisterCommand;
  runAction: RunAction;
}) {
  const { actions, register, runAction } = options;
  for (const action of actions) {
    register({
      langKey: `docLinkToolkit.${action.key}`,
      langText: action.commandText,
      hotkey: "",
      callback: () => {
        void runAction(action.key);
      },
      editorCallback: (protyle: unknown) => {
        void runAction(action.key, undefined, protyle as ProtyleLike);
      },
    });
  }
}

/**
 * 「悬浮选中文本」菜单项是否被 alpha 隐藏配置或启停状态关闭
 */
export function isFloatSelectedTextHidden(
  hiddenKeys: Set<string>,
  docActionEnabledState?: Record<ActionKey, boolean>
): boolean {
  return (
    hiddenKeys.has("float-selected-text") ||
    docActionEnabledState?.["float-selected-text"] === false
  );
}

/**
 * 内容右键菜单：追加「悬浮选中文本」菜单项
 * 从显式 range 或当前窗口选区读取文本；空选区不追加
 */
export function addFloatSelectedTextContentMenuItem(options: {
  menu?: SimpleMenu;
  protyle?: ProtyleLike;
  range?: Range;
  openFloatingText: (text: string) => void;
}): boolean {
  const { menu, protyle, range, openFloatingText } = options;
  if (!menu) {
    return false;
  }
  const selectedText = range
    ? range.toString()
    : typeof window !== "undefined"
    ? window.getSelection()?.toString() || ""
    : "";
  if (!selectedText.trim()) {
    return false;
  }

  const capturedRange = range ? range.cloneRange() : null;
  menu.addItem({
    icon: "iconPin",
    label: "悬浮选中文本",
    click: async () => {
      const text = await extractFloatingMarkdownFromSelection(protyle, capturedRange);
      openFloatingText(text || selectedText);
    },
  });
  return true;
}

/**
 * 捕获当前悬浮候选选区：优先 protyle 工具栏 range，其次窗口选区
 */
export function captureFloatingSelectionRange(protyle?: ProtyleLike): Range | null {
  const toolbarRange = (protyle as any)?.toolbar?.range;
  return toolbarRange && typeof toolbarRange.cloneRange === "function"
    ? toolbarRange.cloneRange()
    : typeof window !== "undefined" && window.getSelection()?.rangeCount
    ? window.getSelection()!.getRangeAt(0).cloneRange()
    : null;
}

/**
 * 块图标菜单：追加「悬浮选中文本」菜单项
 * click 时优先提取块选区 Markdown，失败则回退到动作执行器
 */
export function addFloatSelectedTextBlockMenuItem(options: {
  menu?: SimpleMenu;
  protyle?: ProtyleLike;
  blockElements?: HTMLElement[];
  openFloatingText: (text: string) => void;
  runFloatActionFallback: () => void;
}): boolean {
  const { menu, protyle, blockElements, openFloatingText, runFloatActionFallback } = options;
  if (!menu) {
    return false;
  }

  const capturedRange = captureFloatingSelectionRange(protyle);
  const collectedBlockElements = blockElements ? [...blockElements] : [];
  menu.addItem({
    icon: "iconPin",
    label: "悬浮选中文本",
    click: async () => {
      const text = await extractFloatingMarkdownFromSelection(
        protyle,
        capturedRange,
        collectedBlockElements
      );
      if (text) {
        openFloatingText(text);
      } else {
        runFloatActionFallback();
      }
    },
  });
  return true;
}

/**
 * 文档树右键菜单：为文档节点追加「悬浮整篇文档」菜单项
 */
export function addFloatDocTreeMenuItem(options: {
  menu?: SimpleMenu;
  elements?: NodeListOf<HTMLElement>;
  eventType?: string;
  openFloatingDoc: (docId: string) => void;
}): boolean {
  const { menu, elements, eventType, openFloatingDoc } = options;
  if (!menu || eventType !== "doc" || !elements || !elements.length) {
    return false;
  }
  const targetEl = elements[0];
  const docId = targetEl.getAttribute("data-node-id");
  if (!docId) {
    return false;
  }

  menu.addItem({
    icon: "iconPin",
    label: "悬浮整篇文档",
    click: () => {
      openFloatingDoc(docId);
    },
  });
  return true;
}
