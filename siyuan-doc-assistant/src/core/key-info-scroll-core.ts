export type KeyInfoListScrollState = {
  contextKey: string;
  lastKnownTop: number;
  lastKnownLeft: number;
  pendingReset: boolean;
};

export type KeyInfoListPostRenderAction = {
  type: "reset" | "restore";
  top: number;
  left: number;
};

export function createKeyInfoListScrollState(
  contextKey = ""
): KeyInfoListScrollState {
  return {
    contextKey,
    lastKnownTop: 0,
    lastKnownLeft: 0,
    pendingReset: false,
  };
}

export function setKeyInfoListLastKnownScroll(
  state: KeyInfoListScrollState,
  top: number,
  left: number
): KeyInfoListScrollState {
  return {
    ...state,
    lastKnownTop: top,
    lastKnownLeft: left,
  };
}

export function updateKeyInfoListScrollContext(
  state: KeyInfoListScrollState,
  nextContextKey: string
): KeyInfoListScrollState {
  if (state.contextKey === nextContextKey) {
    return {
      ...state,
      contextKey: nextContextKey,
    };
  }
  return {
    contextKey: nextContextKey,
    lastKnownTop: 0,
    lastKnownLeft: 0,
    pendingReset: true,
  };
}

export function consumeKeyInfoListPostRenderAction(state: KeyInfoListScrollState): {
  nextState: KeyInfoListScrollState;
  action: KeyInfoListPostRenderAction;
} {
  if (state.pendingReset) {
    return {
      nextState: {
        ...state,
        pendingReset: false,
      },
      action: {
        type: "reset",
        top: 0,
        left: 0,
      },
    };
  }
  return {
    nextState: state,
    action: {
      type: "restore",
      top: state.lastKnownTop,
      left: state.lastKnownLeft,
    },
  };
}
