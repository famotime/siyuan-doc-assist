import { describe, expect, test } from "vitest";
import { createGenerationGuard } from "@/core/generation-guard-core";

describe("generationGuardCore", () => {
  test("begin() invalidates previously handed-out generations", () => {
    const guard = createGenerationGuard();
    const first = guard.begin();
    expect(guard.isCurrent(first)).toBe(true);

    const second = guard.begin();
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
  });

  test("invalidateAll() marks outstanding generations stale", () => {
    const guard = createGenerationGuard();
    const generation = guard.begin();
    guard.invalidateAll();
    expect(guard.isCurrent(generation)).toBe(false);

    const next = guard.begin();
    expect(guard.isCurrent(next)).toBe(true);
  });

  test("invalidateAll() keeps working repeatedly", () => {
    const guard = createGenerationGuard();
    const first = guard.begin();
    guard.invalidateAll();
    const second = guard.begin();
    guard.invalidateAll();
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(false);
    const third = guard.begin();
    expect(guard.isCurrent(third)).toBe(true);
  });
});
