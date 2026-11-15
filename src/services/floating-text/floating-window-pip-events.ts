/**
 * 悬浮窗 PiP / window.open 窗口事件桥接
 * 原 floating-window-adapter.ts 中 bindPipWindowEvents 的纯搬移，逻辑零改动
 */

import {
  calculateSteppedFontSize,
  FloatingTextConfig,
  resolveFloatingCopyText,
} from "@/core/floating-text-core";
import { renderMarkdownToHtml } from "@/core/markdown-render-core";
import {
  loadFloatingTextConfig,
  saveFloatingTextConfig,
} from "@/services/floating-text/floating-text-storage";

export function bindPipWindowEvents(
  pipWindow: Window,
  text: string,
  initialConfig: FloatingTextConfig
) {
  const doc = pipWindow.document;
  const appEl = doc.getElementById("ft-app");
  const popoverEl = doc.getElementById("ft-popover");
  const textViewEl = doc.getElementById("ft-text-view");
  const mdViewEl = doc.getElementById("ft-markdown-view");
  const viewBtn = doc.getElementById("ft-btn-view");
  const pinBtn = doc.getElementById("ft-btn-pin");
  const pinIconUse = pinBtn?.querySelector("use");
  const pinTooltip = doc.getElementById("ft-pin-tooltip");
  const copyBtn = doc.getElementById("ft-btn-copy");
  const settingsBtn = doc.getElementById("ft-btn-settings");
  const closeBtn = doc.getElementById("ft-btn-close");
  const slider = doc.getElementById("ft-opacity-slider") as HTMLInputElement | null;
  const opacityLabel = doc.getElementById("ft-opacity-label");
  const fontLabel = doc.getElementById("ft-font-label");
  const fontIncBtn = doc.getElementById("ft-font-inc");
  const fontDecBtn = doc.getElementById("ft-font-dec");
  const wordCountEl = doc.getElementById("ft-word-count");
  const toast = doc.getElementById("ft-toast");

  let currentFontSize = initialConfig.fontSize;
  let currentViewMode = initialConfig.viewMode;
  let isPinned = true;

  const updatePinUI = () => {
    if (pinBtn) {
      if (isPinned) {
        pinBtn.classList.add("ft-btn-active", "ft-btn-pinned");
        pinBtn.setAttribute("aria-label", "取消置顶");
      } else {
        pinBtn.classList.remove("ft-btn-active", "ft-btn-pinned");
        pinBtn.setAttribute("aria-label", "恢复置顶");
      }
    }
    if (pinIconUse) {
      pinIconUse.setAttribute("href", isPinned ? "#ft-icon-pin" : "#ft-icon-pin-off");
    }
    if (pinTooltip) {
      pinTooltip.innerHTML = `${isPinned ? "取消置顶" : "恢复置顶"} <kbd>Alt+P</kbd>`;
    }
  };

  const togglePin = () => {
    isPinned = !isPinned;
    updatePinUI();
    showToast(isPinned ? "已恢复置顶" : "已取消置顶");
  };

  const showToast = (msg: string) => {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("ft-toast-show");
    pipWindow.setTimeout(() => {
      toast.classList.remove("ft-toast-show");
    }, 1500);
  };

  const updateWordCount = () => {
    if (!wordCountEl) return;
    const cur = getCurrentText();
    const len = cur ? cur.trim().replace(/\s+/g, "").length : 0;
    if (len > 0) {
      wordCountEl.textContent = `${len} 字`;
      wordCountEl.style.display = "inline-block";
    } else {
      wordCountEl.textContent = "";
      wordCountEl.style.display = "none";
    }
  };

  let copyFeedbackTimer: any = null;
  const triggerCopyFeedback = (isPartial: boolean) => {
    if (!copyBtn) return;
    copyBtn.classList.add("ft-btn-success");
    const copyIconUse = copyBtn.querySelector("use");
    if (copyIconUse) copyIconUse.setAttribute("href", "#ft-icon-check");
    const copyTooltip = doc.getElementById("ft-copy-tooltip");
    if (copyTooltip) {
      copyTooltip.innerHTML = `${isPartial ? "已复制选中内容" : "已复制全部内容"} ✓`;
    }
    if (copyFeedbackTimer) pipWindow.clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = pipWindow.setTimeout(() => {
      copyBtn.classList.remove("ft-btn-success");
      if (copyIconUse) copyIconUse.setAttribute("href", "#ft-icon-copy");
      if (copyTooltip) {
        copyTooltip.innerHTML = '复制全部内容 <kbd>Ctrl+C</kbd>';
      }
    }, 1500);
  };

  const updateFontSize = (newSize: number) => {
    currentFontSize = newSize;
    if (appEl) {
      appEl.style.setProperty("--ft-font-size", `${newSize}px`);
    }
    if (fontLabel) {
      fontLabel.textContent = `${newSize}px`;
    }
    saveFloatingTextConfig({ fontSize: newSize });
  };

  const updateOpacity = (newOpacity: number) => {
    if (appEl) {
      appEl.style.setProperty("--ft-opacity", `${newOpacity}`);
    }
    if (opacityLabel) {
      opacityLabel.textContent = `${Math.round(newOpacity * 100)}%`;
    }
    saveFloatingTextConfig({ opacity: newOpacity });
  };

  if (textViewEl) {
    try {
      textViewEl.setAttribute("contenteditable", "plaintext-only");
    } catch {
      textViewEl.setAttribute("contenteditable", "true");
    }
    textViewEl.setAttribute("spellcheck", "false");
    textViewEl.setAttribute("data-placeholder", "在此处编辑文本...");
    textViewEl.addEventListener("input", updateWordCount);
  }

  const ensureImageSources = (container: HTMLElement | null) => {
    if (!container) return;
    try {
      const imgs = container.querySelectorAll("img");
      imgs.forEach((img) => {
        if (!img.getAttribute("src") && img.getAttribute("data-src")) {
          img.setAttribute("src", img.getAttribute("data-src") || "");
        }
      });
    } catch {}
  };

  ensureImageSources(mdViewEl);

  mdViewEl?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    if (target && target.tagName === "IMG") {
      target.classList.toggle("ft-img-expanded");
    }
  });

  const getCurrentText = (): string => {
    if (!textViewEl) return text;
    const val = textViewEl.innerText;
    if (typeof val === "string") return val;
    return textViewEl.textContent ?? "";
  };

  function getSelectedText(): string {
    try {
      const sel = pipWindow.getSelection ? pipWindow.getSelection() : null;
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        return "";
      }
      return sel.toString();
    } catch {
      return "";
    }
  }

  updateWordCount();

  const performCopy = async (targetText: string, isPartial: boolean) => {
    let copied = false;
    try {
      if (pipWindow.navigator?.clipboard?.writeText) {
        await pipWindow.navigator.clipboard.writeText(targetText);
        copied = true;
      }
    } catch {
      // 画中画窗口可能没有剪贴板焦点或权限，尝试降级
    }

    if (!copied) {
      try {
        if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(targetText);
          copied = true;
        }
      } catch {
        // 尝试 execCommand 降级
      }
    }

    if (!copied) {
      try {
        const ta = pipWindow.document.createElement("textarea");
        ta.value = targetText;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        ta.style.opacity = "0";
        pipWindow.document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copied = Boolean(pipWindow.document.execCommand("copy"));
        pipWindow.document.body.removeChild(ta);
      } catch {
        copied = false;
      }
    }

    if (copied) {
      triggerCopyFeedback(isPartial);
    } else {
      showToast("复制失败");
    }
  };

  const toggleViewMode = () => {
    currentViewMode = currentViewMode === "text" ? "markdown" : "text";
    const viewIconUse = viewBtn?.querySelector("use");
    const viewTooltip = doc.getElementById("ft-view-tooltip");
    if (viewIconUse) {
      viewIconUse.setAttribute(
        "href",
        currentViewMode === "markdown" ? "#ft-icon-text" : "#ft-icon-preview"
      );
    }
    if (viewTooltip) {
      viewTooltip.innerHTML = `${
        currentViewMode === "markdown" ? "切换源码编辑" : "切换 Markdown 预览"
      } <kbd>Ctrl+M</kbd>`;
    }
    if (currentViewMode === "markdown") {
      if (mdViewEl) {
        mdViewEl.innerHTML = renderMarkdownToHtml(getCurrentText());
        ensureImageSources(mdViewEl);
      }
      if (textViewEl) {
        textViewEl.style.display = "none";
      }
      if (mdViewEl) {
        mdViewEl.style.display = "block";
      }
    } else {
      if (textViewEl) {
        textViewEl.style.display = "block";
        textViewEl.focus();
      }
      if (mdViewEl) {
        mdViewEl.style.display = "none";
      }
    }
    saveFloatingTextConfig({ viewMode: currentViewMode });
  };

  const closePopover = () => {
    popoverEl?.classList.remove("ft-popover-open");
    settingsBtn?.classList.remove("ft-btn-active");
  };

  doc.addEventListener("click", (e) => {
    if (!popoverEl || !popoverEl.classList.contains("ft-popover-open")) return;
    const target = e.target as Node;
    if (!popoverEl.contains(target) && (!settingsBtn || !settingsBtn.contains(target))) {
      closePopover();
    }
  });

  // 1. Esc 快捷键关闭 & Ctrl + C 复制 & Ctrl + M 切换视图 & Ctrl + 滚轮缩放字号
  doc.addEventListener("keydown", async (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (popoverEl && popoverEl.classList.contains("ft-popover-open")) {
        closePopover();
        return;
      }
      pipWindow.close();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "m" || e.key === "M")) {
      e.preventDefault();
      toggleViewMode();
      return;
    }
    if ((e.altKey && (e.key === "p" || e.key === "P")) || ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "p" || e.key === "P"))) {
      e.preventDefault();
      togglePin();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
      const selected = getSelectedText();
      if (selected && selected.trim().length > 0) {
        e.preventDefault();
        await performCopy(selected, true);
      }
    }
  });

  doc.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const direction = e.deltaY < 0 ? "up" : "down";
        const nextSize = calculateSteppedFontSize(currentFontSize, direction, 1);
        updateFontSize(nextSize);
      }
    },
    { passive: false }
  );

  // 2. 关闭按钮
  closeBtn?.addEventListener("click", () => {
    pipWindow.close();
  });

  // 3. 复制按钮
  copyBtn?.addEventListener("mousedown", (e) => {
    e.preventDefault();
  });

  copyBtn?.addEventListener("click", async () => {
    const { text: targetText, isSelected } = resolveFloatingCopyText(
      getSelectedText(),
      getCurrentText()
    );
    await performCopy(targetText, isSelected);
  });

  // 4. 置顶切换
  pinBtn?.addEventListener("click", () => {
    togglePin();
  });

  // 5. 视图切换（纯文本 / Markdown）
  viewBtn?.addEventListener("click", () => {
    toggleViewMode();
  });

  // 5. 外观 Popover 折叠
  settingsBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    popoverEl?.classList.toggle("ft-popover-open");
    settingsBtn.classList.toggle("ft-btn-active");
  });

  // 6. 不透明度滑块
  slider?.addEventListener("input", () => {
    const val = parseInt(slider.value, 10);
    const op = val / 100;
    if (appEl) {
      appEl.style.setProperty("--ft-opacity", `${op}`);
    }
    if (opacityLabel) {
      opacityLabel.textContent = `${val}%`;
    }
  });

  slider?.addEventListener("change", () => {
    const val = parseInt(slider.value, 10);
    updateOpacity(val / 100);
  });

  // 7. 字号按钮
  fontIncBtn?.addEventListener("click", () => {
    updateFontSize(calculateSteppedFontSize(currentFontSize, "up", 1));
  });

  fontDecBtn?.addEventListener("click", () => {
    updateFontSize(calculateSteppedFontSize(currentFontSize, "down", 1));
  });

  // 8. 窗口尺寸记忆
  let resizeTimer: number | null = null;
  pipWindow.addEventListener("resize", () => {
    if (resizeTimer) {
      pipWindow.clearTimeout(resizeTimer);
    }
    resizeTimer = pipWindow.setTimeout(() => {
      const cur = loadFloatingTextConfig();
      if (cur.rememberSize) {
        saveFloatingTextConfig({
          width: pipWindow.innerWidth,
          height: pipWindow.innerHeight,
        });
      }
    }, 400);
  });

  // 9. 标题栏鼠标拖拽增强 (针对 PiP / window.open 浏览器环境)
  const headerEl = doc.querySelector(".ft-header") as HTMLElement | null;
  const actionsEl = doc.querySelector(".ft-actions") as HTMLElement | null;
  if (headerEl) {
    let isDragging = false;
    let startMouseX = 0;
    let startMouseY = 0;
    let startWinX = 0;
    let startWinY = 0;
    let hasMoved = false;

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.screenX - startMouseX;
      const dy = e.screenY - startMouseY;
      if (!hasMoved && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
        hasMoved = true;
        appEl?.classList.add("is-dragging");
      }
      if (hasMoved && typeof pipWindow.moveTo === "function") {
        try {
          pipWindow.moveTo(Math.round(startWinX + dx), Math.round(startWinY + dy));
        } catch {}
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!isDragging) return;
      isDragging = false;
      doc.removeEventListener("mousemove", onMouseMove, true);
      doc.removeEventListener("mouseup", onMouseUp, true);
      appEl?.classList.remove("is-dragging");
      if (hasMoved) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    headerEl.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (actionsEl && actionsEl.contains(e.target as Node)) return;
      try {
        pipWindow.focus?.();
      } catch {}
      isDragging = true;
      hasMoved = false;
      startMouseX = e.screenX;
      startMouseY = e.screenY;
      startWinX = typeof pipWindow.screenX === "number" ? pipWindow.screenX : 0;
      startWinY = typeof pipWindow.screenY === "number" ? pipWindow.screenY : 0;
      doc.addEventListener("mousemove", onMouseMove, true);
      doc.addEventListener("mouseup", onMouseUp, true);
    });
  }
}
