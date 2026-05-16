import { describe, expect, test } from "vitest";
import { formatByteSize } from "@/core/byte-format-core";

describe("byte-format-core", () => {
  test("formats bytes below 1 KB as B", () => {
    expect(formatByteSize(999)).toBe("999 B");
  });

  test("formats bytes in KB", () => {
    expect(formatByteSize(2048)).toBe("2.0 KB");
  });

  test("formats bytes in MB", () => {
    expect(formatByteSize(158293504)).toBe("151.0 MB");
  });
});
