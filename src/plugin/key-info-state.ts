import { KeyInfoItem } from "@/core/key-info-core";

export function resolveKeyInfoItems(params: {
  isSameDoc: boolean;
  hasItems: boolean;
  currentItems: KeyInfoItem[];
  latestItems: KeyInfoItem[];
}): KeyInfoItem[] {
  const { latestItems } = params;
  // 合同：无条件信任最新的服务端快照以保持真实文档顺序。
  // isSameDoc/hasItems/currentItems 仅为兼容调用方语境保留（有测试锁定该合同）。
  return latestItems;
}
