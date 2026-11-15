import { describe, expect, test } from "vitest";
import {
  createFileAccessError,
  FILE_ACCESS_ERROR_CODE_MISSING,
  isMissingFileError,
  isMissingFileMessage
} from "@/core/kernel-file-error-core";

describe("kernelFileErrorCore", () => {
  test("matches kernel os.Stat messages and legacy texts", () => {
    expect(isMissingFileMessage("系统找不到指定的文件。")).toBe(true);
    expect(isMissingFileMessage("系统找不到指定的路径。")).toBe(true);
    expect(isMissingFileMessage("no such file or directory")).toBe(true);
    expect(isMissingFileMessage("The system cannot find the specified file.")).toBe(true);
    expect(isMissingFileMessage("The system cannot find the path specified.")).toBe(true);
    expect(isMissingFileMessage("file not exist")).toBe(true);
    expect(isMissingFileMessage("asset not found")).toBe(true);
    expect(isMissingFileMessage("文件不存在")).toBe(true);
    expect(isMissingFileMessage("权限不足")).toBe(false);
    expect(isMissingFileMessage("")).toBe(false);
  });

  test("createFileAccessError marks missing-file errors structurally", () => {
    const fromMessage = createFileAccessError("系统找不到指定的文件。");
    expect(fromMessage.fileErrorCode).toBe(FILE_ACCESS_ERROR_CODE_MISSING);

    const fromStatus = createFileAccessError("读取文件失败：404", 404);
    expect(fromStatus.fileErrorCode).toBe(FILE_ACCESS_ERROR_CODE_MISSING);
    expect(fromStatus.status).toBe(404);

    const other = createFileAccessError("权限不足", 403);
    expect(other.fileErrorCode).toBeUndefined();
    expect(other.status).toBe(403);
  });

  test("envelope body code 404 classifies as missing regardless of message text (audit 4.3)", () => {
    const fromEnvelope = createFileAccessError("未知的内核错误文本", undefined, 404);
    expect(fromEnvelope.fileErrorCode).toBe(FILE_ACCESS_ERROR_CODE_MISSING);

    const nonMissingEnvelope = createFileAccessError("权限不足", undefined, 403);
    expect(nonMissingEnvelope.fileErrorCode).toBeUndefined();
  });

  test("isMissingFileError trusts the structural code before message matching", () => {
    expect(isMissingFileError(createFileAccessError("系统找不到指定的文件。"))).toBe(true);
    expect(isMissingFileError(new Error("asset not found"))).toBe(true);
    expect(isMissingFileError(new Error("权限不足"))).toBe(false);

    const explicitlyFatal = createFileAccessError("权限不足");
    (explicitlyFatal as { fileErrorCode?: string }).fileErrorCode = "file-error";
    expect(isMissingFileError(explicitlyFatal)).toBe(false);

    expect(isMissingFileError("file not exist")).toBe(true);
    expect(isMissingFileError(undefined)).toBe(false);
  });
});
