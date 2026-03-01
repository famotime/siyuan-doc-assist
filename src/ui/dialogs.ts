import { confirm, Dialog, showMessage } from "siyuan";
import { suggestKeepDocId } from "@/core/dedupe-core";
import { DedupeCandidate } from "@/types/link-tool";

type OpenDedupeDialogArgs = {
  candidates: DedupeCandidate[];
  onDelete: (ids: string[]) => Promise<{ successIds: string[]; failed: Array<{ id: string; error: string }> }>;
  onOpenAll: (docs: Array<{ id: string; title: string }>) => void;
  onInsertLinks: (docs: Array<{ id: string; title: string }>) => void;
};

function createButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = label;
  button.className = "b3-button b3-button--outline";
  return button;
}

function createDocRow(
  candidateId: string,
  doc: DedupeCandidate["docs"][number],
  keepId: string
): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "link-tool-dedupe__row";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "b3-switch";
  checkbox.dataset.id = doc.id;
  checkbox.dataset.group = candidateId;
  checkbox.checked = doc.id !== keepId;

  const title = document.createElement("span");
  title.className = "link-tool-dedupe__title";
  title.textContent =
    doc.id === keepId
      ? `${doc.title} (${doc.updated}) [建议保留]`
      : `${doc.title} (${doc.updated})`;

  const path = document.createElement("span");
  path.className = "ft__secondary";
  path.textContent = doc.hPath;

  row.appendChild(checkbox);
  row.appendChild(title);
  row.appendChild(path);
  return row;
}

export function openDedupeDialog(args: OpenDedupeDialogArgs): InstanceType<typeof Dialog> {
  const dialog = new Dialog({
    title: "重复文档识别",
    content: `<div class="link-tool-dedupe"><div class="link-tool-dedupe__toolbar"></div><div class="link-tool-dedupe__groups"></div></div>`,
    width: "820px",
    height: "70vh",
  });

  const root = dialog.element.querySelector(".link-tool-dedupe") as HTMLDivElement;
  const toolbar = root.querySelector(".link-tool-dedupe__toolbar") as HTMLDivElement;
  const groups = root.querySelector(".link-tool-dedupe__groups") as HTMLDivElement;

  const selectAllBtn = createButton("全选");
  const clearBtn = createButton("清空选择");
  const keepEarliestWrap = document.createElement("label");
  keepEarliestWrap.className = "link-tool-dedupe__keep-mode";
  const keepEarliestSwitch = document.createElement("input");
  keepEarliestSwitch.type = "checkbox";
  keepEarliestSwitch.className = "b3-switch";
  keepEarliestSwitch.dataset.role = "keep-earliest-switch";
  const keepEarliestText = document.createElement("span");
  keepEarliestText.textContent = "保留最早更新";
  keepEarliestWrap.append(keepEarliestSwitch, keepEarliestText);
  const openAllBtn = createButton("打开全部文档");
  const insertLinksBtn = createButton("插入全部文档链接");
  const deleteBtn = createButton("删除选中");
  const cancelBtn = createButton("取消");
  deleteBtn.classList.add("b3-button--error");
  toolbar.append(
    selectAllBtn,
    clearBtn,
    keepEarliestWrap,
    openAllBtn,
    insertLinksBtn,
    deleteBtn,
    cancelBtn
  );

  const dedupeDocs = new Map<string, { id: string; title: string }>();
  for (const candidate of args.candidates) {
    for (const doc of candidate.docs) {
      if (doc.id && !dedupeDocs.has(doc.id)) {
        dedupeDocs.set(doc.id, { id: doc.id, title: doc.title || doc.id });
      }
    }
  }

  const queryCheckboxes = () =>
    [...groups.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-id]')];
  const getAllDocs = () => Array.from(dedupeDocs.values());

  const renderGroups = (keepMode: "latest" | "earliest") => {
    groups.innerHTML = "";
    for (const candidate of args.candidates) {
      const section = document.createElement("section");
      section.className = "link-tool-dedupe__group";

      const keepId = suggestKeepDocId(candidate.docs, keepMode);
      const heading = document.createElement("h4");
      heading.textContent = `相似组 ${candidate.groupId}（score: ${candidate.score.toFixed(
        2
      )}，保留${keepMode === "earliest" ? "最早" : "最后"}更新）`;
      section.appendChild(heading);

      for (const doc of candidate.docs) {
        section.appendChild(createDocRow(candidate.groupId, doc, keepId));
      }
      groups.appendChild(section);
    }
  };

  renderGroups("latest");

  selectAllBtn.addEventListener("click", () => {
    for (const checkbox of queryCheckboxes()) {
      checkbox.checked = true;
    }
  });

  clearBtn.addEventListener("click", () => {
    for (const checkbox of queryCheckboxes()) {
      checkbox.checked = false;
    }
  });

  keepEarliestSwitch.addEventListener("change", () => {
    renderGroups(keepEarliestSwitch.checked ? "earliest" : "latest");
  });

  openAllBtn.addEventListener("click", () => {
    const docs = getAllDocs();
    if (!docs.length) {
      showMessage("没有可打开的文档", 4000, "info");
      return;
    }
    args.onOpenAll(docs);
  });

  insertLinksBtn.addEventListener("click", () => {
    const docs = getAllDocs();
    if (!docs.length) {
      showMessage("没有可插入的文档链接", 4000, "info");
      return;
    }
    args.onInsertLinks(docs);
  });

  cancelBtn.addEventListener("click", () => {
    dialog.destroy();
  });

  deleteBtn.addEventListener("click", () => {
    const selectedIds = queryCheckboxes()
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.dataset.id || "")
      .filter(Boolean);

    if (!selectedIds.length) {
      showMessage("没有选择可删除文档", 4000, "error");
      return;
    }

    confirm(
      "确认删除",
      `将删除 ${selectedIds.length} 篇文档，是否继续？`,
      () => {
        void (async () => {
          deleteBtn.setAttribute("disabled", "true");
          try {
            const report = await args.onDelete(selectedIds);
            const failed = report.failed.length;
            const msg = failed
              ? `删除完成，成功 ${report.successIds.length}，失败 ${failed}`
              : `删除完成，成功 ${report.successIds.length}`;
            showMessage(msg, 7000, failed ? "error" : "info");
            dialog.destroy();
          } finally {
            deleteBtn.removeAttribute("disabled");
          }
        })();
      }
    );
  });

  return dialog;
}
