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
    expect(state.monthlyDiaryTemplate).toContain("{{date}}");
    expect(state.monthlyDiaryTemplate).toContain("{{weekday}}");
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

  test("normalizes and serializes monthly diary template", () => {
    const normalized = normalizePluginDocMenuState({
      monthlyDiaryTemplate: "## {{date}} {{weekday}}\n\n- 今日回顾",
    }, ACTIONS);

    expect(normalized.monthlyDiaryTemplate).toBe("## {{date}} {{weekday}}\n\n- 今日回顾");

    expect(serializePluginDocMenuState(normalized)).toEqual(
      expect.objectContaining({
        monthlyDiaryTemplate: "## {{date}} {{weekday}}\n\n- 今日回顾",
      })
    );
  });
});
