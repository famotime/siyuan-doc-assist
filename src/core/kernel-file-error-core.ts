export const FILE_ACCESS_ERROR_CODE_MISSING = "file-missing";

export type FileAccessError = Error & {
  fileErrorCode?: typeof FILE_ACCESS_ERROR_CODE_MISSING | "file-error";
  status?: number;
};

// Message fragments that indicate the requested file/path does not exist.
// Covers the legacy matcher set plus the kernel's raw os.Stat texts
// (Windows en/zh-CN, Linux) that arrive through the JSON error envelope.
const MISSING_FILE_MESSAGE_PATTERNS = [
  "file not exist",
  "not exist",
  "does not exist",
  "not found",
  "no such file",
  "cannot find the specified file",
  "cannot find the file",
  // Windows 目录级变体："The system cannot find the path specified."
  "cannot find the path",
  "找不到指定的文件",
  "找不到指定的路径",
  "不存在",
  "未找到"
];

export function isMissingFileMessage(message: string): boolean {
  const normalized = (message || "").toLowerCase();
  if (!normalized) {
    return false;
  }
  return MISSING_FILE_MESSAGE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function createFileAccessError(
  message: string,
  status?: number,
  envelopeCode?: number
): FileAccessError {
  const error: FileAccessError = new Error(message);
  // 结构性判据优先：内核 getFile 的错误信封 body 携带 code=404（HTTP 层恒为 202），
  // 以此免疫未来错误文案改动（审计 4.3）
  if (status === 404 || envelopeCode === 404 || isMissingFileMessage(message)) {
    error.fileErrorCode = FILE_ACCESS_ERROR_CODE_MISSING;
  }
  if (typeof status === "number") {
    error.status = status;
  }
  return error;
}

/**
 * Structural check first (set by kernel-file), then fall back to message
 * matching so older kernels and locally-built errors keep working.
 */
export function isMissingFileError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const code = (error as { fileErrorCode?: string }).fileErrorCode;
    if (code === FILE_ACCESS_ERROR_CODE_MISSING) {
      return true;
    }
    if (code === "file-error") {
      return false;
    }
  }
  if (error instanceof Error) {
    return isMissingFileMessage(error.message);
  }
  return isMissingFileMessage(String(error || ""));
}
