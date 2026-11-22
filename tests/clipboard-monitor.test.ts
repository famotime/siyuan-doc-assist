import { describe, expect, test } from "vitest";
import {
  encodeLinuxUriList,
  encodeMacOsPlistFileList,
  encodeWindowsCfHdropBuffer,
  parseLinuxUriList,
  parseMacOsPlistFileList,
  parseWindowsCfHdropBuffer
} from "@/services/clipboard-monitor";
import { normalizeDynamicOutlineViewModes } from "@/core/dynamic-outline-core";

describe("clipboard-monitor file buffer codecs", () => {
  test("round-trips Windows CF_HDROP UTF-16LE buffer with Chinese paths", () => {
    const paths = ["C:\\Users\\测试\\文档.md", "D:\\Projects\\logo.png"];
    const buf = encodeWindowsCfHdropBuffer(paths);
    expect(parseWindowsCfHdropBuffer(buf)).toEqual(paths);
  });

  test("returns empty array for malformed or short CF_HDROP buffers", () => {
    expect(parseWindowsCfHdropBuffer(new Uint8Array(10))).toEqual([]);
    expect(parseWindowsCfHdropBuffer(new Uint8Array(20))).toEqual([]);
  });

  test("round-trips Linux text/uri-list", () => {
    const paths = ["/home/user/My Notes.md", "/tmp/a.png"];
    const encoded = encodeLinuxUriList(paths);
    expect(parseLinuxUriList(`# comment\n${encoded}\n`)).toEqual(paths);
  });

  test("round-trips macOS NSFilenamesPboardType plist", () => {
    const paths = ["/Users/test/A & B.md", "/Users/test/c.png"];
    const xml = encodeMacOsPlistFileList(paths);
    expect(parseMacOsPlistFileList(xml)).toEqual(paths);
  });

  test("normalizes dynamic outline view modes with fallback", () => {
    expect(normalizeDynamicOutlineViewModes(undefined)).toEqual(["outline", "open-docs"]);
    expect(normalizeDynamicOutlineViewModes([])).toEqual(["outline", "open-docs"]);
    expect(
      normalizeDynamicOutlineViewModes(["clipboard", "outline", "clipboard", "invalid"])
    ).toEqual(["clipboard", "outline"]);
  });
});
