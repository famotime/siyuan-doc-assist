import PinyinMatch from "pinyin-match";

export type ClipboardItemKind = "text" | "image" | "file";

export type ClipboardFilterKey = "all" | "text" | "image" | "file" | "favorite";

export type ClipboardHistoryItem = {
  id: string;
  kind: ClipboardItemKind;
  createdAt: number;
  updatedAt: number;
  favorited: boolean;
  signature: string;
  previewText: string;
  text?: string;
  imageFileName?: string;
  imageWidth?: number;
  imageHeight?: number;
  filePaths?: string[];
};

export type ClipboardStorageIndex = {
  version: 1;
  items: ClipboardHistoryItem[];
};

export type IncomingClipboardEntry = {
  kind: ClipboardItemKind;
  signature: string;
  previewText: string;
  text?: string;
  imageFileName?: string;
  imageWidth?: number;
  imageHeight?: number;
  filePaths?: string[];
};

export const CLIPBOARD_MAX_NON_FAVORITE_ITEMS = 200;

export function hashBytesFnv1a(bytes: Uint8Array): string {
  let hash = 0x811C9DC5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function hashStringFnv1a(value: string): string {
  const len = value.length;
  let hash = 0x811C9DC5;
  for (let i = 0; i < len; i += 1) {
    const code = value.charCodeAt(i);
    hash ^= code & 0xFF;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (code >>> 8) & 0xFF;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildClipboardTextSignature(text: string): string {
  return `text:${text.length}:${hashStringFnv1a(text)}`;
}

export function buildClipboardFileSignature(paths: string[]): string {
  const joined = paths.join("\n");
  return `file:${paths.length}:${hashStringFnv1a(joined)}`;
}

export function buildClipboardImageSignature(
  bytes: Uint8Array,
  width: number,
  height: number
): string {
  return `image:${width}x${height}:${bytes.length}:${hashBytesFnv1a(bytes)}`;
}

export function extractFileName(filePath: string): string {
  const normalized = (filePath || "").replace(/[\\/]+$/, "");
  const idx = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

export function formatFileNamesSummary(paths: string[]): string {
  if (!paths || paths.length === 0) {
    return "";
  }
  const first = extractFileName(paths[0]);
  if (paths.length === 1) {
    return first;
  }
  return `${first} 等 ${paths.length} 个文件`;
}

export function buildClipboardTextPreview(text: string, maxLength = 240): string {
  const collapsed = (text || "").replace(/\r\n/g, "\n").trim();
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, maxLength)}…`;
}

export function upsertClipboardHistoryItem(
  items: ClipboardHistoryItem[],
  incoming: IncomingClipboardEntry,
  options?: {
    now?: number;
    id?: string;
    maxNonFavorite?: number;
  }
): {
  nextItems: ClipboardHistoryItem[];
  removedImageFiles: string[];
  added: boolean;
} {
  const now = options?.now ?? Date.now();
  const maxNonFavorite = options?.maxNonFavorite ?? CLIPBOARD_MAX_NON_FAVORITE_ITEMS;
  const existingIndex = items.findIndex((item) => item.signature === incoming.signature);

  if (existingIndex >= 0) {
    const existing = items[existingIndex];
    const updated: ClipboardHistoryItem = {
      ...existing,
      updatedAt: now
    };
    const nextItems = [
      updated,
      ...items.slice(0, existingIndex),
      ...items.slice(existingIndex + 1)
    ];
    return {
      nextItems,
      removedImageFiles:
        incoming.imageFileName && incoming.imageFileName !== existing.imageFileName ?
            [incoming.imageFileName] :
            [],
      added: false
    };
  }

  const created: ClipboardHistoryItem = {
    id: options?.id || `cb-${now}-${Math.random().toString(36).slice(2, 8)}`,
    kind: incoming.kind,
    createdAt: now,
    updatedAt: now,
    favorited: false,
    signature: incoming.signature,
    previewText: incoming.previewText,
    ...(incoming.text !== undefined ? { text: incoming.text } : {}),
    ...(incoming.imageFileName ? { imageFileName: incoming.imageFileName } : {}),
    ...(incoming.imageWidth !== undefined ? { imageWidth: incoming.imageWidth } : {}),
    ...(incoming.imageHeight !== undefined ? { imageHeight: incoming.imageHeight } : {}),
    ...(incoming.filePaths ? { filePaths: [...incoming.filePaths] } : {})
  };

  const combined = [created, ...items];
  const kept: ClipboardHistoryItem[] = [];
  const removedImageFiles: string[] = [];
  let nonFavoriteCount = 0;

  for (const item of combined) {
    if (item.favorited) {
      kept.push(item);
      continue;
    }
    if (nonFavoriteCount < maxNonFavorite) {
      nonFavoriteCount += 1;
      kept.push(item);
    } else if (item.kind === "image" && item.imageFileName) {
      removedImageFiles.push(item.imageFileName);
    }
  }

  return {
    nextItems: kept,
    removedImageFiles,
    added: true
  };
}

export function toggleClipboardItemFavorite(
  items: ClipboardHistoryItem[],
  id: string
): ClipboardHistoryItem[] {
  return items.map((item) =>
    item.id === id ? { ...item, favorited: !item.favorited } : item
  );
}

export function deleteClipboardItem(
  items: ClipboardHistoryItem[],
  id: string
): {
  nextItems: ClipboardHistoryItem[];
  removedImageFile?: string;
} {
  let removedImageFile: string | undefined;
  const nextItems = items.filter((item) => {
    if (item.id !== id) {
      return true;
    }
    if (item.kind === "image" && item.imageFileName) {
      removedImageFile = item.imageFileName;
    }
    return false;
  });
  return { nextItems, removedImageFile };
}

export function clearNonFavoriteClipboardItems(
  items: ClipboardHistoryItem[]
): {
  nextItems: ClipboardHistoryItem[];
  removedImageFiles: string[];
} {
  const nextItems: ClipboardHistoryItem[] = [];
  const removedImageFiles: string[] = [];
  for (const item of items) {
    if (item.favorited) {
      nextItems.push(item);
    } else if (item.kind === "image" && item.imageFileName) {
      removedImageFiles.push(item.imageFileName);
    }
  }
  return { nextItems, removedImageFiles };
}

export function filterClipboardItems(
  items: ClipboardHistoryItem[],
  filterKey: ClipboardFilterKey,
  query: string
): ClipboardHistoryItem[] {
  const trimmed = (query || "").trim();
  const byType = items.filter((item) => {
    if (filterKey === "all") {
      return true;
    }
    if (filterKey === "favorite") {
      return item.favorited;
    }
    return item.kind === filterKey;
  });

  if (!trimmed) {
    return byType;
  }

  const lower = trimmed.toLowerCase();
  return byType.filter((item) => {
    const candidates: string[] = [];
    if (item.text) {
      candidates.push(item.text);
    }
    if (item.previewText) {
      candidates.push(item.previewText);
    }
    if (item.filePaths) {
      for (const fp of item.filePaths) {
        candidates.push(fp);
        candidates.push(extractFileName(fp));
      }
    }
    for (const candidate of candidates) {
      if (candidate.toLowerCase().includes(lower)) {
        return true;
      }
      const match = PinyinMatch.match(candidate, trimmed);
      if (Array.isArray(match) && match.length >= 2) {
        return true;
      }
    }
    return false;
  });
}

export function normalizeClipboardStorageIndex(raw: unknown): ClipboardHistoryItem[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const candidate = raw as Partial<ClipboardStorageIndex>;
  if (!Array.isArray(candidate.items)) {
    return [];
  }
  return candidate.items.filter((item): item is ClipboardHistoryItem => {
    if (!item || typeof item !== "object") {
      return false;
    }
    if (
      typeof item.id !== "string" ||
      typeof item.signature !== "string" ||
      (item.kind !== "text" && item.kind !== "image" && item.kind !== "file")
    ) {
      return false;
    }
    return true;
  });
}

export function formatClipboardRelativeTime(timestamp: number, now = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSec < 15) {
    return "刚刚";
  }
  if (diffSec < 60) {
    return `${diffSec} 秒前`;
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin} 分钟前`;
  }
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    return `${diffHour} 小时前`;
  }
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) {
    return `${diffDay} 天前`;
  }
  const date = new Date(timestamp);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${m}-${d} ${hh}:${mm}`;
}
