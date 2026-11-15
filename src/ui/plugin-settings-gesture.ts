import { showMessage } from "siyuan";
import {
  DEFAULT_GESTURE_BINDINGS,
  findGestureConflict,
  formatDirectionHint,
  formatGestureSequence,
  GestureBindings,
  MAX_GESTURE_LENGTH,
  MOUSE_GESTURE_ACTION_HINTS,
  MOUSE_GESTURE_ACTION_KEYS,
  MOUSE_GESTURE_ACTION_LABELS,
  MouseGestureActionKey,
  serializeDirections
} from "@/core/gesture-recognition-core";
import { createGestureCapture } from "@/ui/gesture-capture";
import { createElement } from "@/ui/plugin-settings-shared";

type CreateGestureSettingsPanelOptions = {
  enabled: boolean;
  bindings: GestureBindings;
  onEnabledChange: (enabled: boolean) => Promise<void> | void;
  onBindingsChange: (bindings: GestureBindings) => Promise<void> | void;
  /** 录制状态变化（用于挂起运行中的手势捕获，避免录制与执行互相干扰） */
  onRecordingStateChange?: (recording: boolean) => void;
};

export function createGestureSettingsPanel(
  options: CreateGestureSettingsPanelOptions
): HTMLDivElement {
  let enabled = options.enabled;
  let bindings: GestureBindings = { ...options.bindings };
  let recording: MouseGestureActionKey | null = null;
  let escHandler: ((event: KeyboardEvent) => void) | null = null;

  const panel = createElement(
    "div",
    "doc-assistant-settings__gesture-panel doc-assistant-settings__section-card"
  );

  const sequenceEls = new Map<MouseGestureActionKey, HTMLElement>();
  const recordButtons = new Map<MouseGestureActionKey, HTMLButtonElement>();

  const refreshSequences = () => {
    for (const key of MOUSE_GESTURE_ACTION_KEYS) {
      const el = sequenceEls.get(key);
      if (el) {
        el.textContent = formatGestureSequence(bindings[key]);
      }
    }
  };

  const setRecordButtonLabels = (activeKey: MouseGestureActionKey | null, hint: string) => {
    for (const [actionKey, button] of recordButtons) {
      button.textContent = actionKey === activeKey ? hint : "录制";
    }
  };

  const finishRecording = () => {
    if (!recording) {
      return;
    }
    recording = null;
    capture.unbind();
    if (escHandler) {
      document.removeEventListener("keydown", escHandler, true);
      escHandler = null;
    }
    options.onRecordingStateChange?.(false);
    setRecordButtonLabels(null, "录制");
    panel.classList.remove("is-recording");
  };

  const capture = createGestureCapture({
    shouldHandle: () => recording !== null,
    onStrokeStart: () => {
      if (recording) {
        setRecordButtonLabels(recording, "划动中…");
      }
    },
    onStrokeMove: (state) => {
      if (!recording) {
        return;
      }
      const hint = state.directions.length ?
          formatDirectionHint(state.directions) :
        "划动中…";
      setRecordButtonLabels(recording, hint);
    },
    onStrokeEnd: (state) => {
      const action = recording;
      finishRecording();
      if (!action || !enabled) {
        return;
      }
      if (!state.moved) {
        showMessage("未检测到手势划动，已保持原手势", 3500, "info");
        return;
      }
      if (state.directions.length > MAX_GESTURE_LENGTH) {
        showMessage(`手势最多支持 ${MAX_GESTURE_LENGTH} 段方向，请重新录制`, 4000, "error");
        return;
      }
      const sequence = serializeDirections(state.directions);
      const conflict = findGestureConflict(sequence, bindings, action);
      if (conflict) {
        showMessage(
          `该手势已绑定「${MOUSE_GESTURE_ACTION_LABELS[conflict]}」，请换一个手势`,
          4500,
          "error"
        );
        return;
      }
      bindings = { ...bindings, [action]: sequence };
      refreshSequences();
      void options.onBindingsChange(bindings);
    },
    onStrokeCancel: () => {
      finishRecording();
    }
  });

  // 总开关行
  const switchRow = createElement("div", "doc-assistant-settings__gesture-switch");
  const switchText = createElement("div", "doc-assistant-settings__gesture-switch-text");
  switchText.append(
    createElement("div", "doc-assistant-settings__gesture-switch-title", "启用鼠标手势"),
    createElement(
      "div",
      "doc-assistant-settings__gesture-switch-hint",
      "在文档编辑器中按住鼠标右键划动手势，触发文档切换与关闭操作；普通右键菜单不受影响。"
    )
  );
  const enabledToggle = document.createElement("input");
  enabledToggle.className = "b3-switch fn__flex-center";
  enabledToggle.type = "checkbox";
  enabledToggle.checked = enabled;
  enabledToggle.dataset.settingKey = "gesture-enabled";
  enabledToggle.addEventListener("change", () => {
    enabled = enabledToggle.checked;
    syncDisabledState();
    void options.onEnabledChange(enabled);
  });
  const switchControl = createElement("div", "doc-assistant-settings__gesture-switch-control");
  switchControl.append(enabledToggle);
  switchRow.append(switchText, switchControl);

  // 三个动作的手势行
  const fields = createElement("div", "doc-assistant-settings__gesture-fields");
  fields.dataset.settingSection = "gesture-fields";

  for (const key of MOUSE_GESTURE_ACTION_KEYS) {
    const row = createElement("div", "doc-assistant-settings__gesture-action-row");
    row.dataset.gestureAction = key;

    const meta = createElement("div", "doc-assistant-settings__gesture-action-meta");
    meta.append(
      createElement("div", "doc-assistant-settings__gesture-action-label", MOUSE_GESTURE_ACTION_LABELS[key]),
      createElement("div", "doc-assistant-settings__gesture-action-hint", MOUSE_GESTURE_ACTION_HINTS[key])
    );

    const sequenceEl = createElement("span", "doc-assistant-settings__gesture-sequence");
    sequenceEl.dataset.gestureSequence = key;
    sequenceEls.set(key, sequenceEl);

    const recordButton = document.createElement("button");
    recordButton.type = "button";
    recordButton.className = "b3-button b3-button--outline b3-button--small";
    recordButton.dataset.gestureRecord = key;
    recordButton.textContent = "录制";
    recordButton.addEventListener("click", (event) => {
      event.preventDefault();
      if (!enabled || recording) {
        return;
      }
      recording = key;
      options.onRecordingStateChange?.(true);
      capture.bind();
      escHandler = (keyboardEvent: KeyboardEvent) => {
        if (keyboardEvent.key === "Escape") {
          keyboardEvent.preventDefault();
          keyboardEvent.stopImmediatePropagation();
          finishRecording();
        }
      };
      document.addEventListener("keydown", escHandler, true);
      panel.classList.add("is-recording");
      setRecordButtonLabels(key, "按住右键划动手势…");
    });
    recordButtons.set(key, recordButton);

    row.append(meta, sequenceEl, recordButton);
    fields.append(row);
  }
  refreshSequences();

  // 底部：恢复默认 + 使用提示
  const footer = createElement("div", "doc-assistant-settings__gesture-footer");
  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "b3-button b3-button--outline b3-button--small";
  resetButton.dataset.gestureReset = "true";
  resetButton.textContent = "恢复默认手势";
  resetButton.addEventListener("click", (event) => {
    event.preventDefault();
    if (!enabled) {
      return;
    }
    bindings = { ...DEFAULT_GESTURE_BINDINGS };
    refreshSequences();
    void options.onBindingsChange(bindings);
  });
  const tip = createElement(
    "div",
    "doc-assistant-settings__gesture-tip",
    "点击「录制」后，按住鼠标右键划出手势，松开即完成绑定；按 Esc 取消。"
  );
  footer.append(resetButton, tip);

  const syncDisabledState = () => {
    fields.classList.toggle("is-disabled", !enabled);
    footer.classList.toggle("is-disabled", !enabled);
    for (const button of recordButtons.values()) {
      button.disabled = !enabled;
    }
    resetButton.disabled = !enabled;
  };
  syncDisabledState();

  panel.append(switchRow, fields, footer);
  return panel;
}
