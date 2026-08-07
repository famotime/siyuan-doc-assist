import { ProtyleLike } from "@/plugin/doc-context";

let isDebugLogEnabled = false;

export function setTransactionDebugLogEnabled(enabled: boolean) {
  isDebugLogEnabled = enabled;
}

export interface IOperation {
  action: "insert" | "update" | "delete" | "move";
  id: string;
  data?: string;
  previousID?: string;
  parentID?: string;
}

export function runProtyleTransaction(
  protyle: ProtyleLike | undefined,
  doOperations: IOperation[],
  undoOperations: IOperation[]
): boolean {
  // @ts-ignore: protyle.transaction might not be explicitly typed in ProtyleLike
  if (!protyle || typeof protyle.transaction !== "function") {
    return false;
  }
  
  if (isDebugLogEnabled) {
    console.log("[doc-assist] --------------------");
    console.log("[doc-assist] Protyle transaction triggered");
    console.log("[doc-assist] doOperations:", JSON.parse(JSON.stringify(doOperations)));
    console.log("[doc-assist] undoOperations:", JSON.parse(JSON.stringify(undoOperations)));
    console.log("[doc-assist] --------------------");
  }

  try {
    // @ts-ignore
    protyle.transaction(doOperations, undoOperations);
    return true;
  } catch (err) {
    console.warn("[doc-assist] Protyle transaction failed", err);
    return false;
  }
}

export function resolveSubmitBlockElement(
  protyle: ProtyleLike | undefined,
  blockId: string
): HTMLElement | null {
  if (!protyle || !protyle.wysiwyg || !protyle.wysiwyg.element) {
    return null;
  }
  const root = protyle.wysiwyg.element as HTMLElement;
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>(`[data-node-id="${CSS.escape(blockId)}"][data-type]`)
  ).filter((el) => !el.closest(".protyle-attr, .fn__none"));

  if (!candidates.length) {
    return root.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(blockId)}"]`);
  }

  // Prefer rendered/more complete ones
  return candidates.reduce((best, current) => {
    const bestRendered = best.getAttribute("data-render") === "true";
    const currentRendered = current.getAttribute("data-render") === "true";
    if (currentRendered !== bestRendered) {
      return currentRendered ? current : best;
    }
    return (current.textContent?.length || 0) > (best.textContent?.length || 0) ? current : best;
  });
}
