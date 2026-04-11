import { ACTIONS, type ActionKey } from "@/plugin/actions";
import { filterVisibleActions } from "@/plugin/alpha-feature-config";
import type { ActionRunResult } from "@/plugin/action-runner";
import type { PowerButtonsCommandProvider } from "@/plugin/power-buttons-provider-types";

const PUBLIC_ACTION_KEYS = new Set<ActionKey>([
  "export-current",
  "export-child-docs-zip",
  "export-child-key-info-zip",
  "insert-backlinks",
  "insert-child-docs",
  "create-open-docs-summary",
  "clean-ai-output",
  "trim-trailing-whitespace",
  "remove-extra-blank-lines",
  "toggle-links-refs",
  "insert-doc-summary",
]);

export function createPowerButtonsProvider(options: {
  pluginVersion: string;
  runAction: (action: ActionKey) => Promise<ActionRunResult>;
}): PowerButtonsCommandProvider {
  const getPublicActions = () => filterVisibleActions(ACTIONS)
    .filter(action => PUBLIC_ACTION_KEYS.has(action.key));

  const getPublicAction = (commandId: string) =>
    getPublicActions().find(action => action.key === commandId);

  return {
    protocol: "power-buttons-command-provider",
    protocolVersion: 1,
    providerId: "siyuan-doc-assist",
    providerName: "文档助手 / Doc Assist",
    providerVersion: options.pluginVersion,
    listCommands: () => getPublicActions().map(action => ({
      id: action.key,
      title: action.commandText,
      description: action.tooltip,
      category: action.group,
      desktopOnly: action.desktopOnly,
    })),
    invokeCommand: async (commandId) => {
      const action = getPublicAction(commandId);
      if (!action) {
        return {
          ok: false,
          errorCode: "command-not-found",
          message: `未找到公开命令：${commandId}`,
        };
      }

      try {
        return await options.runAction(action.key);
      } catch (error) {
        return {
          ok: false,
          errorCode: "execution-failed",
          message: error instanceof Error ? error.message : `执行外部命令失败：${commandId}`,
        };
      }
    },
  };
}
