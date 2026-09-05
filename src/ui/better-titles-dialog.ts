import { Dialog, showMessage } from "siyuan";
import { BetterTitlesResult } from "@/core/ai-better-titles-core";

export type BetterTitlesDialogController = {
  dialog: InstanceType<typeof Dialog>;
  setLoading: (loading: boolean, text?: string) => void;
  updateCandidates: (result: BetterTitlesResult) => void;
  close: () => void;
};

export type OpenBetterTitlesDialogOptions = {
  originalTitle: string;
  initialResult: BetterTitlesResult;
  onReplace: (newTitle: string) => Promise<void> | void;
  onRegenerate: (controller: BetterTitlesDialogController) => Promise<void> | void;
};

function escapeHtml(value: string): string {
  return (value || "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function renderCandidateRow(
  title: string,
  onReplace: (newTitle: string) => Promise<void> | void,
  closeDialog: () => void
): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "doc-assistant-better-titles__row";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "b3-text-field doc-assistant-better-titles__input";
  input.value = title;
  input.placeholder = "候选标题";

  const replaceBtn = document.createElement("button");
  replaceBtn.type = "button";
  replaceBtn.className = "b3-button b3-button--text doc-assistant-better-titles__replace-btn";
  replaceBtn.textContent = "替换";

  replaceBtn.addEventListener("click", async () => {
    const val = input.value.trim();
    if (!val) {
      showMessage("标题内容不能为空", 3000, "info");
      return;
    }
    replaceBtn.disabled = true;
    try {
      await onReplace(val);
      closeDialog();
    } catch (err: any) {
      replaceBtn.disabled = false;
      showMessage(`替换标题失败: ${err?.message || err}`, 5000, "error");
    }
  });

  row.append(input, replaceBtn);
  return row;
}

export function openBetterTitlesDialog(
  options: OpenBetterTitlesDialogOptions
): BetterTitlesDialogController {
  const safeTitle = escapeHtml(options.originalTitle || "未命名文档");

  const content = `
    <div class="doc-assistant-better-titles">
      <div class="doc-assistant-better-titles__header">
        <div class="doc-assistant-better-titles__current-title">
          当前文档标题：<strong>${safeTitle}</strong>
        </div>
        <div class="doc-assistant-better-titles__tip">
          可直接在输入框中微调候选标题，点击右侧“替换”按钮更新当前文档标题。
        </div>
      </div>

      <div class="doc-assistant-better-titles__section doc-assistant-better-titles__section--catchy">
        <div class="doc-assistant-better-titles__section-header">
          <span>🌟 更勾人的标题</span>
          <span class="doc-assistant-better-titles__badge">更具阅读欲望</span>
        </div>
        <div class="doc-assistant-better-titles__list doc-assistant-better-titles__list--catchy"></div>
      </div>

      <div class="doc-assistant-better-titles__section doc-assistant-better-titles__section--summary">
        <div class="doc-assistant-better-titles__section-header">
          <span>📌 更平实的标题</span>
          <span class="doc-assistant-better-titles__badge">更准确概括</span>
        </div>
        <div class="doc-assistant-better-titles__list doc-assistant-better-titles__list--summary"></div>
      </div>

      <div class="doc-assistant-better-titles__actions">
        <div class="doc-assistant-better-titles__actions-left">
          <button type="button" class="b3-button b3-button--outline doc-assistant-better-titles__regen-btn">
            重新生成
          </button>
        </div>
        <div class="doc-assistant-better-titles__actions-right">
          <button type="button" class="b3-button b3-button--cancel doc-assistant-better-titles__close-btn">
            关闭
          </button>
        </div>
      </div>

      <div class="doc-assistant-better-titles__loading-overlay" style="display: none;">
        <div class="doc-assistant-better-titles__spinner"></div>
        <div class="doc-assistant-better-titles__loading-text">正在重新生成候选标题...</div>
      </div>
    </div>
  `;

  const dialog = new Dialog({
    title: "更好的标题",
    content,
    width: "640px",
  });

  const root = dialog.element.querySelector(".doc-assistant-better-titles") as HTMLElement;
  const catchyList = root.querySelector(".doc-assistant-better-titles__list--catchy") as HTMLElement;
  const summaryList = root.querySelector(".doc-assistant-better-titles__list--summary") as HTMLElement;
  const regenBtn = root.querySelector(".doc-assistant-better-titles__regen-btn") as HTMLButtonElement;
  const closeBtn = root.querySelector(".doc-assistant-better-titles__close-btn") as HTMLButtonElement;
  const loadingOverlay = root.querySelector(".doc-assistant-better-titles__loading-overlay") as HTMLElement;
  const loadingText = root.querySelector(".doc-assistant-better-titles__loading-text") as HTMLElement;

  const closeDialog = () => dialog.destroy();

  const updateCandidates = (result: BetterTitlesResult) => {
    catchyList.innerHTML = "";
    summaryList.innerHTML = "";

    const catchyItems = result.catchy.length > 0 ? result.catchy : ["未能生成勾人标题"];
    for (const item of catchyItems) {
      catchyList.appendChild(renderCandidateRow(item, options.onReplace, closeDialog));
    }

    const summaryItems = result.summary.length > 0 ? result.summary : ["未能生成平实标题"];
    for (const item of summaryItems) {
      summaryList.appendChild(renderCandidateRow(item, options.onReplace, closeDialog));
    }
  };

  const setLoading = (loading: boolean, text?: string) => {
    loadingOverlay.style.display = loading ? "flex" : "none";
    if (text) {
      loadingText.textContent = text;
    }
    regenBtn.disabled = loading;
    closeBtn.disabled = loading;
  };

  updateCandidates(options.initialResult);

  const controller: BetterTitlesDialogController = {
    dialog,
    setLoading,
    updateCandidates,
    close: closeDialog,
  };

  regenBtn.addEventListener("click", async () => {
    try {
      await options.onRegenerate(controller);
    } catch (err: any) {
      setLoading(false);
      showMessage(`重新生成失败: ${err?.message || err}`, 5000, "error");
    }
  });

  closeBtn.addEventListener("click", closeDialog);

  return controller;
}
