import { showMessage } from "siyuan";
import { pickSiblingDoc } from "@/core/doc-navigation-core";
import {
  formatGestureHint,
  GestureBindings,
  matchGestureAction,
  MouseGestureActionKey
} from "@/core/gesture-recognition-core";
import { getProtyleDocId, ProtyleLike } from "@/plugin/doc-context";
import {
  closeDocTab,
  fetchSiblingDocs,
  findProtyleByElement,
  openDocTab
} from "@/services/doc-navigation";
import { createGestureCapture, GestureStrokeState } from "@/ui/gesture-capture";
import {
  destroyGestureTrail,
  drawGestureTrail,
  hideGestureTrail,
  showGestureTrail
} from "@/ui/gesture-trail-overlay";

export type MouseGestureControllerOptions = {
  getApp: () => unknown;
  isEnabled: () => boolean;
  getBindings: () => GestureBindings;
};

function isInsideProtyle(target: HTMLElement | null): boolean {
  return Boolean(target?.closest?.(".protyle"));
}

/**
 * 鼠标手势控制器：在文档编辑器内按住右键划动触发
 * 「切换上一个/下一个同级文档」「关闭当前文档标签」操作。
 */
export function createMouseGestureController(options: MouseGestureControllerOptions) {
  let executing = false;
  let suspended = false;

  const executeAction = async (action: MouseGestureActionKey, state: GestureStrokeState) => {
    const protyle = findProtyleByElement(state.startTarget);
    const docId = getProtyleDocId(protyle as ProtyleLike);
    if (!docId) {
      showMessage("鼠标手势：无法定位当前文档", 3500, "error");
      return;
    }
    executing = true;
    try {
      if (action === "close-current-doc") {
        if (closeDocTab(protyle)) {
          showMessage("已关闭当前文档标签", 3500);
        } else {
          showMessage("鼠标手势：关闭文档标签失败", 3500, "error");
        }
        return;
      }

      const direction = action === "previous-doc" ? "previous" : "next";
      const siblings = await fetchSiblingDocs(docId);
      const pick = pickSiblingDoc(siblings, docId, direction);
      if (!pick) {
        showMessage("当前文档没有同级文档", 3500, "info");
        return;
      }
      // 移动式切换：先打开目标文档，再关闭当前标签页
      await openDocTab(options.getApp(), pick.doc.id);
      closeDocTab(protyle);
      if (pick.wrapped) {
        showMessage(
          direction === "next" ?
            "已循环：从最后一个文档切换回第一个文档" :
            "已循环：从第一个文档切换回最后一个文档",
          4000
        );
      } else {
        showMessage(`已切换到《${pick.doc.name || "文档"}》`, 3500);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showMessage(`鼠标手势执行失败：${message}`, 5000, "error");
    } finally {
      executing = false;
    }
  };

  const capture = createGestureCapture({
    shouldHandle: (event) => {
      if (!options.isEnabled() || suspended || executing) {
        return false;
      }
      return event.target instanceof HTMLElement && isInsideProtyle(event.target);
    },
    onStrokeStart: () => {
      showGestureTrail();
    },
    onStrokeMove: (state) => {
      drawGestureTrail(
        state.points,
        formatGestureHint(state.directions, options.getBindings())
      );
    },
    onStrokeEnd: (state) => {
      hideGestureTrail();
      if (!state.moved) {
        return;
      }
      const action = matchGestureAction(state.directions, options.getBindings());
      if (!action) {
        return;
      }
      void executeAction(action, state);
    },
    // Cancelled strokes (window blur / wrong-button release) must still clean
    // up the trail overlay, otherwise the ink stays on screen until the next stroke.
    onStrokeCancel: () => {
      hideGestureTrail();
    }
  });

  return {
    bind() {
      capture.bind();
    },
    unbind() {
      capture.unbind();
      hideGestureTrail();
    },
    setSuspended(value: boolean) {
      suspended = value;
      if (value) {
        hideGestureTrail();
      }
    },
    destroy() {
      capture.unbind();
      destroyGestureTrail();
    }
  };
}
