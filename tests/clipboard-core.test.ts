import { describe, expect, test } from "vitest";
import {
  buildClipboardFileSignature,
  buildClipboardImageSignature,
  buildClipboardTextSignature,
  clearNonFavoriteClipboardItems,
  deleteClipboardItem,
  filterClipboardItems,
  formatFileNamesSummary,
  normalizeClipboardStorageIndex,
  toggleClipboardItemFavorite,
  upsertClipboardHistoryItem
} from "@/core/clipboard-core";

describe("clipboard-core", () => {
  test("builds deterministic signatures for text, files, and images", () => {
    expect(buildClipboardTextSignature("hello")).toBe(buildClipboardTextSignature("hello"));
    expect(buildClipboardTextSignature("hello")).not.toBe(buildClipboardTextSignature("world"));

    expect(buildClipboardFileSignature(["D:\\a.txt", "D:\\b.png"])).toBe(
      buildClipboardFileSignature(["D:\\a.txt", "D:\\b.png"])
    );
    expect(buildClipboardFileSignature(["D:\\a.txt"])).not.toBe(
      buildClipboardFileSignature(["D:\\b.txt"])
    );

    const imgA = new Uint8Array([1, 2, 3, 4]);
    const imgB = new Uint8Array([1, 2, 3, 5]);
    expect(buildClipboardImageSignature(imgA, 100, 100)).toBe(
      buildClipboardImageSignature(imgA, 100, 100)
    );
    expect(buildClipboardImageSignature(imgA, 100, 100)).not.toBe(
      buildClipboardImageSignature(imgB, 100, 100)
    );
  });

  test("deduplicates by signature, preserves favorite state, and moves item to top", () => {
    const first = upsertClipboardHistoryItem([], {
      kind: "text",
      signature: "sig-1",
      previewText: "one",
      text: "one"
    }, { now: 1000, id: "id-1" });
    const second = upsertClipboardHistoryItem(first.nextItems, {
      kind: "text",
      signature: "sig-2",
      previewText: "two",
      text: "two"
    }, { now: 2000, id: "id-2" });
    const favorited = toggleClipboardItemFavorite(second.nextItems, "id-1");

    const reupserted = upsertClipboardHistoryItem(favorited, {
      kind: "text",
      signature: "sig-1",
      previewText: "one",
      text: "one"
    }, { now: 3000, id: "id-3" });

    expect(reupserted.added).toBe(false);
    expect(reupserted.nextItems.map((i) => i.id)).toEqual(["id-1", "id-2"]);
    expect(reupserted.nextItems[0].favorited).toBe(true);
    expect(reupserted.nextItems[0].updatedAt).toBe(3000);
  });

  test("evicts oldest non-favorite items beyond limit while keeping favorites and returning removed images", () => {
    let items = upsertClipboardHistoryItem([], {
      kind: "image",
      signature: "img-old",
      previewText: "old",
      imageFileName: "old.png",
      imageWidth: 10,
      imageHeight: 10
    }, { now: 100, id: "id-old", maxNonFavorite: 2 }).nextItems;

    items = upsertClipboardHistoryItem(items, {
      kind: "image",
      signature: "img-fav",
      previewText: "fav",
      imageFileName: "fav.png",
      imageWidth: 10,
      imageHeight: 10
    }, { now: 200, id: "id-fav", maxNonFavorite: 2 }).nextItems;
    items = toggleClipboardItemFavorite(items, "id-fav");

    items = upsertClipboardHistoryItem(items, {
      kind: "text",
      signature: "txt-1",
      previewText: "t1",
      text: "t1"
    }, { now: 300, id: "id-t1", maxNonFavorite: 2 }).nextItems;

    const overflow = upsertClipboardHistoryItem(items, {
      kind: "text",
      signature: "txt-2",
      previewText: "t2",
      text: "t2"
    }, { now: 400, id: "id-t2", maxNonFavorite: 2 });

    expect(overflow.removedImageFiles).toEqual(["old.png"]);
    expect(overflow.nextItems.map((i) => i.id)).toEqual(["id-t2", "id-t1", "id-fav"]);
  });

  test("deletes item and clears non-favorites returning image filenames to unlink", () => {
    let items = upsertClipboardHistoryItem([], {
      kind: "image",
      signature: "img-1",
      previewText: "img1",
      imageFileName: "a.png"
    }, { now: 1, id: "1" }).nextItems;
    items = upsertClipboardHistoryItem(items, {
      kind: "image",
      signature: "img-2",
      previewText: "img2",
      imageFileName: "b.png"
    }, { now: 2, id: "2" }).nextItems;
    items = toggleClipboardItemFavorite(items, "2");

    const cleared = clearNonFavoriteClipboardItems(items);
    expect(cleared.removedImageFiles).toEqual(["a.png"]);
    expect(cleared.nextItems.map((i) => i.id)).toEqual(["2"]);

    const deleted = deleteClipboardItem(cleared.nextItems, "2");
    expect(deleted.removedImageFile).toBe("b.png");
    expect(deleted.nextItems).toEqual([]);
  });

  test("filters by type, favorite, keyword, and pinyin", () => {
    let items = upsertClipboardHistoryItem([], {
      kind: "text",
      signature: "s1",
      previewText: "思源笔记插件",
      text: "思源笔记插件"
    }, { now: 1, id: "1" }).nextItems;
    items = upsertClipboardHistoryItem(items, {
      kind: "image",
      signature: "s2",
      previewText: "图像 800×600",
      imageFileName: "x.png"
    }, { now: 2, id: "2" }).nextItems;
    items = upsertClipboardHistoryItem(items, {
      kind: "file",
      signature: "s3",
      previewText: formatFileNamesSummary(["C:\\docs\\report.pdf", "C:\\docs\\plan.md"]),
      filePaths: ["C:\\docs\\report.pdf", "C:\\docs\\plan.md"]
    }, { now: 3, id: "3" }).nextItems;
    items = toggleClipboardItemFavorite(items, "1");

    expect(filterClipboardItems(items, "all", "").length).toBe(3);
    expect(filterClipboardItems(items, "text", "").map((i) => i.id)).toEqual(["1"]);
    expect(filterClipboardItems(items, "image", "").map((i) => i.id)).toEqual(["2"]);
    expect(filterClipboardItems(items, "file", "").map((i) => i.id)).toEqual(["3"]);
    expect(filterClipboardItems(items, "favorite", "").map((i) => i.id)).toEqual(["1"]);
    expect(filterClipboardItems(items, "all", "sybj").map((i) => i.id)).toEqual(["1"]);
    expect(filterClipboardItems(items, "all", "report").map((i) => i.id)).toEqual(["3"]);
  });

  test("normalizes corrupted storage payloads safely", () => {
    expect(normalizeClipboardStorageIndex(null)).toEqual([]);
    expect(normalizeClipboardStorageIndex({ version: 1, items: [{ id: "1", kind: "text", signature: "s" }, { bad: true }] })).toHaveLength(1);
  });
});
