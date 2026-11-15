// @vitest-environment jsdom
import { beforeEach, describe, expect, vi, test } from "vitest";
import { bindPipWindowEvents } from "@/services/floating-text/floating-window-pip-events";
import {
  loadFloatingTextConfig,
  saveFloatingTextConfig
} from "@/services/floating-text/floating-text-storage";

vi.mock("@/services/floating-text/floating-text-storage", () => ({
  loadFloatingTextConfig: vi.fn(() => ({ rememberSize: false })),
  saveFloatingTextConfig: vi.fn()
}));

const saveMock = saveFloatingTextConfig as unknown as ReturnType<typeof vi.fn>;
const loadMock = loadFloatingTextConfig as unknown as ReturnType<typeof vi.fn>;

const PIP_BODY_HTML = `
  <div id="ft-app">
    <header class="ft-header">
      <div class="ft-actions">
        <button id="ft-btn-view"><use href="#ft-icon-preview"></use></button>
        <button id="ft-btn-pin"><use href="#ft-icon-pin"></use></button>
        <button id="ft-btn-copy"></button>
        <button id="ft-btn-settings"></button>
        <button id="ft-btn-close"></button>
      </div>
    </header>
    <main>
      <div id="ft-text-view">初始文本内容</div>
      <div id="ft-markdown-view" style="display:none;"></div>
      <div id="ft-search-results" style="display:none;"></div>
    </main>
    <span id="ft-opacity-slider-wrap"><input id="ft-opacity-slider" type="range" value="88" /></span>
    <span id="ft-opacity-label">88%</span>
    <span id="ft-font-label">15px</span>
    <button id="ft-font-inc"></button>
    <button id="ft-font-dec"></button>
    <span id="ft-word-count"></span>
    <div id="ft-toast" class="ft-toast"></div>
    <div id="ft-popover"></div>
    <div id="ft-pin-tooltip"></div>
    <div id="ft-view-tooltip"></div>
    <div id="ft-copy-tooltip"></div>
  </div>
`;

function createPipWindow(): any {
  const doc = document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = PIP_BODY_HTML;
  const eventTarget = new EventTarget();
  return {
    document: doc,
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    addEventListener: eventTarget.addEventListener.bind(eventTarget),
    removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
    dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
    close: vi.fn(),
    focus: vi.fn(),
    moveTo: vi.fn(),
    innerWidth: 420,
    innerHeight: 320,
    screenX: 10,
    screenY: 20,
    getSelection: () => null,
    navigator: {}
  };
}

beforeEach(() => {
  saveMock.mockClear();
  loadMock.mockClear();
  loadMock.mockReturnValue({ rememberSize: false } as any);
});

describe("bindPipWindowEvents", () => {
  test("initializes word count and keeps text view editable", () => {
    const pip = createPipWindow();
    bindPipWindowEvents(pip, "初始文本内容", {
      fontSize: 15,
      viewMode: "text"
    } as any);

    const textView = pip.document.getElementById("ft-text-view")!;
    expect(textView.getAttribute("contenteditable")).toBe("plaintext-only");
    expect(textView.getAttribute("spellcheck")).toBe("false");
    const wordCount = pip.document.getElementById("ft-word-count")!;
    expect(wordCount.textContent).toBe("6 字");
    expect(wordCount.style.display).toBe("inline-block");
  });

  test("closes the pip window from the close button", () => {
    const pip = createPipWindow();
    bindPipWindowEvents(pip, "text", { fontSize: 15, viewMode: "text" } as any);

    pip.document.getElementById("ft-btn-close")!.dispatchEvent(new Event("click"));
    expect(pip.close).toHaveBeenCalledTimes(1);
  });

  test("closes the pip window on Escape without an open popover", () => {
    const pip = createPipWindow();
    bindPipWindowEvents(pip, "text", { fontSize: 15, viewMode: "text" } as any);

    pip.document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    expect(pip.close).toHaveBeenCalledTimes(1);
  });

  test("closes the popover first on Escape when it is open", () => {
    const pip = createPipWindow();
    bindPipWindowEvents(pip, "text", { fontSize: 15, viewMode: "text" } as any);
    const popover = pip.document.getElementById("ft-popover")!;
    const settingsBtn = pip.document.getElementById("ft-btn-settings")!;

    settingsBtn.dispatchEvent(new Event("click"));
    expect(popover.classList.contains("ft-popover-open")).toBe(true);

    pip.document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    expect(popover.classList.contains("ft-popover-open")).toBe(false);
    expect(pip.close).not.toHaveBeenCalled();
  });

  test("increases font size via button and persists the config", () => {
    const pip = createPipWindow();
    bindPipWindowEvents(pip, "text", { fontSize: 15, viewMode: "text" } as any);

    pip.document.getElementById("ft-font-inc")!.dispatchEvent(new Event("click"));
    expect(saveMock).toHaveBeenCalledWith({ fontSize: 16 });
    expect(pip.document.getElementById("ft-font-label")!.textContent).toBe("16px");
  });

  test("toggles view mode with Ctrl+M and shows the markdown view", () => {
    const pip = createPipWindow();
    bindPipWindowEvents(pip, "text", { fontSize: 15, viewMode: "text" } as any);

    pip.document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "m", ctrlKey: true, bubbles: true })
    );
    expect(pip.document.getElementById("ft-text-view")!.style.display).toBe("none");
    expect(pip.document.getElementById("ft-markdown-view")!.style.display).toBe("block");
    expect(saveMock).toHaveBeenCalledWith({ viewMode: "markdown" });
  });

  test("copies the whole text via the copy button and shows success feedback", async () => {
    const pip = createPipWindow();
    const writeText = vi.fn().mockResolvedValue(undefined);
    (pip.navigator as any).clipboard = { writeText };
    bindPipWindowEvents(pip, "初始文本内容", { fontSize: 15, viewMode: "text" } as any);

    pip.document.getElementById("ft-btn-copy")!.dispatchEvent(new Event("click"));
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("初始文本内容");
    });
    const copyTooltip = pip.document.getElementById("ft-copy-tooltip")!;
    expect(copyTooltip.innerHTML).toContain("已复制全部内容");
  });

  test("updates opacity label on slider input and persists on change", () => {
    const pip = createPipWindow();
    bindPipWindowEvents(pip, "text", { fontSize: 15, viewMode: "text" } as any);
    const slider = pip.document.getElementById("ft-opacity-slider") as HTMLInputElement;

    slider.value = "50";
    slider.dispatchEvent(new Event("input"));
    expect(pip.document.getElementById("ft-opacity-label")!.textContent).toBe("50%");

    slider.dispatchEvent(new Event("change"));
    expect(saveMock).toHaveBeenCalledWith({ opacity: 0.5 });
  });

  test("remembers window size on resize only when rememberSize is enabled", () => {
    vi.useFakeTimers();
    try {
      loadMock.mockReturnValue({ rememberSize: true } as any);
      const pip = createPipWindow();
      bindPipWindowEvents(pip, "text", { fontSize: 15, viewMode: "text" } as any);

      pip.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(500);
      expect(saveMock).toHaveBeenCalledWith({ width: 420, height: 320 });

      saveMock.mockClear();
      loadMock.mockReturnValue({ rememberSize: false } as any);
      pip.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(500);
      expect(saveMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
