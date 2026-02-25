import { describe, expect, test } from "vitest";
import {
  buildGetFileRequest,
  decodeURIComponentSafe,
  normalizeWorkspacePath,
} from "@/core/workspace-path-core";

describe("workspace path core", () => {
  test("normalizes workspace path with leading slash", () => {
    expect(normalizeWorkspacePath("temp/export/a.zip")).toBe("/temp/export/a.zip");
    expect(normalizeWorkspacePath("/temp/export/a.zip")).toBe("/temp/export/a.zip");
  });

  test("builds getFile request payload with normalized path", () => {
    expect(buildGetFileRequest("temp/export/a b.zip")).toEqual({
      url: "/api/file/getFile",
      body: "{\"path\":\"/temp/export/a b.zip\"}",
    });
  });

  test("decodes uri encoded strings safely", () => {
    expect(
      decodeURIComponentSafe("OpenClaw%20%E6%97%A5%E5%B8%B8%E6%93%8D%E4%BD%9C")
    ).toBe("OpenClaw 日常操作");
    expect(decodeURIComponentSafe("%E0%A4%A")).toBe("%E0%A4%A");
  });
});
