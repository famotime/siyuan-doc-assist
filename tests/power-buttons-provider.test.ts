import { describe, expect, it, vi } from "vitest";
import { createPowerButtonsProvider } from "@/plugin/power-buttons-provider";

describe("power buttons provider", () => {
  it("lists only explicit public commands", async () => {
    const provider = createPowerButtonsProvider({
      pluginVersion: "1.4.5",
      runAction: vi.fn().mockResolvedValue(undefined),
    });

    const commands = await provider.listCommands();
    const commandIds = commands.map(command => command.id);

    expect(commandIds).toContain("insert-doc-summary");
    expect(commandIds).toContain("clean-ai-output");
    expect(commandIds).toContain("trim-trailing-whitespace");
    expect(commandIds).not.toContain("create-monthly-diary");
  });

  it("routes public commands to runAction and rejects unknown commands", async () => {
    const runAction = vi.fn().mockResolvedValue(undefined);
    const provider = createPowerButtonsProvider({
      pluginVersion: "1.4.5",
      runAction,
    });

    const ok = await provider.invokeCommand("insert-doc-summary", {
      trigger: "button-click",
      sourcePlugin: "siyuan-power-buttons",
    });
    const missing = await provider.invokeCommand("missing-command", {
      trigger: "button-click",
      sourcePlugin: "siyuan-power-buttons",
    });

    expect(runAction).toHaveBeenCalledWith("insert-doc-summary");
    expect(ok).toEqual({ ok: true, alreadyNotified: true });
    expect(missing).toEqual(expect.objectContaining({
      ok: false,
      errorCode: "command-not-found",
    }));
  });
});
