// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { decodeImageSource } from "@/services/image-source-loader";

describe("decodeImageSource", () => {
  test("revokes the object URL when the Image fallback fails to decode", async () => {
    const created: string[] = [];
    const revoked: string[] = [];
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const originalImage = globalThis.Image;
    const originalCreateImageBitmap = (globalThis as any).createImageBitmap;

    URL.createObjectURL = vi.fn(() => {
      const url = `blob:mock-${created.length}`;
      created.push(url);
      return url;
    }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn((url: string) => {
      revoked.push(url);
    }) as unknown as typeof URL.revokeObjectURL;
    // Force the <img> fallback path.
    (globalThis as any).createImageBitmap = undefined;
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      get src(): string {
        return "";
      }

      set src(_value: string) {
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    (globalThis as any).Image = FailingImage;

    try {
      await expect(decodeImageSource(new Blob(["x"]))).rejects.toThrow("图片解码失败");
      expect(revoked).toEqual(created);
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      globalThis.Image = originalImage;
      (globalThis as any).createImageBitmap = originalCreateImageBitmap;
    }
  });

  test("hands the cleanup handle to the caller on the success path", async () => {
    const revoked: string[] = [];
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const originalImage = globalThis.Image;
    const originalCreateImageBitmap = (globalThis as any).createImageBitmap;

    URL.createObjectURL = vi.fn(() => "blob:mock-ok") as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn((url: string) => {
      revoked.push(url);
    }) as unknown as typeof URL.revokeObjectURL;
    (globalThis as any).createImageBitmap = undefined;
    class OkImage {
      width = 320;
      naturalWidth = 320;
      height = 240;
      naturalHeight = 240;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      get src(): string {
        return "";
      }

      set src(_value: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    }
    (globalThis as any).Image = OkImage;

    try {
      const source = await decodeImageSource(new Blob(["x"]));
      expect(source.width).toBe(320);
      expect(source.height).toBe(240);
      expect(revoked).toEqual([]);
      source.cleanup();
      expect(revoked).toEqual(["blob:mock-ok"]);
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      globalThis.Image = originalImage;
      (globalThis as any).createImageBitmap = originalCreateImageBitmap;
    }
  });
});
