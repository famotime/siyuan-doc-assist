import { ActionKey } from "@/plugin/actions";
import { ProtyleLike } from "@/plugin/doc-context";

/**
 * 显式取消哨兵：handler 在用户拒绝确认框时返回它，runAction 将其映射为
 * `ok:false + errorCode:"cancelled"`，与「真空操作返回 undefined → ok:true」区分
 * （审计遗留项 2.3）。handler 中未迁移的取消路径仍返回 undefined，保持旧契约。
 * 字符串字面量类型保证 `=== ACTION_CANCELLED` 的判别式收窄可靠。
 */
export const ACTION_CANCELLED = "__doc-assistant-action-cancelled" as const;

export type ActionCancelledSentinel = typeof ACTION_CANCELLED;

export type ActionHandlerResult =
  | ActionCancelledSentinel
  | {
    ok?: boolean;
    errorCode?: "context-unavailable" | "not-supported" | "execution-failed" | "cancelled";
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
