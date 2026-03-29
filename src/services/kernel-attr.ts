import { requestApi } from "@/services/request";

export const DOC_READONLY_ATTR_KEY = "custom-sy-readonly";

export type BlockAttrs = Record<string, string>;

export async function getBlockAttrs(id: string): Promise<BlockAttrs> {
  if (!id) {
    return {};
  }
  return requestApi<BlockAttrs>("/api/attr/getBlockAttrs", { id });
}

export function isReadonlyAttrValue(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value === 1;
  }
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on" ||
    normalized === "readonly" ||
    normalized === "locked"
  );
}

export async function getDocReadonlyState(id: string): Promise<boolean> {
  const attrs = await getBlockAttrs(id);
  return isReadonlyAttrValue(attrs?.[DOC_READONLY_ATTR_KEY]);
}
