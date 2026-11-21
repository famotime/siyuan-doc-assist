import { describe, expect, test } from "vitest";
import { ACTIONS } from "@/plugin/actions";
import { DEFAULT_GESTURE_BINDINGS } from "@/core/gesture-recognition-core";
import {
  buildDefaultPluginDocMenuState,
  normalizePluginDocMenuState,
  serializePluginDocMenuState,
  setPluginMouseGestureBindings,
  setPluginMouseGestureEnabled,
  setPluginStartupDocProcessTabEnabled,
  setPluginDynamicOutlinePosition
} from "@/plugin/plugin-lifecycle-state";

describe("plugin lifecycle state", () => {
  test("includes ai summary config in defaults", () => {
    const state = buildDefaultPluginDocMenuState(ACTIONS);

    expect(state.aiSummaryConfig).toEqual({
      enabled: false,
      baseUrl: "",
      apiKey: "",
      model: "",
      requestTimeoutSeconds: 60,
      temperature: 0.7,
      maxTokens: 4096
    });
  });

  test("normalizes and serializes ai summary config", () => {
    const normalized = normalizePluginDocMenuState({
      aiSummaryConfig: {
        enabled: true,
        baseUrl: " https://api.example.com/v1 ",
        apiKey: " sk-test ",
        model: " gpt-4.1-mini ",
        requestTimeoutSeconds: 60
      }
    }, ACTIONS);

    expect(normalized.aiSummaryConfig).toEqual({
      enabled: true,
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "gpt-4.1-mini",
      requestTimeoutSeconds: 60,
      temperature: 0.7,
      maxTokens: 4096
    });

    expect(serializePluginDocMenuState(normalized)).toEqual(
      expect.objectContaining({
        aiSummaryConfig: {
          enabled: true,
          baseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          model: "gpt-4.1-mini",
          requestTimeoutSeconds: 60,
          temperature: 0.7,
          maxTokens: 4096
        }
      })
    );
  });

  test("defaults startupDocProcessTabEnabled to false", () => {
    const state = buildDefaultPluginDocMenuState(ACTIONS);
    expect(state.startupDocProcessTabEnabled).toBe(false);
  });

  test("normalizes and serializes startupDocProcessTabEnabled", () => {
    const stateWithTrue = normalizePluginDocMenuState({
      startupDocProcessTabEnabled: true
    }, ACTIONS);
    expect(stateWithTrue.startupDocProcessTabEnabled).toBe(true);

    const stateWithFalse = normalizePluginDocMenuState({
      startupDocProcessTabEnabled: false
    }, ACTIONS);
    expect(stateWithFalse.startupDocProcessTabEnabled).toBe(false);

    const stateWithInvalid = normalizePluginDocMenuState({
      startupDocProcessTabEnabled: "invalid"
    }, ACTIONS);
    expect(stateWithInvalid.startupDocProcessTabEnabled).toBe(false);

    const stateWithMissing = normalizePluginDocMenuState({}, ACTIONS);
    expect(stateWithMissing.startupDocProcessTabEnabled).toBe(false);

    expect(serializePluginDocMenuState(stateWithTrue)).toEqual(
      expect.objectContaining({
        startupDocProcessTabEnabled: true
      })
    );
  });

  test("updates startupDocProcessTabEnabled via setPluginStartupDocProcessTabEnabled", () => {
    const initial = buildDefaultPluginDocMenuState(ACTIONS);
    expect(initial.startupDocProcessTabEnabled).toBe(false);

    const updated = setPluginStartupDocProcessTabEnabled(initial, true);
    expect(updated.startupDocProcessTabEnabled).toBe(true);
    expect(initial.startupDocProcessTabEnabled).toBe(false);

    const reverted = setPluginStartupDocProcessTabEnabled(updated, false);
    expect(reverted.startupDocProcessTabEnabled).toBe(false);
  });

  test("defaults mouse gesture state", () => {
    const state = buildDefaultPluginDocMenuState(ACTIONS);
    expect(state.mouseGestureEnabled).toBe(false);
    expect(state.mouseGestureBindings).toEqual(DEFAULT_GESTURE_BINDINGS);
  });

  test("normalizes and serializes mouse gesture state", () => {
    const normalized = normalizePluginDocMenuState({
      mouseGestureEnabled: true,
      mouseGestureBindings: {
        "previous-doc": "U",
        "next-doc": "invalid-seq",
        "close-current-doc": "D,R"
      }
    }, ACTIONS);

    expect(normalized.mouseGestureEnabled).toBe(true);
    expect(normalized.mouseGestureBindings).toEqual({
      "previous-doc": "U",
      "next-doc": "R",
      "close-current-doc": "D,R"
    });

    expect(serializePluginDocMenuState(normalized)).toEqual(
      expect.objectContaining({
        mouseGestureEnabled: true,
        mouseGestureBindings: {
          "previous-doc": "U",
          "next-doc": "R",
          "close-current-doc": "D,R"
        }
      })
    );

    const fallback = normalizePluginDocMenuState({}, ACTIONS);
    expect(fallback.mouseGestureEnabled).toBe(false);
    expect(fallback.mouseGestureBindings).toEqual(DEFAULT_GESTURE_BINDINGS);
  });

  test("updates mouse gesture state via setters", () => {
    const initial = buildDefaultPluginDocMenuState(ACTIONS);
    expect(initial.mouseGestureEnabled).toBe(false);

    const enabled = setPluginMouseGestureEnabled(initial, true);
    expect(enabled.mouseGestureEnabled).toBe(true);
    expect(initial.mouseGestureEnabled).toBe(false);

    const rebound = setPluginMouseGestureBindings(enabled, {
      "previous-doc": "U",
      "next-doc": "R",
      "close-current-doc": ""
    });
    expect(rebound.mouseGestureBindings).toEqual({
      "previous-doc": "U",
      "next-doc": "R",
      "close-current-doc": "D,R"
    });
  });

  test("normalizes, serializes and updates dynamic outline position", () => {
    const initial = buildDefaultPluginDocMenuState(ACTIONS);
    expect(initial.dynamicOutlinePosition).toBe("right");

    const leftState = setPluginDynamicOutlinePosition(initial, "left");
    expect(leftState.dynamicOutlinePosition).toBe("left");

    const normalized = normalizePluginDocMenuState({ dynamicOutlinePosition: "left" }, ACTIONS);
    expect(normalized.dynamicOutlinePosition).toBe("left");

    const normalizedInvalid = normalizePluginDocMenuState({ dynamicOutlinePosition: "invalid" }, ACTIONS);
    expect(normalizedInvalid.dynamicOutlinePosition).toBe("right");

    expect(serializePluginDocMenuState(leftState)).toEqual(
      expect.objectContaining({
        dynamicOutlinePosition: "left"
      })
    );
  });
});
