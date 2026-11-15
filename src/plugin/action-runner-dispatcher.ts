import { ActionKey } from "@/plugin/actions";
import { ProtyleLike } from "@/plugin/doc-context";

export type ActionHandlerResult =
  | {
    ok?: boolean;
    errorCode?: "context-unavailable" | "not-supported" | "execution-failed";
    message?: string;
  } |
  void;

export type ActionHandler = (docId: string, protyle?: ProtyleLike) => Promise<ActionHandlerResult>;

export type ActionHandlerMap = Record<ActionKey, ActionHandler>;

export type PartialActionHandlerMap = Partial<ActionHandlerMap>;

export async function dispatchAction(
  action: ActionKey,
  docId: string,
  protyle: ProtyleLike | undefined,
  handlers: ActionHandlerMap
) {
  const handler = handlers[action];
  if (!handler) {
    return;
  }
  return await handler(docId, protyle);
}
