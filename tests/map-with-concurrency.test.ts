import { describe, expect, test } from "vitest";

import {
  DEFAULT_MAP_CONCURRENCY,
  mapWithConcurrency
} from "@/core/map-with-concurrency";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("mapWithConcurrency", () => {
  test("preserves input order regardless of completion order", async () => {
    // 后启动的先完成，结果仍须按输入下标对齐
    const gates = [createDeferred<string>(), createDeferred<string>(), createDeferred<string>()];
    const promise = mapWithConcurrency(["a", "b", "c"], 3, async (_item, index) => {
      await gates[index].promise;
      return `result-${index}`;
    });
    gates[2].resolve("c");
    gates[0].resolve("a");
    gates[1].resolve("b");
    await expect(promise).resolves.toEqual(["result-0", "result-1", "result-2"]);
  });

  test("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapWithConcurrency(
      Array.from({ length: 20 }, (_v, i) => i),
      4,
      async (item) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        return item * 2;
      }
    );
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
    expect(results).toEqual(Array.from({ length: 20 }, (_v, i) => i * 2));
  });

  test("passes item and index to worker", async () => {
    const seen: Array<[string, number]> = [];
    await mapWithConcurrency(["x", "y"], 2, async (item, index) => {
      seen.push([item, index]);
      return null;
    });
    expect(seen).toEqual([["x", 0], ["y", 1]]);
  });

  test("clamps non-positive concurrency to 1", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3], 0, async (item) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return item;
    });
    expect(peak).toBe(1);
  });

  test("handles empty input", async () => {
    await expect(mapWithConcurrency([], 8, async () => 1)).resolves.toEqual([]);
  });

  test("rejects when a worker rejects", async () => {
    await expect(
      mapWithConcurrency([1, 2], 2, async (item) => {
        if (item === 2) {
          throw new Error("boom");
        }
        return item;
      })
    ).rejects.toThrow("boom");
  });

  test("exposes the recommended default concurrency", () => {
    expect(DEFAULT_MAP_CONCURRENCY).toBe(4);
  });
});
