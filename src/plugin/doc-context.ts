export type ProtyleBlockLike = {
  rootID?: string;
  rootId?: string;
  root_id?: string;
  id?: string;
};

export type ProtyleLike = {
  block?: ProtyleBlockLike;
  model?: {
    parent?: unknown;
  };
  wysiwyg?: {
    element?: HTMLElement;
  };
};

export function getProtyleDocId(protyle?: ProtyleLike | null): string {
  return (
    protyle?.block?.rootID ||
    protyle?.block?.rootId ||
    protyle?.block?.root_id ||
    protyle?.block?.id ||
    ""
  );
}

/**
 * 游标成对校验（审计遗留项 2.2）：显式 docId 更新只改 docId、protyle 关闭标签无
 * 清理事件，currentDocId 与 currentProtyle 可能指向不同文档。成对消费点（如关键
 * 信息刷新）在读取时以 protyle 为准重同步 docId，避免「A 的 protyle 配 B 的 docId」。
 */
export function resolvePairedCursorDocId(
  currentDocId: string,
  protyle: ProtyleLike | undefined
): string {
  const protyleDocId = getProtyleDocId(protyle);
  if (protyleDocId && protyleDocId !== currentDocId) {
    return protyleDocId;
  }
  return currentDocId;
}
