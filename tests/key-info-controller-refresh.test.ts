import { describe, expect, test } from "vitest";
import {
  buildKeyInfoRefreshFailureState,
  buildKeyInfoRefreshPendingState,
  buildKeyInfoRefreshSuccessState,
  buildKeyInfoUnavailableState,
  shouldSkipReadonlyStateSync
} from "@/plugin/key-info-controller-refresh";
import { KeyInfoItem } from "@/core/key-info-core";

function item(id: string, text: string, order: number): KeyInfoItem {
  return {
    id,
    type: "bold",
    text,
    raw: text,
    offset: order,
    blockId: `b-${id}`,
    blockSort: order,
    order
  };
}

describe("key-info controller refresh", () => {
  test("builds unavailable state when current doc is missing", () => {
    expect(buildKeyInfoUnavailableState()).toEqual({
      docTitle: "",
      items: [],
      loading: false,
      isRefreshing: false,
      emptyText: "未找到当前文档",
      scrollContextKey: ""
    });
  });

  test("keeps existing empty text during same-doc refresh with cached items", () => {
    const next = buildKeyInfoRefreshPendingState({
      currentState: {
        items: [item("old-1", "Old 1", 0)],
        emptyText: "暂无关键内容"
      },
      currentDocId: "doc-1",
      nextDocId: "doc-1"
    });

    expect(next).toEqual({
      loading: false,
      isRefreshing: true,
      emptyText: "暂无关键内容",
      scrollContextKey: "doc-1"
    });
  });

  test("resolves refreshed state with latest ordered items and doc title fallback", () => {
    const next = buildKeyInfoRefreshSuccessState({
      currentState: {
        items: [item("old-1", "Old 1", 0)]
      },
      currentDocId: "doc-1",
      nextDocId: "doc-1",
      docTitle: "",
      latestItems: [item("new-1", "New 1", 0), item("new-2", "New 2", 1)]
    });

    expect(next.docTitle).toBe("doc-1");
    expect(next.items.map((it) => it.id)).toEqual(["new-1", "new-2"]);
    expect(next.loading).toBe(false);
    expect(next.isRefreshing).toBe(false);
    expect(next.emptyText).toBe("暂无关键内容");
    expect(next.scrollContextKey).toBe("doc-1");
  });

  test("keeps same-doc items on refresh failure but clears switched doc state", () => {
    const keepItems = buildKeyInfoRefreshFailureState({
      currentState: {
        items: [item("old-1", "Old 1", 0)]
      },
      currentDocId: "doc-1",
      nextDocId: "doc-1"
    });

    expect(keepItems).toEqual({
      loading: false,
      isRefreshing: false,
      emptyText: "加载失败",
      scrollContextKey: "doc-1"
    });

    const clearItems = buildKeyInfoRefreshFailureState({
      currentState: {
        items: [item("old-1", "Old 1", 0)]
      },
      currentDocId: "doc-1",
      nextDocId: "doc-2"
    });

    expect(clearItems).toEqual({
      loading: false,
      isRefreshing: false,
      emptyText: "加载失败",
      scrollContextKey: "doc-2",
      docTitle: "",
      items: []
    });
  });

  test("skips readonly sync only when both doc and readonly state are unchanged", () => {
    expect(
      shouldSkipReadonlyStateSync({
        currentDocId: "doc-1",
        nextDocId: "doc-1",
        currentReadonly: true,
        nextReadonly: true
      })
    ).toBe(true);

    expect(
      shouldSkipReadonlyStateSync({
        currentDocId: "doc-1",
        nextDocId: "doc-2",
        currentReadonly: true,
        nextReadonly: true
      })
    ).toBe(false);

    expect(
      shouldSkipReadonlyStateSync({
        currentDocId: "doc-1",
        nextDocId: "doc-1",
        currentReadonly: false,
        nextReadonly: true
      })
    ).toBe(false);
  });
});
