import { describe, expect, test } from "vitest";
import {
  buildDefaultAiServiceConfig,
  isAiServiceConfigComplete,
  normalizeAiServiceConfig,
} from "@/core/ai-service-config-core";

describe("ai service config core", () => {
  test("returns defaults for missing config", () => {
    expect(buildDefaultAiServiceConfig()).toEqual({
      enabled: false,
      baseUrl: "",
      apiKey: "",
      model: "",
      requestTimeoutSeconds: 30,
    });
  });

  test("normalizes partial config values", () => {
    expect(normalizeAiServiceConfig({
      enabled: true,
      baseUrl: " https://api.example.com/v1 ",
      apiKey: " sk-test ",
      model: " gpt-4.1-mini ",
      requestTimeoutSeconds: 0,
    })).toEqual({
      enabled: true,
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "gpt-4.1-mini",
      requestTimeoutSeconds: 30,
    });
  });

  test("requires enabled flag and endpoint credentials to be complete", () => {
    expect(isAiServiceConfigComplete(buildDefaultAiServiceConfig())).toBe(false);
    expect(isAiServiceConfigComplete({
      enabled: true,
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "gpt-4.1-mini",
      requestTimeoutSeconds: 45,
    })).toBe(true);
  });
});
