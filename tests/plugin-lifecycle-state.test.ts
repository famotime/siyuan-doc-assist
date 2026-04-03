import { describe, expect, test } from "vitest";
import { ACTIONS } from "@/plugin/actions";
import {
  buildDefaultPluginDocMenuState,
  normalizePluginDocMenuState,
  serializePluginDocMenuState,
} from "@/plugin/plugin-lifecycle-state";

describe("plugin lifecycle state", () => {
  test("includes ai summary config in defaults", () => {
    const state = buildDefaultPluginDocMenuState(ACTIONS);

    expect(state.aiSummaryConfig).toEqual({
      enabled: false,
      baseUrl: "",
      apiKey: "",
      model: "",
      requestTimeoutSeconds: 30,
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
    });

    expect(serializePluginDocMenuState(normalized)).toEqual(
      expect.objectContaining({
        aiSummaryConfig: {
          enabled: true,
          baseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          model: "gpt-4.1-mini",
          requestTimeoutSeconds: 60,
        },
      })
    );
  });
});
