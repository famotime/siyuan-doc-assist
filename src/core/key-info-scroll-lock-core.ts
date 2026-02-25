export type KeyInfoListScrollLock = {
  top: number;
  left: number;
  until: number;
};

export function createKeyInfoListScrollLock(
  top: number,
  left: number,
  now: number,
  durationMs = 120
): KeyInfoListScrollLock {
  return {
    top,
    left,
    until: now + durationMs,
  };
}

export function getActiveKeyInfoListScrollLock(
  lock: KeyInfoListScrollLock | null,
  now: number
): KeyInfoListScrollLock | null {
  if (!lock) {
    return null;
  }
  if (now > lock.until) {
    return null;
  }
  return lock;
}

export function releaseKeyInfoListScrollLockOnUserScroll(
  lock: KeyInfoListScrollLock | null,
  top: number,
  left: number
): KeyInfoListScrollLock | null {
  if (!lock) {
    return null;
  }
  if (top !== lock.top || left !== lock.left) {
    return null;
  }
  return lock;
}
