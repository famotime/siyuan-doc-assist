export interface PowerButtonsInvokeContext {
  trigger: "button-click";
  sourcePlugin: "siyuan-power-buttons";
  sourcePluginVersion?: string;
  surface?: string;
  buttonId?: string;
}

type PowerButtonsInvokeErrorCode =
  | "command-not-found"
  | "provider-unavailable"
  | "context-unavailable"
  | "not-supported"
  | "execution-failed";

export type PowerButtonsInvokeResult =
  | {
      ok: true;
      message?: string;
      alreadyNotified?: boolean;
    }
  | {
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
}

export interface PowerButtonsCommandProvider {
  protocol: "power-buttons-command-provider";
  protocolVersion: 1;
  providerId: string;
  providerName: string;
  providerVersion?: string;
  listCommands: () => Promise<PowerButtonsPublicCommand[]> | PowerButtonsPublicCommand[];
  invokeCommand: (
    commandId: string,
    context: PowerButtonsInvokeContext,
  ) => Promise<PowerButtonsInvokeResult> | PowerButtonsInvokeResult;
}
