/**
 * 链接转文档确认弹窗
 * 用于在检测到多个外部链接时，显示带有网页真实标题的链接列表，默认全选，支持用户部分勾选并确认剪藏
 */

import { Dialog, showMessage } from "siyuan";
import type { WebLinkItemWithTitle } from "@/services/link-to-doc-service";

type LinkToDocDialogArgs = {
  items: WebLinkItemWithTitle[];
  onConfirm: (selectedItems: WebLinkItemWithTitle[]) => void | Promise<void>;
};

function createButton(label: string, primary = false): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = label;
  button.className = primary
    ? "b3-button b3-button--text"
    : "b3-button b3-button--outline";
  return button;
}

export function openLinkToDocDialog(args: LinkToDocDialogArgs): InstanceType<typeof Dialog> {
  const dialog = new Dialog({
    title: "链接转文档 - 确认剪藏链接",
    content: `<div class="link-to-doc-dialog">
      <div class="link-to-doc-dialog__toolbar"></div>
      <div class="link-to-doc-dialog__count"></div>
      <div class="link-to-doc-dialog__list"></div>
    </div>`,
    width: "700px",
    height: "65vh",
  });

  const root = dialog.element.querySelector(".link-to-doc-dialog") as HTMLDivElement;
  const toolbar = root.querySelector(".link-to-doc-dialog__toolbar") as HTMLDivElement;
  const countEl = root.querySelector(".link-to-doc-dialog__count") as HTMLDivElement;
  const list = root.querySelector(".link-to-doc-dialog__list") as HTMLDivElement;

  const selectAllBtn = createButton("全选");
  const clearBtn = createButton("清空");
  const confirmBtn = createButton("确定剪藏", true);
  const cancelBtn = createButton("取消");

  toolbar.append(selectAllBtn, clearBtn, confirmBtn, cancelBtn);

  const updateCount = () => {
    const checkboxes = list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    let checkedCount = 0;
    checkboxes.forEach((cb) => {
      if (cb.checked) {
        checkedCount++;
      }
    });
    countEl.textContent = `共检测到 ${args.items.length} 个网页链接，已勾选 ${checkedCount} 项：`;
  };

  args.items.forEach((item, index) => {
    const row = document.createElement("label");
    row.className = "link-to-doc-dialog__row";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "b3-switch";
    cb.checked = true;
    cb.dataset.index = String(index);

    cb.addEventListener("change", updateCount);

    const info = document.createElement("div");
    info.className = "link-to-doc-dialog__info";

    const titleLine = document.createElement("div");
    titleLine.className = "link-to-doc-dialog__title";
    titleLine.textContent = item.title;
    titleLine.title = item.title;

    const urlLine = document.createElement("div");
    urlLine.className = "link-to-doc-dialog__url ft__secondary";
    urlLine.textContent = item.url;
    urlLine.title = item.url;

    info.append(titleLine, urlLine);
    row.append(cb, info);
    list.appendChild(row);
  });

  updateCount();

  selectAllBtn.addEventListener("click", () => {
    const checkboxes = list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    checkboxes.forEach((cb) => {
      cb.checked = true;
    });
    updateCount();
  });

  clearBtn.addEventListener("click", () => {
    const checkboxes = list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    checkboxes.forEach((cb) => {
      cb.checked = false;
    });
    updateCount();
  });

  confirmBtn.addEventListener("click", async () => {
    const checkboxes = list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    const selected: WebLinkItemWithTitle[] = [];

    checkboxes.forEach((cb) => {
      if (cb.checked) {
        const index = Number(cb.dataset.index);
        if (Number.isInteger(index) && args.items[index]) {
          selected.push(args.items[index]);
        }
      }
    });

    if (selected.length === 0) {
      showMessage("请至少勾选一个要剪藏的链接", 4000, "info");
      return;
    }

    dialog.destroy();
    await args.onConfirm(selected);
  });

  cancelBtn.addEventListener("click", () => {
    dialog.destroy();
  });

  return dialog;
}
