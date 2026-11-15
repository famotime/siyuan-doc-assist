export type DecodedImageSource = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

/**
 * Shared blob → drawable image source loader used by the image converters and
 * OCR slicing. Prefers createImageBitmap; falls back to an <img> + objectURL.
 * On the fallback path the object URL is revoked on decode failure — the
 * success-path revocation is the caller's job via the returned cleanup handle.
 */
export async function decodeImageSource(
  blob: Blob,
  unsupportedMessage = "当前环境不支持图片解码"
): Promise<DecodedImageSource> {
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
    throw new TypeError(unsupportedMessage);
  }

  const objectUrl = URL.createObjectURL(blob);
  const revokeObjectUrl = () => {
    URL.revokeObjectURL(objectUrl);
  };
  try {
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
      cleanup: revokeObjectUrl
    };
  } catch (error) {
    revokeObjectUrl();
    throw error;
  }
}
