import { describe, expect, test } from "vitest";
import {
  buildDocSyCandidatePaths,
  buildSyTreeOrderMap,
  isDirectChildDocPath,
  normalizeDocSyPath,
  toChildDocMeta,
  toDocMeta,
  toNotebookDocMeta
} from "@/services/kernel-doc-query";

describe("kernel doc query service", () => {
  test("normalizes doc metadata rows into public shape", () => {
    expect(
      toDocMeta({
        id: "doc-1",
        parent_id: "parent-1",
        root_id: "root-1",
        box: "box-1",
        path: "/doc-1.sy",
        hpath: "/Root/Doc 1",
        updated: "20260504180000"
      })
    ).toEqual({
      id: "doc-1",
      parentId: "parent-1",
      rootId: "root-1",
      box: "box-1",
      path: "/doc-1.sy",
      hPath: "/Root/Doc 1",
      updated: "20260504180000",
      title: "Doc 1"
    });
  });

  test("filters only direct child doc paths", () => {
    expect(isDirectChildDocPath("/parent.sy", "/parent/child-a.sy")).toBe(true);
    expect(isDirectChildDocPath("/parent.sy", "/parent/child-a/grand-child.sy")).toBe(false);
  });

  test("builds .sy candidate paths with and without suffix", () => {
    expect(normalizeDocSyPath("box-1", "doc-1.sy")).toBe("/data/box-1/doc-1.sy");
    expect(buildDocSyCandidatePaths("box-1", "/doc-1.sy")).toEqual([
      "/data/box-1/doc-1.sy",
      "/data/box-1/doc-1"
    ]);
  });

  test("builds sy tree order map depth-first", () => {
    const orderMap = buildSyTreeOrderMap({
      ID: "doc-1",
      Children: [
        { ID: "h-1" },
        { ID: "h-2", Children: [{ ID: "p-1" }] }
      ]
    });

    expect(orderMap.get("doc-1")).toBe(0);
    expect(orderMap.get("h-1")).toBe(1);
    expect(orderMap.get("h-2")).toBe(2);
    expect(orderMap.get("p-1")).toBe(3);
  });

  test("normalizes child and notebook doc rows into public DTOs", () => {
    expect(
      toNotebookDocMeta({
        id: "doc-2",
        box: "box-2",
        path: "/doc-2.sy",
        hpath: "/Docs/Doc 2",
        updated: "20260504180100"
      })
    ).toEqual({
      id: "doc-2",
      box: "box-2",
      path: "/doc-2.sy",
      hPath: "/Docs/Doc 2",
      updated: "20260504180100",
      title: "Doc 2"
    });

    expect(
      toChildDocMeta({
        id: "child-1",
        box: "box-2",
        hpath: "/Parent/Child 1",
        updated: "20260504180200"
      })
    ).toEqual({
      id: "child-1",
      box: "box-2",
      hPath: "/Parent/Child 1",
      updated: "20260504180200"
    });
  });
});
