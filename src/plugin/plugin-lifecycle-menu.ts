import { filterDocMenuActions } from "@/core/doc-menu-registration-core";
import { ActionConfig, ActionKey } from "@/plugin/actions";
import { ProtyleLike } from "@/plugin/doc-context";

type EditorTitleMenu = {
  addSeparator: () => void;
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
