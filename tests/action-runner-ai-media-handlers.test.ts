import { beforeEach, describe, expect, test, vi } from "vitest";
import { showMessage } from "siyuan";

import { createAiMediaActionHandlers } from "@/plugin/action-runner-ai-media-handlers";
import { translateDocParagraphs } from "@/services/ai-paragraph-translation";

vi.mock("siyuan", () => ({
  showMessage: vi.fn()
}));

vi.mock("@/services/ai-paragraph-translation", () => ({
  translateDocParagraphs: vi.fn()
}));

vi.mock("@/services/ai-image-ocr", () => ({
  recognizeDocImages: vi.fn()
}));

const showMessageMock = vi.mocked(showMessage);
const translateDocParagraphsMock = vi.mocked(translateDocParagraphs);

describe("action runner ai media handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("shows all-translated message when everything is skipped during resume", async () => {
    translateDocParagraphsMock.mockResolvedValueOnce({
      scannedParagraphCount: 5,
      translatableParagraphCount: 0,
      skippedCount: 3,
      translatedCount: 0,
      failedCount: 0,
      insertedCount: 0
    });

    const handlers = createAiMediaActionHandlers();
    await handlers["translate-doc-paragraphs"]("doc-1");

    expect(showMessageMock).toHaveBeenCalledWith(
      "当前文档所有英文内容均已翻译完成",
      5000,
      "info"
    );
  });

  test("shows resume translation report with skipped count prefix when some blocks were translated", async () => {
    translateDocParagraphsMock.mockResolvedValueOnce({
      scannedParagraphCount: 10,
      translatableParagraphCount: 4,
      skippedCount: 6,
      translatedCount: 4,
      failedCount: 0,
      insertedCount: 4
    });

    const handlers = createAiMediaActionHandlers();
    await handlers["translate-doc-paragraphs"]("doc-1");

    expect(showMessageMock).toHaveBeenCalledWith(
      "逐段翻译完成：跳过已译 6 段，新翻译 4 段，插入 4 个译文块",
      6000,
      "info"
    );
  });
});
