export type SiblingDocRef = {
  id: string;
  name?: string;
};

export type SiblingPickDirection = "previous" | "next";

export type SiblingPickResult = {
  doc: SiblingDocRef;
  /** 是否在边界处循环绕回（最后一个绕回第一个，或反之） */
  wrapped: boolean;
} | null;

/** 由文档 .sy 路径计算父级路径，根级文档返回 "/" */
export function getParentDocPath(docPath: string): string {
  const normalized = docPath.startsWith("/") ? docPath : `/${docPath}`;
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash <= 0) {
    return "/";
  }
  return normalized.slice(0, lastSlash);
}

/**
 * 在同级文档列表中选取上一个/下一个目标。
 * 边界处循环绕回；当前文档没有其他同级文档时返回 null。
 */
export function pickSiblingDoc(
  siblings: SiblingDocRef[],
  currentId: string,
  direction: SiblingPickDirection
): SiblingPickResult {
  if (!Array.isArray(siblings)) {
    return null;
  }
  const ordered = siblings.filter((doc) => doc && typeof doc.id === "string" && doc.id);
  const others = ordered.filter((doc) => doc.id !== currentId);
  if (!others.length) {
    return null;
  }

  const index = ordered.findIndex((doc) => doc.id === currentId);
  if (index === -1) {
    // 当前文档不在同级列表中（如刚被移动过）：按方向取端点，不视为循环
    const doc = direction === "next" ? others[0] : others[others.length - 1];
    return { doc, wrapped: false };
  }

  if (direction === "next") {
    if (index + 1 < ordered.length) {
      return { doc: ordered[index + 1], wrapped: false };
    }
    return { doc: ordered[0], wrapped: true };
  }

  if (index - 1 >= 0) {
    return { doc: ordered[index - 1], wrapped: false };
  }
  return { doc: ordered[ordered.length - 1], wrapped: true };
}
