/** @vitest-environment jsdom */

import { describe, expect, test } from "vitest";
import {
  collectLayoutTabIds,
  resolveMoveTabNextIdAfterPinned,
} from "@/core/pinned-tab-placement-core";

function buildTab(id: string, options?: { pin?: boolean; pinnedClass?: boolean }) {
  const headElement = document.createElement("div");
  if (options?.pinnedClass) {
    headElement.className = "item item--pin";
  }
  return {
    id,
    pin: options?.pin,
    headElement,
  };
}

describe("pinned-tab-placement-core", () => {
  test("returns first unpinned tab id when current tab should move behind pinned tabs", () => {
    const tabs = [
      buildTab("pinned-a", { pin: true }),
      buildTab("pinned-b", { pinnedClass: true }),
      buildTab("doc-a"),
      buildTab("doc-new"),
      buildTab("doc-b"),
    ];

    expect(resolveMoveTabNextIdAfterPinned(tabs, "doc-new")).toBe("doc-a");
  });

  test("returns null when current tab is already first unpinned tab", () => {
    const tabs = [
      buildTab("pinned-a", { pin: true }),
      buildTab("doc-new"),
      buildTab("doc-a"),
    ];

    expect(resolveMoveTabNextIdAfterPinned(tabs, "doc-new")).toBeNull();
  });

  test("returns null when there are no pinned tabs or current tab is pinned", () => {
    expect(
      resolveMoveTabNextIdAfterPinned([buildTab("doc-a"), buildTab("doc-new")], "doc-new")
    ).toBeNull();

    expect(
      resolveMoveTabNextIdAfterPinned(
        [buildTab("pinned-a", { pin: true }), buildTab("doc-a")],
        "pinned-a"
      )
    ).toBeNull();
  });

  test("collects tab ids recursively from layout nodes", () => {
    expect(
      collectLayoutTabIds({
        children: [
          {
            instance: "Tab",
            id: "doc-a",
          },
          {
            children: [
              {
                id: "doc-b",
                headElement: document.createElement("div"),
              },
            ],
          },
        ],
      })
    ).toEqual(["doc-a", "doc-b"]);
  });
});
