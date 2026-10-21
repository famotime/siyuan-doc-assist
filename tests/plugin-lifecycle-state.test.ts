import { describe, expect, test } from "vitest";
import { ACTIONS } from "@/plugin/actions";
import {
  buildDefaultPluginDocMenuState,
  normalizePluginDocMenuState,
  serializePluginDocMenuState,
  setPluginStartupDocProcessTabEnabled,
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
      maxTokens: 4096,
    });
  });

  test("normalizes and serializes ai summary config", () => {
    const normalized = normalizePluginDocMenuState({
      aiSummaryConfig: {
        enabled: true,
        baseUrl: " https://api.example.com/v1 ",
        apiKey: " sk-test ",
        model: " gpt-4.1-mini ",
        requestTimeoutSeconds: 60,
      },
    }, ACTIONS);

    expect(normalized.aiSummaryConfig).toEqual({
      enabled: true,
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "gpt-4.1-mini",
      requestTimeoutSeconds: 60,
      temperature: 0.7,
      maxTokens: 4096,
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
          maxTokens: 4096,
        },
      })
    );
  });

  test("defaults startupDocProcessTabEnabled to false", () => {
    const state = buildDefaultPluginDocMenuState(ACTIONS);
    expect(state.startupDocProcessTabEnabled).toBe(false);
  });

  test("normalizes and serializes startupDocProcessTabEnabled", () => {
    const stateWithTrue = normalizePluginDocMenuState({
      startupDocProcessTabEnabled: true,
    }, ACTIONS);
    expect(stateWithTrue.startupDocProcessTabEnabled).toBe(true);

    const stateWithFalse = normalizePluginDocMenuState({
      startupDocProcessTabEnabled: false,
    }, ACTIONS);
    expect(stateWithFalse.startupDocProcessTabEnabled).toBe(false);

    const stateWithInvalid = normalizePluginDocMenuState({
      startupDocProcessTabEnabled: "invalid",
    }, ACTIONS);
    expect(stateWithInvalid.startupDocProcessTabEnabled).toBe(false);

    const stateWithMissing = normalizePluginDocMenuState({}, ACTIONS);
    expect(stateWithMissing.startupDocProcessTabEnabled).toBe(false);

    expect(serializePluginDocMenuState(stateWithTrue)).toEqual(
      expect.objectContaining({
        startupDocProcessTabEnabled: true,
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
});
