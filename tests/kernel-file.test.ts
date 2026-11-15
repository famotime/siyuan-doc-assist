import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getFileBlob } from "@/services/kernel-file";
import { isMissingFileError } from "@/core/kernel-file-error-core";

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
          data: "1234"
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    }) as any;

    const blob = await getFileBlob("/data/nb-1/a.sy");

    expect(blob.size).toBe(4);
    expect(await blob.text()).toBe("1234");
  });

  test("returns blob when getFile responds with raw sy json content", async () => {
    const rawContent = JSON.stringify({
      ID: "20260308103148-yqz4azy",
      Type: "NodeDocument",
      Content: "hello"
    });

    globalThis.fetch = vi.fn(async () => {
      return new Response(rawContent, {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    }) as any;

    const blob = await getFileBlob("/data/nb-1/a.sy");

    expect(blob.size).toBe(rawContent.length);
    expect(await blob.text()).toBe(rawContent);
  });

  test("classifies json error envelope body code 404 as missing even with unknown text (audit 4.3)", async () => {
    // 内核 getFile：HTTP 202 + body {code:404, msg:<os.Stat 原始错误>}
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({ code: 404, msg: "some future unknown wording", data: null }),
        {
          status: 202,
          headers: { "content-type": "application/json" }
        }
      );
    }) as any;

    let thrown: unknown;
    try {
      await getFileBlob("/data/nb-1/missing.sy");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(isMissingFileError(thrown)).toBe(true);
  });
});
