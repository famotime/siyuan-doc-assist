import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createDocAssistantLogger,
  resetDocAssistantDebugSetting,
  setDocAssistantDebugEnabled,
} from "@/core/logger-core";

describe("logger-core", () => {
  afterEach(() => {
    resetDocAssistantDebugSetting();
    vi.restoreAllMocks();
  });

  test("suppresses debug logs by default", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const logger = createDocAssistantLogger("ForwardLinks");
    logger.debug("exportMdContent", { docId: "doc-1" });
    expect(infoSpy).not.toHaveBeenCalled();
  });

  test("prints debug logs after enabling debug switch", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    setDocAssistantDebugEnabled(true);
    const logger = createDocAssistantLogger("ForwardLinks");
    logger.debug("exportMdContent", { docId: "doc-1" });
    expect(infoSpy).toHaveBeenCalledWith(
      "[DocAssistant][ForwardLinks] exportMdContent",
      { docId: "doc-1" }
    );
  });

  test("keeps warning logs regardless of debug switch", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logger = createDocAssistantLogger("Style");
    logger.warn("apply failed", { failed: 1 });
    expect(warnSpy).toHaveBeenCalledWith(
      "[DocAssistant][Style] apply failed",
      { failed: 1 }
    );
  });
});
