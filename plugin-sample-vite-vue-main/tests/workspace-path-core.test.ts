import { describe, expect, test } from "vitest";
import {
  buildGetFileRequest,
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
});
