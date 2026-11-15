import { KeyInfoItem } from "@/core/key-info-core";
import { resolveKeyInfoItems } from "@/plugin/key-info-state";

type KeyInfoStateLike = {
  items: KeyInfoItem[];
  emptyText?: string;
};

type KeyInfoRefreshStateOptions = {
  currentState: KeyInfoStateLike;
  currentDocId: string;
  nextDocId: string;
};

type KeyInfoRefreshSuccessOptions = KeyInfoRefreshStateOptions & {
  docTitle?: string;
  latestItems: KeyInfoItem[];
};

type ShouldSkipReadonlyStateSyncOptions = {
  currentDocId: string;
  nextDocId: string;
  currentReadonly: boolean;
  nextReadonly: boolean;
};

export function buildKeyInfoUnavailableState() {
  return {
    docTitle: "",
    items: [],
    loading: false,
    isRefreshing: false,
    emptyText: "未找到当前文档",
    scrollContextKey: ""
  };
}

export function buildKeyInfoRefreshPendingState({
  currentState,
  currentDocId,
  nextDocId
}: KeyInfoRefreshStateOptions) {
  const isSameDoc = !!currentDocId && currentDocId === nextDocId;
  const hasItems = currentState.items.length > 0;
  return {
    loading: !hasItems || !isSameDoc,
    isRefreshing: true,
    emptyText: !hasItems || !isSameDoc ? "加载中..." : currentState.emptyText,
    scrollContextKey: nextDocId
  };
}

export function buildKeyInfoRefreshSuccessState({
  currentState,
  currentDocId,
  nextDocId,
  docTitle,
  latestItems
}: KeyInfoRefreshSuccessOptions) {
  const isSameDoc = !!currentDocId && currentDocId === nextDocId;
  const hasItems = currentState.items.length > 0;
  return {
    docTitle: docTitle || nextDocId,
    items: resolveKeyInfoItems({
      isSameDoc,
      hasItems,
      currentItems: currentState.items,
      latestItems
    }),
    loading: false,
    isRefreshing: false,
    emptyText: "暂无关键内容",
    scrollContextKey: nextDocId
  };
}

export function buildKeyInfoRefreshFailureState({
  currentState,
  currentDocId,
  nextDocId
}: KeyInfoRefreshStateOptions) {
  const isSameDoc = !!currentDocId && currentDocId === nextDocId;
  const hasItems = currentState.items.length > 0;
  const keepItems = isSameDoc && hasItems;
  return {
    loading: false,
    isRefreshing: false,
    emptyText: "加载失败",
    scrollContextKey: nextDocId,
    ...(keepItems ?
        {} :
        {
          docTitle: "",
          items: []
        })
  };
}

export function shouldSkipReadonlyStateSync({
  currentDocId,
  nextDocId,
  currentReadonly,
  nextReadonly
}: ShouldSkipReadonlyStateSyncOptions) {
  return currentDocId === nextDocId && currentReadonly === nextReadonly;
}
