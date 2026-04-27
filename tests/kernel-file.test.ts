import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getFileBlob } from "@/services/kernel-file";

describe("kernel file", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test("returns blob when getFile responds with json success envelope", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          code: 0,
          data: "1234",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      );
    }) as any;

    const blob = await getFileBlob("/data/nb-1/a.sy");

    expect(blob.size).toBe(4);
    expect(await blob.text()).toBe("1234");
  });
});
