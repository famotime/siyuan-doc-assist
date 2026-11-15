export interface PowerButtonsInvokeContext {
  trigger: "button-click" | "workflow-step";
  sourcePlugin: string;
  sourcePluginVersion?: string;
  surface?: string;
  buttonId?: string;
  docId?: string;
  scope?: "full-doc" | "selection" | "related-docs";
  selectionBlockIds?: string[];
  workflowId?: string;
  stepIndex?: number;
  skipConfirm?: boolean;
  confirmed?: boolean;
}

type PowerButtonsInvokeErrorCode =
  | "command-not-found" |
  "provider-unavailable" |
  "context-unavailable" |
  "not-supported" |
  "execution-failed" |
  "cancelled";

export type PowerButtonsInvokeResult =
  | {
    ok: true;
    message?: string;
    alreadyNotified?: boolean;
  } |
  {
    ok: false;
    message?: string;
    alreadyNotified?: boolean;
    errorCode: PowerButtonsInvokeErrorCode;
  };

export interface PowerButtonsPublicCommand {
  id: string;
  title: string;
  description?: string;
  category?: string;
  desktopOnly?: boolean;
  supportsTargetDoc?: boolean;
  supportsSelection?: boolean;
}

export interface PowerButtonsCommandProvider {
  protocol: "power-buttons-command-provider";
  protocolVersion: 2;
  providerId: string;
  providerName: string;
  providerVersion?: string;
  listCommands: () => Promise<PowerButtonsPublicCommand[]> | PowerButtonsPublicCommand[];
  invokeCommand: (
    commandId: string,
    context: PowerButtonsInvokeContext
  ) => Promise<PowerButtonsInvokeResult> | PowerButtonsInvokeResult;
}
