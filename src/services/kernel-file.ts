import { requestApi } from "@/services/request";

type FileErrorRes = {
  code?: number;
  msg?: string;
};

export type PathInfo = {
  path: string;
  notebook: string;
};

export type FileTreeDoc = {
  id: string;
  name: string;
  path: string;
  icon?: string;
  subFileCount?: number;
};

export async function moveDocsByID(fromIDs: string[], toID: string): Promise<void> {
  await requestApi("/api/filetree/moveDocsByID", {
    fromIDs,
    toID,
  });
}

export async function renameDocByID(id: string, title: string): Promise<void> {
  await requestApi("/api/filetree/renameDocByID", {
    id,
    title,
  });
}

export async function removeDocByID(id: string): Promise<void> {
  await requestApi("/api/filetree/removeDocByID", {
    id,
  });
}

export async function putFile(
  path: string,
  content: string
): Promise<void> {
  await putBlobFile(
    path,
    new Blob([content], { type: "text/markdown;charset=utf-8" }),
    path.split("/").filter(Boolean).pop() || "doc.md"
  );
}

export async function putBlobFile(
  path: string,
  fileBlob: Blob,
  fileName?: string
): Promise<void> {
  const form = new FormData();
  const name = fileName || path.split("/").filter(Boolean).pop() || "file.bin";
  form.append("path", path);
  form.append("isDir", "false");
  form.append("modTime", `${Math.floor(Date.now() / 1000)}`);
  form.append("file", fileBlob, name);
  await requestApi("/api/file/putFile", form);
}

export async function removeFile(path: string): Promise<void> {
  await requestApi("/api/file/removeFile", { path });
}

export async function getFileBlob(path: string): Promise<Blob> {
  const response = await fetch("/api/file/getFile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) {
    throw new Error(`读取文件失败：${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = (await response.json().catch(() => null)) as FileErrorRes | null;
    throw new Error(json?.msg || "读取文件失败");
  }

  return response.blob();
}

function isFileErrorEnvelope(value: unknown): value is FileErrorRes & { data?: unknown } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as FileErrorRes & { data?: unknown };
  return typeof payload.code === "number" && payload.code !== 0 && payload.data === null;
}

function isFileSuccessEnvelope(value: unknown): value is { code: number; data?: unknown } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as { code?: unknown };
  return typeof payload.code === "number" && payload.code === 0;
}

export async function getFileTextAllowJson(path: string): Promise<string> {
  const response = await fetch("/api/file/getFile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) {
    throw new Error(`读取文件失败：${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!contentType.includes("application/json")) {
    return text;
  }
  if (!text.trim()) {
    return text;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // JSON content-type with non-JSON payload should still be treated as file text.
    return text;
  }
  if (isFileErrorEnvelope(parsed)) {
    const message = (parsed.msg || "").trim();
    throw new Error(message || `读取文件失败：${parsed.code}`);
  }
  if (isFileSuccessEnvelope(parsed)) {
    const data = parsed.data;
    if (typeof data === "string") {
      return data;
    }
    if (data == null) {
      return "";
    }
    if (typeof data === "object") {
      return JSON.stringify(data);
    }
    return String(data);
  }
  return text;
}

export async function getPathByID(id: string): Promise<PathInfo> {
  return requestApi<PathInfo>("/api/filetree/getPathByID", { id });
}

export async function listDocsByPath(
  notebook: string,
  path: string
): Promise<FileTreeDoc[]> {
  const res = await requestApi<{ files?: FileTreeDoc[] }>("/api/filetree/listDocsByPath", {
    notebook,
    path,
  });
  return res?.files || [];
}
