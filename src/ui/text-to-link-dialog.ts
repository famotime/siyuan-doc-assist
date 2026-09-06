import { Dialog } from "siyuan";
import { TextToLinkCandidate } from "@/core/text-to-link-core";

type TextToLinkDialogArgs = {
  candidates: TextToLinkCandidate[];
  onConfirm: (selectedOriginalUrls: Set<string>) => void | Promise<void>;
};

function createButton(label: string, primary = false): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = label;
  button.className = primary
    ? "b3-button b3-button--text"
    : "b3-button b3-button--outline";
  return button;
}

export function openTextToLinkDialog(args: TextToLinkDialogArgs): InstanceType<typeof Dialog> {
  const dialog = new Dialog({
    title: "文本转链接 - 确认转换项",
    content: `<div class="link-tool-text-to-link">
      <div class="link-tool-text-to-link__toolbar"></div>
      <div class="link-tool-text-to-link__count"></div>
      <div class="link-tool-text-to-link__list"></div>
    </div>`,
    width: "720px",
    height: "65vh",
  });

  const root = dialog.element.querySelector(".link-tool-text-to-link") as HTMLDivElement;
  const toolbar = root.querySelector(".link-tool-text-to-link__toolbar") as HTMLDivElement;
  const countEl = root.querySelector(".link-tool-text-to-link__count") as HTMLDivElement;
  const list = root.querySelector(".link-tool-text-to-link__list") as HTMLDivElement;

  const selectAllBtn = createButton("全选");
  const clearBtn = createButton("清空");
  const confirmBtn = createButton("确认转换", true);
  const cancelBtn = createButton("取消");

  toolbar.append(selectAllBtn, clearBtn, confirmBtn, cancelBtn);

  const updateCount = () => {
    const checkboxes = list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    let checkedCount = 0;
    checkboxes.forEach((cb) => {
      if (cb.checked) checkedCount++;
    });
    countEl.textContent = `共检测到 ${args.candidates.length} 个候选 URL，已勾选 ${checkedCount} 项：`;
  };

  args.candidates.forEach((cand, index) => {
    const row = document.createElement("label");
    row.className = "link-tool-text-to-link__row";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "b3-switch";
    cb.checked = true;
    cb.dataset.url = cand.originalUrl;
    cb.dataset.index = String(index);

    cb.addEventListener("change", updateCount);

    const info = document.createElement("div");
    info.className = "link-tool-text-to-link__info";

    const titleLine = document.createElement("div");
    titleLine.className = "link-tool-text-to-link__title-line";

    const targetMarkdown = document.createElement("span");
    targetMarkdown.className = "link-tool-text-to-link__link-preview";
    targetMarkdown.textContent = cand.linkMarkdown;

    const originalUrl = document.createElement("span");
    originalUrl.className = "link-tool-text-to-link__original-url ft__secondary";
    originalUrl.textContent = `(${cand.originalUrl})`;

    titleLine.append(targetMarkdown, originalUrl);

    const context = document.createElement("div");
    context.className = "link-tool-text-to-link__context ft__secondary";
    context.textContent = cand.contextSnippet;

    info.append(titleLine, context);
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
    const selectedUrls = new Set<string>();
    const checkboxes = list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    checkboxes.forEach((cb) => {
      if (cb.checked && cb.dataset.url) {
        selectedUrls.add(cb.dataset.url);
      }
    });

    dialog.destroy();
    if (selectedUrls.size > 0) {
      await args.onConfirm(selectedUrls);
    }
  });

  cancelBtn.addEventListener("click", () => {
    dialog.destroy();
  });

  return dialog;
}
