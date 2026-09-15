import { confirm, Dialog } from "siyuan";
import type { ConfirmDetailItem } from "@/plugin/action-runner";

function escapeHtml(value: string): string {
  return (value || "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

export function askConfirmWithDetail(
  title: string,
  text: string,
  detailItems?: ConfirmDetailItem[]
): Promise<boolean> {
  if (!detailItems?.length) {
    return new Promise((resolve) => {
      confirm(
        title,
        text,
        () => resolve(true),
        () => resolve(false)
      );
    });
  }

  return new Promise((resolve) => {
    const listHtml = detailItems
      .map((item, index) => {
        const desc = item.description
          ? `<span class="doc-assistant-confirm-detail__desc">${escapeHtml(item.description)}</span>`
          : "";
        const toneClass = item.tone
          ? ` doc-assistant-confirm-detail__label--${item.tone}`
          : "";
        const labelHtml = `<span class="doc-assistant-confirm-detail__label${toneClass}">${escapeHtml(item.label)}</span>`;
        if (item.selectable) {
          const checked = item.selected !== false ? " checked" : "";
          return `<label class="doc-assistant-confirm-detail__item doc-assistant-confirm-detail__item--selectable"><input class="doc-assistant-confirm-detail__checkbox" type="checkbox" data-detail-index="${index}"${checked}>${labelHtml}${desc}</label>`;
        }
        return `<div class="doc-assistant-confirm-detail__item">${labelHtml}${desc}</div>`;
      })
      .join("");

    const hasSelectable = detailItems.some((item) => item.selectable);
    const openAttr = hasSelectable ? " open" : "";
    const summaryLabel = hasSelectable ? "清理选项与详情" : "打开详情";

    const content = `
      <div class="doc-assistant-confirm-detail">
        <div class="doc-assistant-confirm-detail__text">${escapeHtml(text)}</div>
        <details class="doc-assistant-confirm-detail__toggle"${openAttr}>
          <summary class="doc-assistant-confirm-detail__summary">${summaryLabel}（${detailItems.length} 项）</summary>
          <div class="doc-assistant-confirm-detail__list">${listHtml}</div>
        </details>
      </div>`;

    const dialog = new Dialog({
      title,
      content,
      width: "520px",
    });

    const root = dialog.element.querySelector(".doc-assistant-confirm-detail") as HTMLElement;
    const confirmBtn = document.createElement("button");
    confirmBtn.textContent = "确定";
    confirmBtn.className = "b3-button b3-button--text";
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "取消";
    cancelBtn.className = "b3-button b3-button--outline";

    const btnRow = document.createElement("div");
    btnRow.className = "doc-assistant-confirm-detail__actions";
    btnRow.append(cancelBtn, confirmBtn);
    root.appendChild(btnRow);

    confirmBtn.addEventListener("click", () => {
      root.querySelectorAll<HTMLInputElement>(".doc-assistant-confirm-detail__checkbox").forEach((checkbox) => {
        const index = Number(checkbox.dataset.detailIndex);
        if (Number.isInteger(index) && detailItems[index]) {
          detailItems[index].selected = checkbox.checked;
        }
      });
      dialog.destroy();
      resolve(true);
    });
    cancelBtn.addEventListener("click", () => {
      dialog.destroy();
      resolve(false);
    });
  });
}
