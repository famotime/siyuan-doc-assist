export type GenerationGuard = {
  /** Starts a new generation and returns its id. */
  begin: () => number;
  /** Whether the given generation is still the latest one. */
  isCurrent: (generation: number) => boolean;
  /** Marks all outstanding generations stale; used on teardown or supersession. */
  invalidateAll: () => void;
};

/**
 * A monotonically increasing token guard for "latest request wins" flows.
 * Each `begin()` invalidates every token handed out before it, and
 * `invalidateAll()` lets teardown paths kill in-flight work immediately.
 */
export function createGenerationGuard(): GenerationGuard {
  let current = 0;
  return {
    begin() {
      current += 1;
      return current;
    },
    isCurrent(generation: number) {
      return generation === current;
    },
    invalidateAll() {
      current += 1;
    }
  };
}
