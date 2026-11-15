import { describe, expect, test } from "vitest";
import {
  buildDefaultAiServiceConfig,
  isAiServiceConfigComplete,
  normalizeAiServiceConfig
} from "@/core/ai-service-config-core";

describe("ai service config core", () => {
  test("returns defaults for missing config", () => {
    expect(buildDefaultAiServiceConfig()).toEqual({
      enabled: false,
      baseUrl: "",
      apiKey: "",
      model: "",
      requestTimeoutSeconds: 60,
      temperature: 0.7,
      maxTokens: 4096
    });
  });

  test("normalizes partial config values", () => {
    expect(normalizeAiServiceConfig({
      enabled: true,
      baseUrl: " https://api.example.com/v1 ",
      apiKey: " sk-test ",
      model: " gpt-4.1-mini ",
      requestTimeoutSeconds: 0
    })).toEqual({
      enabled: true,
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "gpt-4.1-mini",
      requestTimeoutSeconds: 60,
      temperature: 0.7,
      maxTokens: 4096
    });
  });

  test("strips zero-width and invisible Unicode characters from string fields", () => {
    const zwsp = "​";
    const result = normalizeAiServiceConfig({
      enabled: true,
      baseUrl: `${zwsp}https://api.example.com/v1${zwsp}`,
      apiKey: `${zwsp}sk-test${zwsp}`,
      model: `${zwsp}mimo-v2.5-pro${zwsp}`
    });
    expect(result.baseUrl).toBe("https://api.example.com/v1");
    expect(result.apiKey).toBe("sk-test");
    expect(result.model).toBe("mimo-v2.5-pro");
  });

  test("requires enabled flag and endpoint credentials to be complete", () => {
    expect(isAiServiceConfigComplete(buildDefaultAiServiceConfig())).toBe(false);
    expect(isAiServiceConfigComplete({
      enabled: true,
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "gpt-4.1-mini",
      requestTimeoutSeconds: 45
    })).toBe(true);
  });
});
