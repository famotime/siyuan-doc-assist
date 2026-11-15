import { normalizeLocalImageAssetPath } from "@/core/image-webp-core";
import { DisplaySizeSpec } from "@/core/image-display-size-core";
import { getFileBlob, putBlobFile } from "@/services/kernel";

export type ImageDisplayResizeSkipReason =
  | "unsupported-format" |
  "invalid-target" |
  "no-downscale" |
  "no-size-gain";

export type LocalAssetImageDisplayResizeResult = {
  sourceAssetPath: string;
  targetAssetPath: string;
  converted: boolean;
  savedBytes: number;
  targetWidth: number;
  targetHeight: number;
  reason?: ImageDisplayResizeSkipReason;
};

function toWorkspaceAssetPath(assetPath: string): string {
  return `/data${assetPath.startsWith("/") ? assetPath : `/${assetPath}`}`;
}

function toFileName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || "image";
}

function toDisplayResizedAssetPath(assetPath: string, width: number, height: number): string {
  const suffix = `-display-${width}x${height}`;
  if (!/\.[^./]+$/.test(assetPath)) {
    return `${assetPath}${suffix}`;
  }
  return assetPath.replace(/(\.[^./]+)$/, `${suffix}$1`);
}

function getAssetExtension(assetPath: string): string {
  const normalized = (assetPath || "").replace(/[?#].*$/, "");
  const base = normalized.split("/").filter(Boolean).pop() || "";
  const dotIndex = base.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex >= base.length - 1) {
    return "";
  }
  return base.slice(dotIndex + 1).toLowerCase();
}

function getEncodeMimeFromAssetPath(assetPath: string): string | null {
  const ext = getAssetExtension(assetPath);
  if (ext === "png") {
    return "image/png";
  }
  if (ext === "jpg" || ext === "jpeg") {
    return "image/jpeg";
  }
  if (ext === "webp") {
    return "image/webp";
  }
  return null;
}

async function loadImageSource(blob: Blob): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => {
        bitmap.close?.();
      }
    };
  }

  if (typeof Image === "undefined" || typeof URL === "undefined") {
    throw new TypeError("当前环境不支持图片转码");
  }

  const objectUrl = URL.createObjectURL(blob);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("图片解码失败"));
    element.src = objectUrl;
  });
  return {
    source: image,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
    cleanup: () => {
      URL.revokeObjectURL(objectUrl);
    }
  };
}

async function encodeCanvasToBlob(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob> {
  const quality = mimeType === "image/jpeg" || mimeType === "image/webp" ? 0.9 : undefined;
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("图片编码失败"));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

function normalizeResizeTargetSize(
  sourceWidth: number,
  sourceHeight: number,
  size: DisplaySizeSpec
): { width: number; height: number } | null {
  const width = size.width && size.width > 0 ? Math.round(size.width) : null;
  const height = size.height && size.height > 0 ? Math.round(size.height) : null;
  if (!width && !height) {
    return null;
  }
  if (width && height) {
    return {
      width: Math.max(1, width),
      height: Math.max(1, height)
    };
  }
  if (width) {
    return {
      width: Math.max(1, width),
      height: Math.max(1, Math.round((sourceHeight * width) / Math.max(1, sourceWidth)))
    };
  }
  return {
    width: Math.max(1, Math.round((sourceWidth * Math.max(1, height || 1)) / Math.max(1, sourceHeight))),
    height: Math.max(1, height || 1)
  };
}

export async function resizeLocalAssetImageByDisplaySize(
  assetPath: string,
  displaySize: DisplaySizeSpec
): Promise<LocalAssetImageDisplayResizeResult> {
  const normalized = normalizeLocalImageAssetPath(assetPath);
  if (!normalized) {
    return {
      sourceAssetPath: assetPath,
      targetAssetPath: assetPath,
      converted: false,
      savedBytes: 0,
      targetWidth: 0,
      targetHeight: 0,
      reason: "unsupported-format"
    };
  }
  const mimeType = getEncodeMimeFromAssetPath(normalized);
  if (!mimeType) {
    return {
      sourceAssetPath: normalized,
      targetAssetPath: normalized,
      converted: false,
      savedBytes: 0,
      targetWidth: 0,
      targetHeight: 0,
      reason: "unsupported-format"
    };
  }

  const sourceBlob = await getFileBlob(toWorkspaceAssetPath(normalized));
  const imageSource = await loadImageSource(sourceBlob);
  try {
    const targetSize = normalizeResizeTargetSize(
      imageSource.width,
      imageSource.height,
      displaySize
    );
    if (!targetSize) {
      return {
        sourceAssetPath: normalized,
        targetAssetPath: normalized,
        converted: false,
        savedBytes: 0,
        targetWidth: 0,
        targetHeight: 0,
        reason: "invalid-target"
      };
    }
    if (
      targetSize.width >= imageSource.width ||
      targetSize.height >= imageSource.height
    ) {
      return {
        sourceAssetPath: normalized,
        targetAssetPath: normalized,
        converted: false,
        savedBytes: 0,
        targetWidth: targetSize.width,
        targetHeight: targetSize.height,
        reason: "no-downscale"
      };
    }

    const targetAssetPath = toDisplayResizedAssetPath(
      normalized,
      targetSize.width,
      targetSize.height
    );
    const canvas = document.createElement("canvas");
    canvas.width = targetSize.width;
    canvas.height = targetSize.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 不可用");
    }
    context.drawImage(
      imageSource.source,
      0,
      0,
      imageSource.width,
      imageSource.height,
      0,
      0,
      canvas.width,
      canvas.height
    );
    const resizedBlob = await encodeCanvasToBlob(canvas, mimeType);
    if (resizedBlob.size >= sourceBlob.size) {
      return {
        sourceAssetPath: normalized,
        targetAssetPath,
        converted: false,
        savedBytes: 0,
        targetWidth: targetSize.width,
        targetHeight: targetSize.height,
        reason: "no-size-gain"
      };
    }
    await putBlobFile(
      toWorkspaceAssetPath(targetAssetPath),
      resizedBlob,
      toFileName(targetAssetPath)
    );
    return {
      sourceAssetPath: normalized,
      targetAssetPath,
      converted: true,
      savedBytes: sourceBlob.size - resizedBlob.size,
      targetWidth: targetSize.width,
      targetHeight: targetSize.height
    };
  } finally {
    imageSource.cleanup();
  }
}
