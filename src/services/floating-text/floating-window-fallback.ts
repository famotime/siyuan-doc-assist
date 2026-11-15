/**
 * 应用内悬浮窗降级方案（思源 Dialog）
 * 原 floating-window-adapter.ts 中 openInAppFloatingFallback 的纯搬移，逻辑零改动
 */

import { FloatingTextConfig, hasImageMarkdown } from "@/core/floating-text-core";
import { renderMarkdownToHtml } from "@/core/markdown-render-core";
import { buildFloatingWindowHtml } from "@/ui/floating-text/floating-window-template";
import { Dialog, showMessage } from "siyuan";

export function openInAppFloatingFallback(
  title: string,
  text: string,
  config: FloatingTextConfig,
  isDark: boolean
) {
  const hasImage = hasImageMarkdown(text);
  const effectiveConfig: FloatingTextConfig = hasImage
    ? { ...config, viewMode: "markdown" }
    : config;
  const initialHtml = renderMarkdownToHtml(text);
  const baseUrl =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";
  const dialogHtml = buildFloatingWindowHtml({
    title,
    text,
    config: effectiveConfig,
    isDark,
    initialHtml,
    baseUrl,
    isDialogFallback: true,
  });

  const dialog = new Dialog({
    title: "", // 设为空字符串，思源自动隐藏 b3-dialog__header 避免重复标题栏
    content: `<div class="doc-assistant-floating-dialog-wrapper" style="height: 100%; min-height: 260px;">${dialogHtml}</div>`,
    width: `${effectiveConfig.width}px`,
    height: `${effectiveConfig.height}px`,
    transparent: true,
  });

  const dialogEl = dialog.element;
  const dialogContainer = dialogEl?.querySelector(".b3-dialog__container") as HTMLElement | null;

  // 1. 清理思源外层 Dialog 容器样式，消除多余边框与内边距，让毛玻璃内层完整沉浸式展示
  if (dialogContainer) {
    dialogContainer.style.background = "transparent";
    dialogContainer.style.boxShadow = "none";
    dialogContainer.style.border = "none";
    dialogContainer.style.overflow = "hidden";
    const bodyEl = dialogContainer.querySelector(".b3-dialog__body") as HTMLElement | null;
    if (bodyEl) {
      bodyEl.style.padding = "0";
      bodyEl.style.height = "100%";
      bodyEl.style.overflow = "hidden";
      bodyEl.style.background = "transparent";
    }
  }

  // 2. 统一关闭逻辑与生命周期销毁
  let isCleanedUp = false;
  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("doc-assistant-floating-close", onCloseEvent);
  };

  const closeDialog = () => {
    cleanup();
    dialog.destroy();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeDialog();
    }
  };

  const onCloseEvent = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    closeDialog();
  };

  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("doc-assistant-floating-close", onCloseEvent);

  // 监听内层自定义关闭按钮点击 (捕获阶段，阻止向外冒泡)
  const innerCloseBtn = dialogEl?.querySelector("#ft-btn-close");
  innerCloseBtn?.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeDialog();
    },
    true
  );

  // 挂载安全代理，拦截 dialog.destroy，确保任何途径销毁时解绑全局事件
  const origDestroy = dialog.destroy.bind(dialog);
  dialog.destroy = () => {
    cleanup();
    origDestroy();
  };

  showMessage("当前环境已在应用内打开悬浮窗", 3000, "info");
}
