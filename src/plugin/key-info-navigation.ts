import { KeyInfoItem } from "@/core/key-info-core";
import { ProtyleLike } from "@/plugin/doc-context";

export type KeyInfoNavigationItem = Pick<KeyInfoItem, "id" | "type" | "text" | "raw" | "blockId" | "blockSort" | "order">;

type ResolveProtyle = () => ProtyleLike | undefined;

export function createKeyInfoNavigation() {
  let keyInfoJumpId = 0;
  let lastProtocolOpenId = "";
  let lastProtocolOpenAt = 0;

  const openBlockByProtocol = (blockId: string) => {
    const url = `siyuan://blocks/${blockId}`;
    try {
      window.open(url);
    } catch {
      window.location.href = url;
    }
  };

  const openBlockByProtocolThrottled = (blockId: string) => {
    const now = performance.now();
    if (lastProtocolOpenId === blockId && now - lastProtocolOpenAt < 800) {
      return;
    }
    lastProtocolOpenId = blockId;
    lastProtocolOpenAt = now;
    openBlockByProtocol(blockId);
  };

  const flashBlockElement = (target: HTMLElement) => {
    const flashClass = "doc-assistant-keyinfo__flash";
    target.classList.remove(flashClass);
    void target.offsetWidth;
    target.classList.add(flashClass);
    window.setTimeout(() => {
      target.classList.remove(flashClass);
    }, 900);
  };

  const scheduleFlashAfterScroll = (
    target: HTMLElement,
    jumpId: number,
    onTimeout?: () => void
  ) => {
    const start = performance.now();
    const minDelay = 160;
    const maxWait = 2000;
    const check = () => {
      if (jumpId !== keyInfoJumpId) {
        return;
      }
      const now = performance.now();
      const viewHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      if (!viewHeight) {
        flashBlockElement(target);
        return;
      }
      const rect = target.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const delta = Math.abs(center - viewHeight / 2);
      const threshold = Math.min(80, viewHeight * 0.1);
      const ready = delta <= threshold && now - start >= minDelay;
      if (ready) {
        flashBlockElement(target);
        return;
      }
      if (now - start >= maxWait) {
        onTimeout?.();
        return;
      }
      window.requestAnimationFrame(check);
    };
    window.requestAnimationFrame(check);
  };

  return {
    handleItemClick(item: KeyInfoNavigationItem, resolveProtyle: ResolveProtyle) {
      const blockId = item.blockId;
      if (!blockId) {
        return;
      }

      const jumpId = ++keyInfoJumpId;
      const protyle = resolveProtyle();
      const root = protyle?.wysiwyg?.element as HTMLElement | undefined;
      if (root) {
        const target = root.querySelector(`[data-node-id="${blockId}"]`) as HTMLElement | null;
        if (target) {
          target.scrollIntoView({ block: "center", behavior: "smooth" });
          scheduleFlashAfterScroll(target, jumpId, () => {
            openBlockByProtocolThrottled(blockId);
          });
          return;
        }
      }

      openBlockByProtocolThrottled(blockId);
    }
  };
}
