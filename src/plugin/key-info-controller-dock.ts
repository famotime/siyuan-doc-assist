import { buildDockDocActions } from "@/core/dock-panel-core";
import {
  DocMenuRegistrationState,
  isAllDocMenuRegistrationEnabled,
} from "@/core/doc-menu-registration-core";
import type { KeyInfoItem, KeyInfoFilter } from "@/core/key-info-core";
import { ActionConfig, ActionKey, isActionKey } from "@/plugin/actions";
import { ProtyleLike } from "@/plugin/doc-context";
import type { KeyInfoDockCallbacks, KeyInfoDockState } from "@/ui/key-info-dock";

type KeyInfoControllerDockDeps = {
  isMobile: () => boolean;
  getCurrentDocId: () => string;
  getCurrentProtyle: () => ProtyleLike | undefined;
  runAction: (action: ActionKey, explicitId?: string, protyle?: ProtyleLike) => Promise<void>;
  actions: () => ActionConfig[];
  getDocMenuRegistrationState: () => DocMenuRegistrationState;
  setAllDocMenuRegistration: (enabled: boolean) => Promise<void> | void;
  setSingleDocMenuRegistration: (key: ActionKey, enabled: boolean) => Promise<void> | void;
  setDocActionOrder: (order: ActionKey[]) => Promise<void> | void;
  resetDocActionOrder: () => Promise<void> | void;
  getDocFavoriteActionKeys: () => ActionKey[];
  setDocActionFavorite: (key: ActionKey, favorited: boolean) => Promise<void> | void;
  setDocFavoriteActionOrder: (order: ActionKey[]) => Promise<void> | void;
};

export function createKeyInfoControllerDockCallbacks(options: {
  deps: KeyInfoControllerDockDeps;
  onExport: () => void;
  onRefresh: () => Promise<void> | void;
  onDocProcessActivate?: () => Promise<void> | void;
  onItemClick: (item: KeyInfoItem) => void;
}): KeyInfoDockCallbacks {
  const { deps, onExport, onRefresh, onDocProcessActivate, onItemClick } = options;
  return {
    onExport,
    onRefresh: () => {
      void onRefresh();
    },
    onDocProcessActivate: () => {
      void onDocProcessActivate?.();
    },
    onItemClick,
    onDocActionClick: (actionKey) => {
      if (!isActionKey(actionKey)) {
        return;
      }
      const currentDocId = deps.getCurrentDocId();
      const currentProtyle = deps.getCurrentProtyle();
      void deps.runAction(actionKey, currentDocId, currentProtyle);
    },
    onDocMenuToggleAll: (enabled) => {
      void deps.setAllDocMenuRegistration(enabled);
    },
    onDocActionMenuToggle: (actionKey, enabled) => {
      if (!isActionKey(actionKey)) {
        return;
      }
      void deps.setSingleDocMenuRegistration(actionKey, enabled);
    },
    onDocActionReorder: (order) => {
      const normalized = order.filter((key): key is ActionKey => isActionKey(key));
      void deps.setDocActionOrder(normalized);
    },
    onDocActionOrderReset: () => {
      void deps.resetDocActionOrder();
    },
    onDocActionFavoriteToggle: (actionKey, favorited) => {
      if (!isActionKey(actionKey)) {
        return;
      }
      void deps.setDocActionFavorite(actionKey, favorited);
    },
    onDocFavoriteActionReorder: (order) => {
      const normalized = order.filter((key): key is ActionKey => isActionKey(key));
      void deps.setDocFavoriteActionOrder(normalized);
    },
  };
}

export function buildKeyInfoControllerDockActionState(options: {
  actions: ActionConfig[];
  isMobile: boolean;
  registration: DocMenuRegistrationState;
  favoriteActionKeys: ActionKey[];
  docReadonly?: boolean;
}): Pick<KeyInfoDockState, "docMenuRegisterAll" | "docActions" | "favoriteActionKeys"> {
  const { actions, isMobile, registration, favoriteActionKeys, docReadonly = false } = options;
  return {
    docMenuRegisterAll: isAllDocMenuRegistrationEnabled(registration),
    docActions: buildDockDocActions(actions, isMobile, registration, docReadonly),
    favoriteActionKeys,
  };
}

export function cloneKeyInfoDockFilter(filter: KeyInfoFilter | undefined): KeyInfoFilter | undefined {
  return filter ? [...filter] : undefined;
}
