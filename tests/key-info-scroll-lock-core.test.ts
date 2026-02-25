import { describe, expect, test } from "vitest";
import {
  createKeyInfoListScrollLock,
  getActiveKeyInfoListScrollLock,
  releaseKeyInfoListScrollLockOnUserScroll,
} from "@/core/key-info-scroll-lock-core";

describe("key-info-scroll-lock-core", () => {
  test("creates a lock that stays active within duration", () => {
    const lock = createKeyInfoListScrollLock(120, 8, 1000, 120);
    const active = getActiveKeyInfoListScrollLock(lock, 1119);

    expect(active).toEqual(lock);
  });

  test("expires lock after duration", () => {
    const lock = createKeyInfoListScrollLock(120, 8, 1000, 120);
    const active = getActiveKeyInfoListScrollLock(lock, 1121);

    expect(active).toBeNull();
  });

  test("releases lock when user scroll position diverges", () => {
    const lock = createKeyInfoListScrollLock(120, 8, 1000, 120);
    const kept = releaseKeyInfoListScrollLockOnUserScroll(lock, 120, 8);
    const released = releaseKeyInfoListScrollLockOnUserScroll(lock, 121, 8);

    expect(kept).toEqual(lock);
    expect(released).toBeNull();
  });
});
