import { ACTIONS, type ActionKey } from "@/plugin/actions";
import type { ActionRunResult } from "@/plugin/action-runner";
import type {
  PowerButtonsCommandProvider,
  PowerButtonsInvokeContext,
  PowerButtonsPublicCommand,
} from "@/plugin/power-buttons-provider-types";

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
  "delete-from-current-to-end",
  "delete-from-start-to-current",
  "convert-images-to-webp",
  "recognize-doc-images",
  "add-related-links-and-tags",
  "generate-llm-wiki",
]);

const TARGET_DOC_SUPPORTED_ACTION_KEYS = new Set<ActionKey>([
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
  "convert-images-to-webp",
  "recognize-doc-images",
  "add-related-links-and-tags",
  "generate-llm-wiki",
]);

const SELECTION_SUPPORTED_ACTION_KEYS = new Set<ActionKey>([]);

function toPublicCommand(action: (typeof ACTIONS)[number]): PowerButtonsPublicCommand {
  return {
    id: action.key,
    title: action.commandText,
    description: action.tooltip,
    category: action.group,
    desktopOnly: action.desktopOnly,
    supportsTargetDoc: TARGET_DOC_SUPPORTED_ACTION_KEYS.has(action.key),
    supportsSelection: SELECTION_SUPPORTED_ACTION_KEYS.has(action.key),
  };
}

export function createPowerButtonsProvider(options: {
  pluginVersion: string;
  runAction: (action: ActionKey, context: PowerButtonsInvokeContext) => Promise<ActionRunResult>;
}): PowerButtonsCommandProvider {
  const getPublicActions = () => ACTIONS
    .filter(action => PUBLIC_ACTION_KEYS.has(action.key));

  const getPublicAction = (commandId: string) =>
    getPublicActions().find(action => action.key === commandId);

  return {
    protocol: "power-buttons-command-provider",
    protocolVersion: 2,
    providerId: "siyuan-doc-assist",
    providerName: "文档助手 / Doc Assist",
    providerVersion: options.pluginVersion,
    listCommands: () => getPublicActions().map(toPublicCommand),
    invokeCommand: async (commandId, context) => {
      const action = getPublicAction(commandId);
      if (!action) {
        return {
          ok: false,
          errorCode: "command-not-found",
          message: `未找到公开命令：${commandId}`,
        };
      }

      try {
        return await options.runAction(action.key, context);
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
