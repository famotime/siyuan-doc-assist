import { describe, expect, test } from "vitest";
import {
  consumeKeyInfoListPostRenderAction,
  createKeyInfoListScrollState,
  setKeyInfoListLastKnownScroll,
  updateKeyInfoListScrollContext,
} from "@/core/key-info-scroll-core";

describe("key-info-scroll-core", () => {
  test("resets pending scroll when context key changes", () => {
    const initial = createKeyInfoListScrollState("doc-a");
    const withScroll = setKeyInfoListLastKnownScroll(initial, 220, 12);
    const changed = updateKeyInfoListScrollContext(withScroll, "doc-b");

    expect(changed.contextKey).toBe("doc-b");
    expect(changed.lastKnownTop).toBe(0);
    expect(changed.lastKnownLeft).toBe(0);
    expect(changed.pendingReset).toBe(true);
  });

  test("keeps last known scroll when context key stays the same", () => {
    const initial = createKeyInfoListScrollState("doc-a");
    const withScroll = setKeyInfoListLastKnownScroll(initial, 220, 12);
    const same = updateKeyInfoListScrollContext(withScroll, "doc-a");

    expect(same.contextKey).toBe("doc-a");
    expect(same.lastKnownTop).toBe(220);
    expect(same.lastKnownLeft).toBe(12);
    expect(same.pendingReset).toBe(false);
  });

  test("consumes reset action once and then restores last known scroll", () => {
    const initial = createKeyInfoListScrollState("doc-a");
    const changed = updateKeyInfoListScrollContext(initial, "doc-b");
    const first = consumeKeyInfoListPostRenderAction(changed);

    expect(first.action.type).toBe("reset");
    expect(first.action.top).toBe(0);
    expect(first.action.left).toBe(0);
    expect(first.nextState.pendingReset).toBe(false);

    const withScroll = setKeyInfoListLastKnownScroll(first.nextState, 64, 7);
    const second = consumeKeyInfoListPostRenderAction(withScroll);
    expect(second.action.type).toBe("restore");
    expect(second.action.top).toBe(64);
    expect(second.action.left).toBe(7);
  });
});
