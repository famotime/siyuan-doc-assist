import { describe, expect, it, vi } from "vitest";
import { createPowerButtonsProvider } from "@/plugin/power-buttons-provider";

describe("power buttons provider", () => {
  it("exposes protocol v2 and target-doc capabilities for supported public commands", async () => {
    const provider = createPowerButtonsProvider({
      pluginVersion: "1.4.5",
      runAction: vi.fn().mockResolvedValue(undefined),
    });

    const commands = await provider.listCommands();
    const cleanAiOutput = commands.find(command => command.id === "clean-ai-output");
    const toggleSelectedPunctuation = commands.find(command => command.id === "toggle-selected-punctuation");

    expect(provider.protocolVersion).toBe(2);
    expect(cleanAiOutput).toEqual(expect.objectContaining({
      supportsTargetDoc: true,
      supportsSelection: false,
    }));
    expect(toggleSelectedPunctuation).toBeUndefined();
  });

  it("lists only explicit public commands", async () => {
    const provider = createPowerButtonsProvider({
      pluginVersion: "1.4.5",
      runAction: vi.fn().mockResolvedValue(undefined),
    });

    const commands = await provider.listCommands();
    const commandIds = commands.map(command => command.id);

    expect(commandIds).toContain("insert-doc-summary");
    expect(commandIds).toContain("add-related-links-and-tags");
    expect(commandIds).toContain("clean-ai-output");
    expect(commandIds).toContain("trim-trailing-whitespace");
    expect(commandIds).not.toContain("move-backlinks");
    expect(commandIds).not.toContain("toggle-selected-punctuation");
  });

  it("keeps the public provider surface stable even when local UI actions are hidden", async () => {
    const provider = createPowerButtonsProvider({
      pluginVersion: "1.4.5",
      runAction: vi.fn().mockResolvedValue(undefined),
    });

    const commandIds = (await provider.listCommands()).map(command => command.id);

    expect(commandIds).toContain("insert-doc-summary");
    expect(commandIds).toContain("clean-ai-output");
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

    expect(runAction).toHaveBeenCalledWith("export-current", {
      trigger: "button-click",
      sourcePlugin: "siyuan-power-buttons",
    });
    expect(ok).toEqual({ ok: true, alreadyNotified: true });
    expect(missing).toEqual(expect.objectContaining({
      ok: false,
      errorCode: "command-not-found",
    }));
  });

  it("passes workflow-step doc context to runAction", async () => {
    const runAction = vi.fn().mockResolvedValue({ ok: true, alreadyNotified: true });
    const provider = createPowerButtonsProvider({
      pluginVersion: "1.4.5",
      runAction,
    });

    await provider.invokeCommand("clean-ai-output", {
      trigger: "workflow-step",
      sourcePlugin: "siyuan-power-automate",
      sourcePluginVersion: "0.3.0",
      docId: "doc-target",
      scope: "related-docs",
      workflowId: "wf-1",
      stepIndex: 2,
    } as any);

    expect(runAction).toHaveBeenCalledWith("clean-ai-output", {
      trigger: "workflow-step",
      sourcePlugin: "siyuan-power-automate",
      sourcePluginVersion: "0.3.0",
      docId: "doc-target",
      scope: "related-docs",
      workflowId: "wf-1",
      stepIndex: 2,
    });
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
