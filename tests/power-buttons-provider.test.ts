import { describe, expect, vi, test } from "vitest";
import { createPowerButtonsProvider } from "@/plugin/power-buttons-provider";

describe("power buttons provider", () => {
  test("exposes protocol v2 and target-doc capabilities for supported public commands", async () => {
    const provider = createPowerButtonsProvider({
      pluginVersion: "1.4.5",
      runAction: vi.fn().mockResolvedValue(undefined)
    });

    const commands = await provider.listCommands();
    const cleanAiOutput = commands.find((command) => command.id === "clean-ai-output");
    const toggleSelectedPunctuation = commands.find((command) => command.id === "toggle-selected-punctuation");

    expect(provider.protocolVersion).toBe(2);
    expect(cleanAiOutput).toEqual(expect.objectContaining({
      supportsTargetDoc: true,
      supportsSelection: false
    }));
    expect(toggleSelectedPunctuation).toBeUndefined();
  });

  test("lists only explicit public commands", async () => {
    const provider = createPowerButtonsProvider({
      pluginVersion: "1.4.5",
      runAction: vi.fn().mockResolvedValue(undefined)
    });

    const commands = await provider.listCommands();
    const commandIds = commands.map((command) => command.id);

    expect(commandIds).toContain("insert-doc-summary");
    expect(commandIds).toContain("add-related-links-and-tags");
    expect(commandIds).toContain("clean-ai-output");
    expect(commandIds).toContain("trim-trailing-whitespace");
    expect(commandIds).not.toContain("move-backlinks");
    expect(commandIds).not.toContain("toggle-selected-punctuation");
  });

  test("exposes the cleanup and organize batch synced with siyuan-mate catalog", async () => {
    const provider = createPowerButtonsProvider({
      pluginVersion: "1.4.5",
      runAction: vi.fn().mockResolvedValue(undefined)
    });

    const commands = await provider.listCommands();
    const commandIds = commands.map((command) => command.id);

    for (const id of [
      "clean-emoji",
      "clean-clipped-list-prefixes",
      "remove-strikethrough-marked-content",
      "toggle-heading-bold",
      "mark-invalid-links-refs",
      "extract-web-links",
      "dedupe",
      "split-doc-by-headings",
      "create-doc-concept-map",
      "generate-better-titles"
    ]) {
      expect(commandIds).toContain(id);
      expect(commands.find((command) => command.id === id)).toEqual(expect.objectContaining({
        supportsTargetDoc: true,
        supportsSelection: false
      }));
    }
  });

  test("routes clean-emoji invocations to runAction instead of command-not-found", async () => {
    const runAction = vi.fn().mockResolvedValue({ ok: true, alreadyNotified: true });
    const provider = createPowerButtonsProvider({
      pluginVersion: "1.4.5",
      runAction
    });

    const res = await provider.invokeCommand("clean-emoji", {
      trigger: "button-click",
      sourcePlugin: "siyuan-mate",
      docId: "doc-target"
    } as any);

    expect(res).toEqual({ ok: true, alreadyNotified: true });
    expect(runAction).toHaveBeenCalledWith("clean-emoji", expect.objectContaining({
      sourcePlugin: "siyuan-mate",
      docId: "doc-target"
    }));
  });

  test("keeps the public provider surface stable even when local UI actions are hidden", async () => {
    const provider = createPowerButtonsProvider({
      pluginVersion: "1.4.5",
      runAction: vi.fn().mockResolvedValue(undefined)
    });

    const commandIds = (await provider.listCommands()).map((command) => command.id);

    expect(commandIds).toContain("insert-doc-summary");
    expect(commandIds).toContain("clean-ai-output");
  });

  test("routes public commands to runAction and rejects unknown commands", async () => {
    const runAction = vi.fn().mockResolvedValue({ ok: true, alreadyNotified: true });
    const provider = createPowerButtonsProvider({
      pluginVersion: "1.4.5",
      runAction
    });

    const ok = await provider.invokeCommand("export-current", {
      trigger: "button-click",
      sourcePlugin: "siyuan-power-buttons"
    });
    const missing = await provider.invokeCommand("missing-command", {
      trigger: "button-click",
      sourcePlugin: "siyuan-power-buttons"
    });

    expect(runAction).toHaveBeenCalledWith("export-current", {
      trigger: "button-click",
      sourcePlugin: "siyuan-power-buttons"
    });
    expect(ok).toEqual({ ok: true, alreadyNotified: true });
    expect(missing).toEqual(expect.objectContaining({
      ok: false,
      errorCode: "command-not-found"
    }));
  });

  test("passes workflow-step doc context to runAction", async () => {
    const runAction = vi.fn().mockResolvedValue({ ok: true, alreadyNotified: true });
    const provider = createPowerButtonsProvider({
      pluginVersion: "1.4.5",
      runAction
    });

    await provider.invokeCommand("clean-ai-output", {
      trigger: "workflow-step",
      sourcePlugin: "siyuan-power-automate",
      sourcePluginVersion: "0.3.0",
      docId: "doc-target",
      scope: "related-docs",
      workflowId: "wf-1",
      stepIndex: 2
    } as any);

    expect(runAction).toHaveBeenCalledWith("clean-ai-output", {
      trigger: "workflow-step",
      sourcePlugin: "siyuan-power-automate",
      sourcePluginVersion: "0.3.0",
      docId: "doc-target",
      scope: "related-docs",
      workflowId: "wf-1",
      stepIndex: 2
    });
  });

  test("returns structured failure when current document context is unavailable", async () => {
    const provider = createPowerButtonsProvider({
      pluginVersion: "1.4.5",
      runAction: vi.fn().mockResolvedValue({
        ok: false,
        errorCode: "context-unavailable",
        message: "未找到当前文档",
        alreadyNotified: true
      })
    });

    const result = await provider.invokeCommand("export-current", {
      trigger: "button-click",
      sourcePlugin: "siyuan-power-buttons"
    });

    expect(result).toEqual({
      ok: false,
      errorCode: "context-unavailable",
      message: "未找到当前文档",
      alreadyNotified: true
    });
  });
});
