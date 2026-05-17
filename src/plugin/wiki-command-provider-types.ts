export interface WikiCommandInvokeContext {
  trigger: "manual" | "workflow-step";
  sourcePlugin: string;
  sourcePluginVersion?: string;
  themeDocumentId?: string;
  sourceDocumentIds?: string[];
}

export type WikiCommandInvokeErrorCode =
  | "command-not-found"
  | "wiki-not-configured"
  | "ai-not-configured"
  | "execution-failed";

export type WikiCommandInvokeResult =
  | { ok: true; message?: string; data?: unknown }
  | { ok: false; message?: string; errorCode: WikiCommandInvokeErrorCode };

export interface WikiPublicCommand {
  id: string;
  title: string;
  description?: string;
}

export interface WikiCommandProvider {
  protocol: "wiki-command-provider";
  protocolVersion: 1;
  providerId: string;
  providerName: string;
  providerVersion?: string;
  listCommands: () => Promise<WikiPublicCommand[]> | WikiPublicCommand[];
  invokeCommand: (
    commandId: string,
    context: WikiCommandInvokeContext,
  ) => Promise<WikiCommandInvokeResult> | WikiCommandInvokeResult;
}
