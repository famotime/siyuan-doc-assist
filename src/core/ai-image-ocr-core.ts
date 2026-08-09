/**
 * 图片 OCR 识别的核心计算逻辑与文本聚合
 */

export const MAX_OCR_IMAGE_HEIGHT = 3000;

export type ImageSliceRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * 根据图片宽高计算切片矩形
 * 若高度超过 maxHeight (默认 3000px)，则沿垂直方向等距/按步长切分为多个矩形
 */
export function calculateImageSliceRects(
  width: number,
  height: number,
  maxHeight = MAX_OCR_IMAGE_HEIGHT
): ImageSliceRect[] {
  const safeWidth = Math.max(1, Math.round(width || 1));
  const safeHeight = Math.max(1, Math.round(height || 1));
  const safeMaxHeight = Math.max(1, Math.round(maxHeight || MAX_OCR_IMAGE_HEIGHT));

  if (safeHeight <= safeMaxHeight) {
    return [
      {
        x: 0,
        y: 0,
        width: safeWidth,
        height: safeHeight,
      },
    ];
  }

  const rects: ImageSliceRect[] = [];
  let currentY = 0;

  while (currentY < safeHeight) {
    const sliceH = Math.min(safeMaxHeight, safeHeight - currentY);
    rects.push({
      x: 0,
      y: currentY,
      width: safeWidth,
      height: sliceH,
    });
    currentY += sliceH;
  }

  return rects;
}

/**
 * 将同张图片各个切片的 OCR 识别文本使用指定分隔符（默认 "---"）合并
 * 过滤掉空文本或 "[NO_TEXT]" 标记
 */
export function mergeOcrResults(
  results: Array<string | null | undefined>,
  separator = "---"
): string {
  const validParts = (results || [])
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((text) => Boolean(text) && text !== "[NO_TEXT]");

  if (!validParts.length) {
    return "";
  }

  if (validParts.length === 1) {
    return validParts[0];
  }

  return validParts.join(`\n${separator}\n`);
}

/**
 * 将识别出的多行文本转换为 Markdown 引用块
 */
export function buildOcrQuoteMarkdown(text: string): string {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");
}
