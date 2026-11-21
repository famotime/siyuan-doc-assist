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

  const scrollToCenter = (target: HTMLElement, resolveProtyle: ResolveProtyle) => {
    const protyle = resolveProtyle();
    const root = protyle?.wysiwyg?.element as HTMLElement | undefined;
    const contentEl =
      ((protyle as any)?.contentElement as HTMLElement | undefined) ||
      (root?.closest(".protyle-content") as HTMLElement | null) ||
      (target.closest(".protyle-content") as HTMLElement | null) ||
      root?.parentElement;

    if (contentEl) {
      const contentRect = contentEl.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const targetCenter = targetRect.top + targetRect.height / 2;
      const viewportCenter = contentRect.top + contentRect.height / 2;
      const delta = targetCenter - viewportCenter;
      if (Math.abs(delta) > 4) {
        if (typeof contentEl.scrollBy === "function") {
          contentEl.scrollBy({ top: delta, behavior: "smooth" });
        } else {
          contentEl.scrollTop += delta;
        }
      }
    } else {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  };

  const scheduleCenterAfterLoad = (
    blockId: string,
    jumpId: number,
    resolveProtyle: ResolveProtyle
  ) => {
    const delays = [80, 180, 320, 500, 800, 1200];
    delays.forEach((delay) => {
      window.setTimeout(() => {
        if (jumpId !== keyInfoJumpId) {
          return;
        }
        const protyle = resolveProtyle();
        const root = protyle?.wysiwyg?.element as HTMLElement | undefined;
        if (!root) {
          return;
        }
        const target = root.querySelector(`[data-node-id="${blockId}"]`) as HTMLElement | null;
        if (target) {
          scrollToCenter(target, resolveProtyle);
          flashBlockElement(target);
        }
      }, delay);
    });
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
          scrollToCenter(target, resolveProtyle);
          scheduleFlashAfterScroll(target, jumpId, () => {
            openBlockByProtocolThrottled(blockId);
          });
          return;
        }
      }

      openBlockByProtocolThrottled(blockId);
      scheduleCenterAfterLoad(blockId, jumpId, resolveProtyle);
    }
  };
}
