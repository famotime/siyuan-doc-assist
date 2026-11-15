import { describe, expect, test } from "vitest";
import {
  getParentDocPath,
  pickSiblingDoc,
  SiblingDocRef
} from "@/core/doc-navigation-core";

const SIBLINGS: SiblingDocRef[] = [
  { id: "doc-a", name: "A" },
  { id: "doc-b", name: "B" },
  { id: "doc-c", name: "C" }
];

describe("doc navigation core", () => {
  test("computes parent doc path", () => {
    expect(getParentDocPath("/20230101120000-abc.sy")).toBe("/");
    expect(getParentDocPath("/folder/20230101120000-abc.sy")).toBe("/folder");
    expect(getParentDocPath("folder/20230101120000-abc.sy")).toBe("/folder");
    expect(getParentDocPath("/")).toBe("/");
  });

  test("picks next/previous sibling without wrap", () => {
    expect(pickSiblingDoc(SIBLINGS, "doc-a", "next")).toEqual({
      doc: { id: "doc-b", name: "B" },
      wrapped: false
    });
    expect(pickSiblingDoc(SIBLINGS, "doc-b", "previous")).toEqual({
      doc: { id: "doc-a", name: "A" },
      wrapped: false
    });
  });

  test("wraps around at both ends", () => {
    expect(pickSiblingDoc(SIBLINGS, "doc-c", "next")).toEqual({
      doc: { id: "doc-a", name: "A" },
      wrapped: true
    });
    expect(pickSiblingDoc(SIBLINGS, "doc-a", "previous")).toEqual({
      doc: { id: "doc-c", name: "C" },
      wrapped: true
    });
  });

  test("returns null when the current doc has no siblings", () => {
    expect(pickSiblingDoc([{ id: "doc-a" }], "doc-a", "next")).toBeNull();
    expect(pickSiblingDoc([], "doc-a", "next")).toBeNull();
  });

  test("falls back to endpoints when current doc is missing from the list", () => {
    expect(pickSiblingDoc(SIBLINGS, "doc-z", "next")).toEqual({
      doc: { id: "doc-a", name: "A" },
      wrapped: false
    });
    expect(pickSiblingDoc(SIBLINGS, "doc-z", "previous")).toEqual({
      doc: { id: "doc-c", name: "C" },
      wrapped: false
    });
  });

  test("ignores invalid sibling entries", () => {
    expect(
      pickSiblingDoc(
        [{ id: "" }, { id: "doc-b" } as SiblingDocRef, null as unknown as SiblingDocRef],
        "doc-b",
        "next"
      )
    ).toBeNull();
    expect(pickSiblingDoc(null as unknown as SiblingDocRef[], "doc-b", "next")).toBeNull();
  });
});
