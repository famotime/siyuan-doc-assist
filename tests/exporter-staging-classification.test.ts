import { describe, expect, vi, test, beforeEach } from "vitest";
import { FILE_ACCESS_ERROR_CODE_MISSING } from "@/core/kernel-file-error-core";
import { stageAssetsToTempDir } from "@/services/exporter-staging";

const getFileBlobMock = vi.hoisted(() => vi.fn());
const putBlobFileMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/kernel", () => ({
  getFileBlob: getFileBlobMock,
  putBlobFile: putBlobFileMock
}));

describe("exporter staging missing-asset classification", () => {
  beforeEach(() => {
    getFileBlobMock.mockReset();
    putBlobFileMock.mockReset();
    putBlobFileMock.mockResolvedValue(undefined);
  });

  test("skips assets whose error carries the structural missing-file code", async () => {
    getFileBlobMock.mockRejectedValueOnce(
      Object.assign(new Error("读取文件失败"), { fileErrorCode: FILE_ACCESS_ERROR_CODE_MISSING })
    );

    const result = await stageAssetsToTempDir(["/assets/a.png"], "/temp/assets");

    expect(result).toEqual({ stagedCount: 0, skippedAssetCount: 1 });
    expect(putBlobFileMock).not.toHaveBeenCalled();
  });

  test("skips assets when the kernel message is the localized os.Stat text", async () => {
    getFileBlobMock.mockRejectedValueOnce(new Error("系统找不到指定的文件。"));

    const result = await stageAssetsToTempDir(["/assets/a.png"], "/temp/assets");

    expect(result).toEqual({ stagedCount: 0, skippedAssetCount: 1 });
  });

  test("re-throws non-missing errors instead of silently aborting the export", async () => {
    getFileBlobMock.mockRejectedValueOnce(new Error("权限不足"));

    await expect(
      stageAssetsToTempDir(["/assets/a.png"], "/temp/assets")
    ).rejects.toThrow("权限不足");
  });

  test("stages assets that download and upload cleanly", async () => {
    getFileBlobMock.mockResolvedValueOnce(new Blob(["data"]));

    const result = await stageAssetsToTempDir(["/assets/a.png"], "/temp/assets");

    expect(result).toEqual({ stagedCount: 1, skippedAssetCount: 0 });
    expect(putBlobFileMock).toHaveBeenCalledTimes(1);
  });
});
