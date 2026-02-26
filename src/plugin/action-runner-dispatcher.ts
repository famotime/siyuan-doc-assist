import { ActionKey } from "@/plugin/actions";
import { ProtyleLike } from "@/plugin/doc-context";

export type ActionHandler = (docId: string, protyle?: ProtyleLike) => Promise<void>;

export type ActionHandlerMap = Record<ActionKey, ActionHandler>;

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
  await handler(docId, protyle);
}
