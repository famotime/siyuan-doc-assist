import {
  isConvertibleImageAssetPath,
  normalizeLocalImageAssetPath,
  toWebpAssetPath,
} from "@/core/image-webp-core";
import { getFileBlob, putBlobFile } from "@/services/kernel";

export type ImageWebpConvertSkipReason =
  | "unsupported-format"
  | "already-webp"
  | "no-size-gain";

export type LocalAssetImageWebpConvertResult = {
  sourceAssetPath: string;
  targetAssetPath: string;
  converted: boolean;
  savedBytes: number;
  reason?: ImageWebpConvertSkipReason;
};

function toWorkspaceAssetPath(assetPath: string): string {
  return `/data${assetPath.startsWith("/") ? assetPath : `/${assetPath}`}`;
}

function toFileName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || "image.webp";
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

async function encodeCanvasToWebpBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("WebP 编码失败"));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality
    );
  });
}

export async function convertLocalAssetImageToWebp(
  assetPath: string,
  quality = 0.82
): Promise<LocalAssetImageWebpConvertResult> {
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
  const targetAssetPath = toWebpAssetPath(normalized);
  if (targetAssetPath === normalized) {
    return {
      sourceAssetPath: normalized,
      targetAssetPath,
      converted: false,
      savedBytes: 0,
      reason: "already-webp",
    };
  }
  if (!isConvertibleImageAssetPath(normalized)) {
    return {
      sourceAssetPath: normalized,
      targetAssetPath,
      converted: false,
      savedBytes: 0,
      reason: "unsupported-format",
    };
  }

  const sourceBlob = await getFileBlob(toWorkspaceAssetPath(normalized));
  const qualityValue = Number.isFinite(quality) ? Math.max(0, Math.min(1, quality)) : 0.82;
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
    const webpBlob = await encodeCanvasToWebpBlob(canvas, qualityValue);
    if (webpBlob.size >= sourceBlob.size) {
      return {
        sourceAssetPath: normalized,
        targetAssetPath,
        converted: false,
        savedBytes: 0,
        reason: "no-size-gain",
      };
    }
    await putBlobFile(
      toWorkspaceAssetPath(targetAssetPath),
      webpBlob,
      toFileName(targetAssetPath)
    );
    return {
      sourceAssetPath: normalized,
      targetAssetPath,
      converted: true,
      savedBytes: sourceBlob.size - webpBlob.size,
    };
  } finally {
    imageSource.cleanup();
  }
}
