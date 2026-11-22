import { describe, expect, test } from "vitest";
import {
  aggregateClipboardItems,
  buildClipboardFileSignature,
  buildClipboardImageSignature,
  buildClipboardTextSignature,
  clearNonFavoriteClipboardItems,
  deleteClipboardItem,
  deleteClipboardItems,
  extractParentDir,
  filterClipboardItems,
  formatFileNamesSummary,
  mergeClipboardItems,
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

  test("extracts parent directory across Windows and POSIX paths", () => {
    expect(extractParentDir("C:\\Users\\demo\\a.txt")).toBe("C:\\Users\\demo");
    expect(extractParentDir("/D:/MyCodingProjects/siyuan-doc-assist/.env")).toBe("D:\\MyCodingProjects\\siyuan-doc-assist");
    expect(extractParentDir("C:\\a.txt")).toBe("C:\\");
    expect(extractParentDir("/home/user/notes/doc.md")).toBe("/home/user/notes");
    expect(extractParentDir("/file.txt")).toBe("/");
    expect(extractParentDir("plain.txt")).toBe("");
  });

  test("deletes multiple items and collects removed image filenames", () => {
    let items = upsertClipboardHistoryItem([], {
      kind: "text",
      signature: "t1",
      previewText: "one",
      text: "one"
    }, { now: 1, id: "1" }).nextItems;
    items = upsertClipboardHistoryItem(items, {
      kind: "image",
      signature: "i1",
      previewText: "img",
      imageFileName: "img-1.png"
    }, { now: 2, id: "2" }).nextItems;
    items = upsertClipboardHistoryItem(items, {
      kind: "text",
      signature: "t2",
      previewText: "two",
      text: "two"
    }, { now: 3, id: "3" }).nextItems;

    const deleted = deleteClipboardItems(items, ["1", "2"]);
    expect(deleted.nextItems.map((i) => i.id)).toEqual(["3"]);
    expect(deleted.removedImageFiles).toEqual(["img-1.png"]);
  });

  test("merges text, file, and mixed items in selection order while skipping images", () => {
    let items = upsertClipboardHistoryItem([], {
      kind: "text",
      signature: "t1",
      previewText: "first",
      text: "第一段"
    }, { now: 1, id: "t1" }).nextItems;
    items = upsertClipboardHistoryItem(items, {
      kind: "text",
      signature: "t2",
      previewText: "second",
      text: "第二段"
    }, { now: 2, id: "t2" }).nextItems;
    items = upsertClipboardHistoryItem(items, {
      kind: "file",
      signature: "f1",
      previewText: "a.md",
      filePaths: ["D:\\a.md", "D:\\b.md"]
    }, { now: 3, id: "f1" }).nextItems;
    items = upsertClipboardHistoryItem(items, {
      kind: "file",
      signature: "f2",
      previewText: "b.md",
      filePaths: ["D:\\b.md", "D:\\c.md"]
    }, { now: 4, id: "f2" }).nextItems;
    items = upsertClipboardHistoryItem(items, {
      kind: "image",
      signature: "i1",
      previewText: "img1",
      imageFileName: "1.png"
    }, { now: 5, id: "i1" }).nextItems;
    items = upsertClipboardHistoryItem(items, {
      kind: "image",
      signature: "i2",
      previewText: "img2",
      imageFileName: "2.png"
    }, { now: 6, id: "i2" }).nextItems;

    const textMerged = mergeClipboardItems(items, ["t1", "t2"]);
    expect(textMerged.ok).toBe(true);
    if (textMerged.ok && textMerged.kind === "text") {
      expect(textMerged.text).toBe("第一段\n\n第二段");
    }

    const filesMerged = mergeClipboardItems(items, ["f1", "f2"]);
    expect(filesMerged.ok).toBe(true);
    if (filesMerged.ok && filesMerged.kind === "file") {
      expect(filesMerged.filePaths).toEqual(["D:\\a.md", "D:\\b.md", "D:\\c.md"]);
    }

    const mixedMerged = mergeClipboardItems(items, ["t1", "f1", "i1"]);
    expect(mixedMerged.ok).toBe(true);
    if (mixedMerged.ok && mixedMerged.kind === "text") {
      expect(mixedMerged.text).toBe("第一段\n\nD:\\a.md\nD:\\b.md");
      expect(mixedMerged.skippedImageCount).toBe(1);
    }

    const multiImages = mergeClipboardItems(items, ["i1", "i2"]);
    expect(multiImages.ok).toBe(false);
  });

  test("aggregates selected items into a new top item and removes consumed originals", () => {
    let items = upsertClipboardHistoryItem([], {
      kind: "text",
      signature: "t1",
      previewText: "first",
      text: "Alpha"
    }, { now: 1, id: "t1" }).nextItems;
    items = toggleClipboardItemFavorite(items, "t1");
    items = upsertClipboardHistoryItem(items, {
      kind: "text",
      signature: "t2",
      previewText: "second",
      text: "Beta"
    }, { now: 2, id: "t2" }).nextItems;
    items = upsertClipboardHistoryItem(items, {
      kind: "image",
      signature: "i1",
      previewText: "img",
      imageFileName: "keep.png"
    }, { now: 3, id: "i1" }).nextItems;

    const aggregated = aggregateClipboardItems(items, ["t1", "t2", "i1"], {
      now: 10,
      id: "agg-1"
    });
    expect(aggregated.ok).toBe(true);
    if (aggregated.ok) {
      expect(aggregated.skippedImageCount).toBe(1);
      expect(aggregated.createdItem.id).toBe("agg-1");
      expect(aggregated.createdItem.text).toBe("Alpha\n\nBeta");
      expect(aggregated.createdItem.favorited).toBe(true);
      expect(aggregated.nextItems.map((i) => i.id)).toEqual(["agg-1", "i1"]);
    }
  });
});
