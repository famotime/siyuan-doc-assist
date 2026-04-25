import { describe, expect, it, vi } from "vitest";
import { ALPHA_FEATURE_HIDE_CONFIG } from "@/plugin/alpha-feature-config";
import { createPowerButtonsProvider } from "@/plugin/power-buttons-provider";

describe("power buttons provider", () => {
  it("lists only explicit public commands", async () => {
    const provider = createPowerButtonsProvider({
      pluginVersion: "1.4.5",
      runAction: vi.fn().mockResolvedValue(undefined),
    });

    const commands = await provider.listCommands();
    const commandIds = commands.map(command => command.id);

    expect(commandIds).not.toContain("insert-doc-summary");
    expect(commandIds).not.toContain("clean-ai-output");
    expect(commandIds).toContain("trim-trailing-whitespace");
    expect(commandIds).not.toContain("create-monthly-diary");
  });

  it("filters out hidden actions even when they are in the public whitelist", async () => {
    ALPHA_FEATURE_HIDE_CONFIG.hiddenActionKeys = ["insert-doc-summary"];

    try {
      const provider = createPowerButtonsProvider({
        pluginVersion: "1.4.5",
        runAction: vi.fn().mockResolvedValue(undefined),
      });

      const commandIds = (await provider.listCommands()).map(command => command.id);

      expect(commandIds).not.toContain("insert-doc-summary");
    } finally {
      ALPHA_FEATURE_HIDE_CONFIG.hiddenActionKeys = [];
    }
  });

  it("routes public commands to runAction and rejects unknown commands", async () => {
    const runAction = vi.fn().mockResolvedValue({ ok: true, alreadyNotified: true });
    const provider = createPowerButtonsProvider({
      pluginVersion: "1.4.5",
      runAction,
    });

    const ok = await provider.invokeCommand("export-current", {
      trigger: "button-click",
      sourcePlugin: "siyuan-power-buttons",
    });
    const missing = await provider.invokeCommand("missing-command", {
      trigger: "button-click",
      sourcePlugin: "siyuan-power-buttons",
    });

    expect(runAction).toHaveBeenCalledWith("export-current");
    expect(ok).toEqual({ ok: true, alreadyNotified: true });
    expect(missing).toEqual(expect.objectContaining({
      ok: false,
      errorCode: "command-not-found",
    }));
  });

  it("returns structured failure when current document context is unavailable", async () => {
    const provider = createPowerButtonsProvider({
      pluginVersion: "1.4.5",
      runAction: vi.fn().mockResolvedValue({
        ok: false,
        errorCode: "context-unavailable",
        message: "未找到当前文档",
        alreadyNotified: true,
      }),
    });

    const result = await provider.invokeCommand("export-current", {
      trigger: "button-click",
      sourcePlugin: "siyuan-power-buttons",
    });

    expect(result).toEqual({
      ok: false,
      errorCode: "context-unavailable",
      message: "未找到当前文档",
      alreadyNotified: true,
    });
  });
});
