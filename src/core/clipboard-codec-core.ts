import { normalizeLocalFilePath } from "@/core/clipboard-core";

export function parseWindowsCfHdropBuffer(raw: Uint8Array): string[] {
  if (!raw || raw.length < 20) {
    return [];
  }
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const pFiles = view.getUint32(0, true);
  const fWide = view.getUint32(16, true);
  if (pFiles < 20 || pFiles >= raw.length) {
    return [];
  }

  const slice = raw.subarray(pFiles);
  if (fWide !== 0) {
    const codeUnits: number[] = [];
    for (let i = 0; i + 1 < slice.length; i += 2) {
      const unit = slice[i] | (slice[i + 1] << 8);
      if (unit === 0) {
        if (codeUnits.length === 0 || codeUnits[codeUnits.length - 1] === 0) {
          break;
        }
        codeUnits.push(0);
      } else {
        codeUnits.push(unit);
      }
    }
    const decoded = String.fromCharCode(...codeUnits);
    return decoded
      .split("\0")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  let end = slice.length;
  for (let i = 0; i < slice.length; i += 1) {
    if (slice[i] === 0 && (i + 1 >= slice.length || slice[i + 1] === 0)) {
      end = i;
      break;
    }
  }
  const ascii = new TextDecoder("utf-8", { fatal: false }).decode(slice.subarray(0, end));
  return ascii
    .split("\0")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function encodeWindowsCfHdropBuffer(paths: string[]): Uint8Array {
  const cleaned = paths.map((p) => p.trim()).filter(Boolean);
  const payloadText = `${cleaned.join("\0")}\0\0`;
  const byteLength = 20 + payloadText.length * 2;
  const result = new Uint8Array(byteLength);
  const view = new DataView(result.buffer);
  view.setUint32(0, 20, true); // pFiles
  view.setUint32(16, 1, true); // fWide = 1 (UTF-16LE)
  for (let i = 0; i < payloadText.length; i += 1) {
    const code = payloadText.charCodeAt(i);
    result[20 + i * 2] = code & 0xFF;
    result[20 + i * 2 + 1] = (code >>> 8) & 0xFF;
  }
  return result;
}

export function parseLinuxUriList(raw: string): string[] {
  if (!raw) {
    return [];
  }
  const paths: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    if (trimmed.startsWith("file://")) {
      try {
        paths.push(normalizeLocalFilePath(decodeURIComponent(trimmed.slice(7))));
      } catch {
        paths.push(normalizeLocalFilePath(trimmed.slice(7)));
      }
    }
  }
  return paths;
}

export function encodeLinuxUriList(paths: string[]): string {
  return paths
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `file://${encodeURI(p)}`)
    .join("\r\n");
}

export function parseMacOsPlistFileList(xml: string): string[] {
  if (!xml) {
    return [];
  }
  const results: string[] = [];
  const regex = /<string>([\s\S]*?)<\/string>/g;
  for (let match = regex.exec(xml); match !== null; match = regex.exec(xml)) {
    const decoded = match[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .trim();
    if (decoded) {
      results.push(decoded);
    }
  }
  return results;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function encodeMacOsPlistFileList(paths: string[]): string {
  const entries = paths
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `  <string>${escapeXml(p)}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<array>\n${entries}\n</array>\n</plist>`;
}
