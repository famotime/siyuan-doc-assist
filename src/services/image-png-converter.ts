import {
  isConvertibleImageAssetPath,
  normalizeLocalImageAssetPath,
  toPngAssetPath,
} from "@/core/image-webp-core";
import { getFileBlob, putBlobFile } from "@/services/kernel";

export type ImagePngConvertSkipReason = "unsupported-format" | "already-png";

export type LocalAssetImagePngConvertResult = {
  sourceAssetPath: string;
  targetAssetPath: string;
  converted: boolean;
  savedBytes: number;
  reason?: ImagePngConvertSkipReason;
};

function toWorkspaceAssetPath(assetPath: string): string {
  return `/data${assetPath.startsWith("/") ? assetPath : `/${assetPath}`}`;
}

function toFileName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || "image.png";
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
      },
    };
  }

  if (typeof Image === "undefined" || typeof URL === "undefined") {
    throw new Error("当前环境不支持图片转码");
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
    },
  };
}

async function encodeCanvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("PNG 编码失败"));
          return;
        }
        resolve(blob);
      },
      "image/png"
    );
  });
}

export async function convertLocalAssetImageToPng(
  assetPath: string
): Promise<LocalAssetImagePngConvertResult> {
  const normalized = normalizeLocalImageAssetPath(assetPath);
  if (!normalized) {
    return {
      sourceAssetPath: assetPath,
      targetAssetPath: assetPath,
      converted: false,
      savedBytes: 0,
      reason: "unsupported-format",
    };
  }
  const targetAssetPath = toPngAssetPath(normalized);
  if (targetAssetPath === normalized) {
    return {
      sourceAssetPath: normalized,
      targetAssetPath,
      converted: false,
      savedBytes: 0,
      reason: "already-png",
    };
  }
  if (!isConvertibleImageAssetPath(normalized, "png")) {
    return {
      sourceAssetPath: normalized,
      targetAssetPath,
      converted: false,
      savedBytes: 0,
      reason: "unsupported-format",
    };
  }

  const sourceBlob = await getFileBlob(toWorkspaceAssetPath(normalized));
  const imageSource = await loadImageSource(sourceBlob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, imageSource.width);
    canvas.height = Math.max(1, imageSource.height);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 不可用");
    }
    context.drawImage(imageSource.source, 0, 0, canvas.width, canvas.height);
    const pngBlob = await encodeCanvasToPngBlob(canvas);
    await putBlobFile(
      toWorkspaceAssetPath(targetAssetPath),
      pngBlob,
      toFileName(targetAssetPath)
    );
    return {
      sourceAssetPath: normalized,
      targetAssetPath,
      converted: true,
      savedBytes: Math.max(0, sourceBlob.size - pngBlob.size),
    };
  } finally {
    imageSource.cleanup();
  }
}
