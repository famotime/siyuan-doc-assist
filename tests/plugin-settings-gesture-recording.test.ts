// @vitest-environment jsdom
import { describe, expect, vi, test } from "vitest";
import { createGestureSettingsPanel } from "@/ui/plugin-settings-gesture";
import { DEFAULT_GESTURE_BINDINGS } from "@/core/gesture-recognition-core";

vi.mock("siyuan", () => ({
  showMessage: vi.fn()
}));

function pressRecordButton(panel: HTMLElement): void {
  const button = panel.querySelector<HTMLButtonElement>("[data-gesture-record]");
  if (!button) {
    throw new Error("record button not found");
  }
  button.click();
}

function strokeRightButton(): void {
  const target = document.body;
  target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 2 }));
  target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, button: 2, clientX: 10, clientY: 10 }));
  target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, button: 2, clientX: 220, clientY: 10 }));
  target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 2, clientX: 220, clientY: 10 }));
}

describe("gesture settings recording lifecycle", () => {
  test("destroying the panel finishes an in-flight recording", () => {
    const onRecordingStateChange = vi.fn();
    const onBindingsChange = vi.fn();
    const { panel, destroy } = createGestureSettingsPanel({
      enabled: true,
      bindings: { ...DEFAULT_GESTURE_BINDINGS },
      onEnabledChange: async () => undefined,
      onBindingsChange,
      onRecordingStateChange
    });

    pressRecordButton(panel);
    expect(onRecordingStateChange).toHaveBeenLastCalledWith(true);
    expect(panel.classList.contains("is-recording")).toBe(true);

    // Closing the settings dialog (X/scrim) must terminate the recording:
    // otherwise the leaked capture turns the next unrelated stroke into a binding.
    destroy();

    expect(onRecordingStateChange).toHaveBeenLastCalledWith(false);
    expect(panel.classList.contains("is-recording")).toBe(false);

    strokeRightButton();
    expect(onBindingsChange).not.toHaveBeenCalled();
  });

  test("destroy is a no-op when no recording is in flight", () => {
    const onRecordingStateChange = vi.fn();
    const { destroy } = createGestureSettingsPanel({
      enabled: true,
      bindings: { ...DEFAULT_GESTURE_BINDINGS },
      onEnabledChange: async () => undefined,
      onBindingsChange: async () => undefined,
      onRecordingStateChange
    });

    expect(() => destroy()).not.toThrow();
    expect(onRecordingStateChange).not.toHaveBeenCalled();
  });
});
