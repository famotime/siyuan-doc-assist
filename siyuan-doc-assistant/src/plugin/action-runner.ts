import { getActiveEditor, showMessage } from "siyuan";
import {
  findDeleteFromCurrentBlockIds,
  findExtraBlankParagraphIds,
  findHeadingMissingBlankParagraphBeforeIds,
  removeTrailingWhitespaceFromMarkdown,
} from "@/core/markdown-cleanup-core";
import { decodeURIComponentSafe } from "@/core/workspace-path-core";
import { resolveDocDirectChildBlockId } from "@/services/block-lineage";
import { deleteDocsByIds, findDuplicateCandidates } from "@/services/dedupe";
import { exportCurrentDocMarkdown, exportDocIdsAsMarkdownZip } from "@/services/exporter";
import {
  appendBlock,
  deleteBlockById,
  getBlockKramdown,
  getBlockKramdowns,
  getChildBlocksByParentId,
  getDocMetaByID,
  insertBlockBefore,
  updateBlockMarkdown,
} from "@/services/kernel";
import {
  filterDocRefsByExistingLinks,
  getBacklinkDocs,
  getChildDocs,
  getForwardLinkedDocIds,
  toBacklinkMarkdown,
  toChildDocMarkdown,
} from "@/services/link-resolver";
import { moveDocsAsChildren } from "@/services/mover";
import { openDedupeDialog } from "@/ui/dialogs";
import { ActionConfig, ActionKey, ACTIONS } from "@/plugin/actions";
import { ProtyleLike } from "@/plugin/doc-context";
import { applyBlockStyle, BlockStyle } from "@/core/markdown-style-core";

type ActionRunnerDeps = {
  isMobile: () => boolean;
  resolveDocId: (explicitId?: string, protyle?: ProtyleLike) => string;
  askConfirm: (title: string, text: string) => Promise<boolean>;
  setBusy?: (busy: boolean) => void;
};

type CurrentBlockResolveSource =
  | "provided-block-id"
  | "provided-dom"
  | "active-block-id"
  | "active-dom"
  | "none";

type CurrentBlockResolveResult = {
  id: string;
  source: CurrentBlockResolveSource;
  wasDocId: boolean;
};

type StyleFailureKind = "source-missing" | "update-failed";

type StyleFailureDetail = {
  id: string;
  kind: StyleFailureKind;
  reason: string;
};

export class ActionRunner {
  private isRunning = false;

  constructor(private readonly deps: ActionRunnerDeps) {}

  private getProtyleBlockId(protyle?: ProtyleLike): string {
    return (protyle?.block?.id || "").trim();
  }

  private normalizeCandidateBlockId(candidateId: string, docId: string): CurrentBlockResolveResult {
    const normalized = (candidateId || "").trim();
    if (!normalized) {
      return { id: "", source: "none", wasDocId: false };
    }
    if (normalized === docId) {
      return { id: "", source: "none", wasDocId: true };
    }
    return { id: normalized, source: "none", wasDocId: false };
  }

  private getFocusedBlockIdFromDom(protyle?: ProtyleLike): string {
    if (typeof window === "undefined") {
      return "";
    }
    const root = protyle?.wysiwyg?.element as HTMLElement | undefined;
    if (!root || typeof root.querySelector !== "function") {
      return "";
    }

    const resolveFromElement = (element: Element | null | undefined) => {
      if (!element) {
        return "";
      }
      const blockElement = element.closest?.("[data-node-id]") as HTMLElement | null;
      if (!blockElement || !root.contains(blockElement)) {
        return "";
      }
      return (blockElement.dataset.nodeId || blockElement.getAttribute("data-node-id") || "").trim();
    };

    const selection = window.getSelection?.();
    const anchorNode = selection?.anchorNode || null;
    const anchorElement =
      anchorNode && (anchorNode as any).nodeType === Node.ELEMENT_NODE
        ? (anchorNode as Element)
        : anchorNode?.parentElement || null;
    const fromAnchor = resolveFromElement(anchorElement);
    if (fromAnchor) {
      return fromAnchor;
    }

    const focused = root.querySelector(":focus");
    const fromFocused = resolveFromElement(focused);
    if (fromFocused) {
      return fromFocused;
    }

    return "";
  }

  private resolveCurrentBlockId(docId: string, protyle?: ProtyleLike): CurrentBlockResolveResult {
    let wasDocId = false;

    const fromProvided = this.normalizeCandidateBlockId(this.getProtyleBlockId(protyle), docId);
    if (fromProvided.id) {
      return { ...fromProvided, source: "provided-block-id" };
    }
    wasDocId = wasDocId || fromProvided.wasDocId;

    const fromProvidedDom = this.normalizeCandidateBlockId(this.getFocusedBlockIdFromDom(protyle), docId);
    if (fromProvidedDom.id) {
      return { ...fromProvidedDom, source: "provided-dom", wasDocId };
    }
    wasDocId = wasDocId || fromProvidedDom.wasDocId;

    const activeProtyle = getActiveEditor()?.protyle as ProtyleLike | undefined;
    const fromActive = this.normalizeCandidateBlockId(this.getProtyleBlockId(activeProtyle), docId);
    if (fromActive.id) {
      return { ...fromActive, source: "active-block-id", wasDocId };
    }
    wasDocId = wasDocId || fromActive.wasDocId;

    const fromActiveDom = this.normalizeCandidateBlockId(this.getFocusedBlockIdFromDom(activeProtyle), docId);
    if (fromActiveDom.id) {
      return { ...fromActiveDom, source: "active-dom", wasDocId };
    }
    wasDocId = wasDocId || fromActiveDom.wasDocId;

    return {
      id: "",
      source: "none",
      wasDocId,
    };
  }

  private async askConfirmWithVisibleDialog(title: string, text: string): Promise<boolean> {
    this.deps.setBusy?.(false);
    return this.deps.askConfirm(title, text);
  }

  async runAction(action: ActionKey, explicitId?: string, protyle?: ProtyleLike) {
    const config = ACTIONS.find((item) => item.key === action);
    if (config?.desktopOnly && this.deps.isMobile()) {
      showMessage("该操作当前仅支持桌面端", 5000, "error");
      return;
    }

    const docId = this.deps.resolveDocId(explicitId, protyle);
    if (!docId) {
      showMessage("未找到当前文档上下文，请先打开文档后重试", 5000, "error");
      return;
    }

    if (this.isRunning) {
      showMessage("正在处理中，请等待当前任务完成", 4000, "info");
      return;
    }

    this.isRunning = true;
    this.deps.setBusy?.(true);

    try {
      switch (action) {
        case "export-current":
          await this.handleExportCurrent(docId);
          break;
        case "insert-backlinks":
          await this.handleInsertBacklinks(docId);
          break;
        case "insert-child-docs":
          await this.handleInsertChildDocs(docId);
          break;
        case "export-backlinks-zip":
          await this.handleExportBacklinksZip(docId);
          break;
        case "export-forward-zip":
          await this.handleExportForwardZip(docId);
          break;
        case "move-backlinks":
          await this.handleMoveBacklinks(docId);
          break;
        case "dedupe":
          await this.handleDedupe(docId);
          break;
        case "remove-extra-blank-lines":
          await this.handleRemoveExtraBlankLines(docId);
          break;
        case "trim-trailing-whitespace":
          await this.handleTrimTrailingWhitespace(docId);
          break;
        case "insert-blank-before-headings":
          await this.handleInsertBlankBeforeHeadings(docId);
          break;
        case "delete-from-current-to-end":
          await this.handleDeleteFromCurrentToEnd(docId, protyle);
          break;
        case "bold-selected-blocks":
          await this.handleStyleSelectedBlocks(docId, protyle, "bold");
          break;
        case "highlight-selected-blocks":
          await this.handleStyleSelectedBlocks(docId, protyle, "highlight");
          break;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      showMessage(message, 7000, "error");
    } finally {
      this.isRunning = false;
      this.deps.setBusy?.(false);
    }
  }

  registerCommands(register: (config: ActionConfig, run: () => void) => void) {
    for (const action of ACTIONS) {
      register(action, () => {
        void this.runAction(action.key);
      });
    }
  }

  private async handleExportCurrent(docId: string) {
    const result = await exportCurrentDocMarkdown(docId);
    if (result.mode === "zip") {
      showMessage(
        `导出完成（含媒体）：${result.fileName}${result.zipPath ? `，路径 ${result.zipPath}` : ""}`,
        8000,
        "info"
      );
      return;
    }
    showMessage(`导出完成：${result.fileName}`, 5000, "info");
  }

  private async handleInsertBacklinks(docId: string) {
    const backlinks = await getBacklinkDocs(docId);
    if (!backlinks.length) {
      showMessage("当前文档没有可插入的反向链接文档", 5000, "info");
      return;
    }
    const filtered = await filterDocRefsByExistingLinks(docId, backlinks);
    if (!filtered.items.length) {
      showMessage("当前文档已包含所有反向链接文档", 5000, "info");
      return;
    }
    const markdown = toBacklinkMarkdown(filtered.items);
    await appendBlock(markdown, docId);
    const skipSuffix = filtered.skipped.length ? `，跳过已存在 ${filtered.skipped.length} 个` : "";
    showMessage(`已插入 ${filtered.items.length} 个反链文档链接${skipSuffix}`, 5000, "info");
  }

  private async handleInsertChildDocs(docId: string) {
    const childDocs = await getChildDocs(docId);
    if (!childDocs.length) {
      showMessage("当前文档没有可插入的子文档", 5000, "info");
      return;
    }
    const filtered = await filterDocRefsByExistingLinks(docId, childDocs);
    if (!filtered.items.length) {
      showMessage("当前文档已包含所有子文档链接", 5000, "info");
      return;
    }
    const markdown = toChildDocMarkdown(filtered.items);
    await appendBlock(markdown, docId);
    const skipSuffix = filtered.skipped.length ? `，跳过已存在 ${filtered.skipped.length} 个` : "";
    showMessage(`已插入 ${filtered.items.length} 个子文档链接${skipSuffix}`, 5000, "info");
  }

  private async handleExportBacklinksZip(docId: string) {
    const backlinks = await getBacklinkDocs(docId);
    const ids = backlinks.map((item) => item.id);
    await this.exportDocZip(ids, "反链", docId);
  }

  private async handleExportForwardZip(docId: string) {
    const ids = await getForwardLinkedDocIds(docId);
    console.info("[DocAssistant][ForwardLinks] export-forward-zip trigger", {
      currentDocId: docId,
      forwardDocCount: ids.length,
      forwardDocIds: ids,
    });
    if (!ids.length) {
      showMessage(
        "未找到可导出的正链文档。请打开开发者工具查看 [DocAssistant][ForwardLinks] 调试日志",
        9000,
        "error"
      );
      return;
    }
    await this.exportDocZip(ids, "正链", docId);
  }

  private async exportDocZip(ids: string[], label: string, currentDocId: string) {
    if (!ids.length) {
      showMessage(`未找到可导出的${label}文档`, 5000, "error");
      return;
    }
    const currentDoc = await getDocMetaByID(currentDocId);
    const preferredZipName = currentDoc?.title || currentDocId;
    const result = await exportDocIdsAsMarkdownZip(ids, preferredZipName);
    const displayName = decodeURIComponentSafe(result.name || "");
    const displayZip = decodeURIComponentSafe(result.zip || "");
    showMessage(`导出完成（${displayName}）：${displayZip}`, 9000, "info");
  }

  private async handleMoveBacklinks(docId: string) {
    const backlinks = await getBacklinkDocs(docId);
    if (!backlinks.length) {
      showMessage("当前文档没有反向链接文档可移动", 5000, "info");
      return;
    }
    const ok = await this.askConfirmWithVisibleDialog(
      "确认移动",
      `将尝试把 ${backlinks.length} 篇反链文档移动为当前文档子文档，是否继续？`
    );
    if (!ok) {
      return;
    }
    this.deps.setBusy?.(true);

    const report = await moveDocsAsChildren(
      docId,
      backlinks.map((item) => item.id)
    );
    const message = [
      `移动完成：成功 ${report.successIds.length}`,
      `跳过 ${report.skippedIds.length}`,
      `重命名 ${report.renamed.length}`,
      `失败 ${report.failed.length}`,
    ].join("，");
    showMessage(message, 9000, report.failed.length ? "error" : "info");
  }

  private async handleDedupe(docId: string) {
    const candidates = await findDuplicateCandidates(docId, 0.85);
    if (!candidates.length) {
      showMessage("未识别到重复文档", 5000, "info");
      return;
    }

    openDedupeDialog({
      candidates,
      onDelete: async (ids) => deleteDocsByIds(ids),
      onOpenAll: (docs) => {
        this.openDocsByProtocol(docs.map((doc) => doc.id));
      },
      onInsertLinks: (docs) => {
        void this.insertDocLinks(docId, docs);
      },
    });
    showMessage(`识别到 ${candidates.length} 组重复候选`, 5000, "info");
  }

  private getSelectedBlockIds(protyle?: ProtyleLike): string[] {
    const activeProtyle = protyle || (getActiveEditor()?.protyle as ProtyleLike | undefined);
    const root = activeProtyle?.wysiwyg?.element as HTMLElement | undefined;
    if (!root) {
      return [];
    }
    const selectors = [
      ".protyle-wysiwyg--select",
      ".protyle-wysiwyg__select",
      ".protyle-wysiwyg--selecting",
      "[data-node-id][data-node-selected]",
    ];
    const nodes = root.querySelectorAll(selectors.join(","));
    const ids: string[] = [];
    const seen = new Set<string>();
    nodes.forEach((node) => {
      const element =
        (node as HTMLElement).closest?.("[data-node-id]") || (node as HTMLElement);
      const id =
        (element as HTMLElement).dataset.nodeId || element.getAttribute("data-node-id") || "";
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    });

    if (ids.length) {
      return ids;
    }

    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return ids;
    }
    const blockNodes = root.querySelectorAll<HTMLElement>("[data-node-id]");
    blockNodes.forEach((node) => {
      try {
        if (selection.containsNode(node, true)) {
          const id = node.dataset.nodeId || node.getAttribute("data-node-id") || "";
          if (id && !seen.has(id)) {
            seen.add(id);
            ids.push(id);
          }
        }
      } catch {
        // Ignore DOM selection errors in non-standard environments.
      }
    });
    return ids;
  }

  private async handleStyleSelectedBlocks(
    docId: string,
    protyle: ProtyleLike | undefined,
    style: BlockStyle
  ) {
    const selectedIds = this.getSelectedBlockIds(protyle);
    if (!selectedIds.length) {
      showMessage("未选中任何块，请先选中块", 5000, "info");
      return;
    }

    const kramdowns = await getBlockKramdowns(selectedIds);
    const kramdownMap = new Map(
      kramdowns.map((item) => [item.id, item.kramdown || ""])
    );

    let success = 0;
    let failed = 0;
    let skipped = 0;
    const failures: StyleFailureDetail[] = [];
    for (const id of selectedIds) {
      const source = kramdownMap.get(id);
      if (source === undefined) {
        failed += 1;
        failures.push({
          id,
          kind: "source-missing",
          reason: "读取块源码失败",
        });
        continue;
      }
      const next = applyBlockStyle(source, style);
      if (next === source) {
        skipped += 1;
        continue;
      }
      try {
        await updateBlockMarkdown(id, next);
        success += 1;
      } catch (error: unknown) {
        failed += 1;
        failures.push({
          id,
          kind: "update-failed",
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (success === 0 && failed === 0 && skipped > 0) {
      showMessage("未发现可处理内容", 4000, "info");
      return;
    }
    if (failed > 0) {
      const sample = this.summarizeStyleFailures(failures);
      console.warn("[DocAssistant][Style] apply failed", {
        docId,
        style,
        selectedCount: selectedIds.length,
        success,
        failed,
        skipped,
        failures,
      });
      showMessage(
        `处理完成，成功 ${success}，失败 ${failed}${sample ? `（${sample}）` : ""}`,
        6000,
        "error"
      );
      return;
    }
    showMessage(`已处理 ${success} 个块`, 5000, "info");
  }

  private summarizeStyleFailures(failures: StyleFailureDetail[]): string {
    if (!failures.length) {
      return "";
    }
    const normalized = failures
      .slice(0, 3)
      .map((item) => {
        const reason = (item.reason || "").replace(/\s+/g, " ").trim();
        if (!reason) {
          return `${item.id}`;
        }
        const compact = reason.length > 24 ? `${reason.slice(0, 24)}...` : reason;
        return `${item.id}:${compact}`;
      })
      .join("；");
    return normalized;
  }

  private openDocByProtocol(blockId: string) {
    const url = `siyuan://blocks/${blockId}`;
    try {
      window.open(url);
    } catch {
      window.location.href = url;
    }
  }

  private openDocsByProtocol(ids: string[]) {
    const unique = [...new Set(ids)].filter(Boolean);
    if (!unique.length) {
      showMessage("没有可打开的文档", 4000, "info");
      return;
    }
    unique.forEach((id, index) => {
      window.setTimeout(() => {
        this.openDocByProtocol(id);
      }, index * 120);
    });
    showMessage(`已尝试打开 ${unique.length} 篇文档`, 5000, "info");
  }

  private async insertDocLinks(
    docId: string,
    docs: Array<{ id: string; title: string }>
  ) {
    const unique = new Map<string, { id: string; title: string }>();
    for (const doc of docs) {
      if (!doc?.id || unique.has(doc.id)) {
        continue;
      }
      unique.set(doc.id, { id: doc.id, title: doc.title || doc.id });
    }
    const items = Array.from(unique.values());
    if (!items.length) {
      showMessage("没有可插入的文档链接", 4000, "info");
      return;
    }
    const lines = items.map((item) => `- [${item.title}](siyuan://blocks/${item.id})`);
    const markdown = `## 重复候选文档\n\n${lines.join("\n")}`;
    await appendBlock(markdown, docId);
    showMessage(`已插入 ${items.length} 个文档链接`, 5000, "info");
  }

  private async handleRemoveExtraBlankLines(docId: string) {
    const blocks = await getChildBlocksByParentId(docId);
    if (!blocks.length) {
      showMessage("当前文档没有可处理的段落", 4000, "info");
      return;
    }

    const result = findExtraBlankParagraphIds(blocks);
    if (result.removedCount === 0) {
      showMessage("未发现需要去除的空段落", 4000, "info");
      return;
    }

    const ok = await this.askConfirmWithVisibleDialog(
      "确认去除空行",
      `将删除 ${result.removedCount} 个空段落，是否继续？`
    );
    if (!ok) {
      return;
    }
    this.deps.setBusy?.(true);

    let failed = 0;
    for (const id of result.deleteIds) {
      try {
        await deleteBlockById(id);
      } catch {
        failed += 1;
      }
    }

    if (failed > 0) {
      showMessage(`已去除 ${result.removedCount - failed} 个空段落，失败 ${failed} 个`, 6000, "error");
      return;
    }
    showMessage(`已去除 ${result.removedCount} 个空段落`, 5000, "info");
  }

  private async handleInsertBlankBeforeHeadings(docId: string) {
    const blocks = await getChildBlocksByParentId(docId);
    if (!blocks.length) {
      showMessage("当前文档没有可处理的段落", 4000, "info");
      return;
    }

    const result = findHeadingMissingBlankParagraphBeforeIds(blocks);
    if (result.insertCount === 0) {
      showMessage("所有标题前均已有空段落", 4000, "info");
      return;
    }

    const ok = await this.askConfirmWithVisibleDialog(
      "确认补空段落",
      `将为 ${result.insertCount} 个标题前插入空段落，是否继续？`
    );
    if (!ok) {
      return;
    }
    this.deps.setBusy?.(true);

    let failed = 0;
    for (const headingId of result.insertBeforeIds) {
      try {
        await insertBlockBefore("<br />", headingId, docId);
      } catch {
        failed += 1;
      }
    }

    if (failed > 0) {
      showMessage(`已为 ${result.insertCount - failed} 个标题补充空段落，失败 ${failed} 个`, 6000, "error");
      return;
    }
    showMessage(`已为 ${result.insertCount} 个标题补充空段落`, 5000, "info");
  }

  private async handleTrimTrailingWhitespace(docId: string) {
    const blocks = await getChildBlocksByParentId(docId);
    console.info("[DocAssistant][TrailingWhitespace] scan start", {
      docId,
      blockCount: blocks.length,
    });
    if (!blocks.length) {
      showMessage("当前文档没有可处理的段落", 4000, "info");
      return;
    }

    const collectUpdatesFromSourceMap = (sourceMap: Map<string, string>) => {
      const updates: Array<{ id: string; markdown: string; changedLines: number }> = [];
      let affectedLineCount = 0;
      for (const block of blocks) {
        const sourceFromKramdown = sourceMap.get(block.id);
        if (block.resolved === false && sourceFromKramdown === undefined) {
          continue;
        }
        const source = sourceFromKramdown === undefined ? block.markdown || "" : sourceFromKramdown;
        const cleaned = removeTrailingWhitespaceFromMarkdown(source);
        if (cleaned.changedLines <= 0) {
          continue;
        }
        updates.push({
          id: block.id,
          markdown: cleaned.markdown,
          changedLines: cleaned.changedLines,
        });
        affectedLineCount += cleaned.changedLines;
      }
      return { updates, affectedLineCount };
    };

    const batchRows = (await getBlockKramdowns(blocks.map((block) => block.id))) || [];
    const batchMap = new Map(
      batchRows.map((item) => [item.id, item.kramdown || ""])
    );
    let singleMap = new Map<string, string>();
    let { updates, affectedLineCount } = collectUpdatesFromSourceMap(batchMap);
    console.info("[DocAssistant][TrailingWhitespace] batch scan result", {
      docId,
      batchCount: batchRows.length,
      updateCount: updates.length,
      affectedLineCount,
      updateSample: updates.slice(0, 8).map((item) => item.id),
    });

    if (!updates.length) {
      console.info("[DocAssistant][TrailingWhitespace] batch no-op, fallback to single", {
        docId,
        blockCount: blocks.length,
        batchCount: batchRows.length,
      });
      singleMap = new Map<string, string>();
      for (const block of blocks) {
        try {
          const row = await getBlockKramdown(block.id);
          if (row?.kramdown != null) {
            singleMap.set(block.id, row.kramdown || "");
          }
        } catch {
          // Fallback should be best-effort. Keep no-op behavior when source cannot be loaded.
        }
      }
      ({ updates, affectedLineCount } = collectUpdatesFromSourceMap(singleMap));
      console.info("[DocAssistant][TrailingWhitespace] single fallback result", {
        docId,
        singleCount: singleMap.size,
        updateCount: updates.length,
        affectedLineCount,
      });
    }

    if (!updates.length) {
      const probeSamples = blocks.slice(0, 8).map((block) => {
        const source = (singleMap.get(block.id) ?? batchMap.get(block.id) ?? block.markdown) || "";
        return {
          id: block.id,
          length: source.length,
          hasWhiteSpacePre: /white-space\s*:\s*pre/i.test(source),
          hasTailWhitespace: /[ \t]+$/.test(source),
          hasEscapedWhitespaceToken: /(?:\\t|\\u0009|\\x09)/i.test(source),
          preview: JSON.stringify(source.slice(0, 200)),
        };
      });
      console.info("[DocAssistant][TrailingWhitespace] no-op source probe", {
        docId,
        sampleCount: probeSamples.length,
        samples: probeSamples,
      });
      showMessage("未发现需要清理的行尾空格", 4000, "info");
      return;
    }

    const ok = await this.askConfirmWithVisibleDialog(
      "确认清理行尾空格",
      `将更新 ${updates.length} 个块，清理 ${affectedLineCount} 行行尾空格，是否继续？`
    );
    if (!ok) {
      return;
    }
    this.deps.setBusy?.(true);

    const maxApplyAttempts = 3;
    const maxVerifyReadAttempts = 3;
    const verifyReadDelayMs = 80;
    const retryDelayMs = 120;
    const sleep = async (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });
    const previewMarkdown = (value: string, max = 160) =>
      JSON.stringify(value.length > max ? `${value.slice(0, max)}…` : value);
    let successBlockCount = 0;
    let successLineCount = 0;
    let failedBlockCount = 0;
    const failedUpdates: Array<{
      id: string;
      attempts: number;
      verifyReads: number;
      message: string;
      lastChangedLines: number;
      persistedPreview: string;
      cleanedPreview: string;
    }> = [];
    for (const item of updates) {
      let currentMarkdown = item.markdown;
      let attempts = 0;
      let applied = false;
      let failureMessage = "";
      let verifyReads = 0;
      let lastChangedLines = 0;
      let lastPersistedPreview = "";
      let lastCleanedPreview = previewMarkdown(currentMarkdown);
      for (let attempt = 1; attempt <= maxApplyAttempts; attempt += 1) {
        attempts = attempt;
        try {
          await updateBlockMarkdown(item.id, currentMarkdown);
        } catch (error: unknown) {
          failureMessage = error instanceof Error ? error.message : String(error);
          break;
        }
        try {
          let verifiedClean = false;
          for (let readAttempt = 1; readAttempt <= maxVerifyReadAttempts; readAttempt += 1) {
            verifyReads = readAttempt;
            const persisted = await getBlockKramdown(item.id);
            const persistedMarkdown = persisted?.kramdown;
            if (typeof persistedMarkdown !== "string") {
              // Some kernels may not return row data immediately; keep backward-compatible success.
              applied = true;
              verifiedClean = true;
              break;
            }
            lastPersistedPreview = previewMarkdown(persistedMarkdown);
            const verification = removeTrailingWhitespaceFromMarkdown(persistedMarkdown);
            lastChangedLines = verification.changedLines;
            lastCleanedPreview = previewMarkdown(verification.markdown);
            if (verification.changedLines <= 0) {
              applied = true;
              verifiedClean = true;
              break;
            }
            currentMarkdown = verification.markdown;
            failureMessage = `verification-not-clean:${verification.changedLines}`;
            if (readAttempt < maxVerifyReadAttempts) {
              await sleep(verifyReadDelayMs * readAttempt);
            }
          }
          if (verifiedClean) {
            break;
          }
          if (attempt < maxApplyAttempts) {
            await sleep(retryDelayMs * attempt);
          }
        } catch (error: unknown) {
          // Verification failures should not block the operation itself.
          applied = true;
          failureMessage = `verification-skipped:${error instanceof Error ? error.message : String(error)}`;
          break;
        }
      }
      if (applied) {
        successBlockCount += 1;
        successLineCount += item.changedLines;
      } else {
        failedBlockCount += 1;
        failedUpdates.push({
          id: item.id,
          attempts,
          verifyReads,
          message: failureMessage || "unknown failure",
          lastChangedLines,
          persistedPreview: lastPersistedPreview,
          cleanedPreview: lastCleanedPreview,
        });
      }
    }
    const failedSummary = failedUpdates
      .slice(0, 8)
      .map(
        (item) =>
          `${item.id}|attempts=${item.attempts}|reads=${item.verifyReads}|changed=${item.lastChangedLines}|${item.message}`
      );
    console.info("[DocAssistant][TrailingWhitespace] apply result", {
      docId,
      updateCount: updates.length,
      successBlockCount,
      successLineCount,
      failedBlockCount,
      maxApplyAttempts,
      maxVerifyReadAttempts,
      failedSummary,
      failedSample: failedUpdates.slice(0, 8),
    });

    if (failedBlockCount > 0) {
      showMessage(
        `已清理 ${successBlockCount} 个块、${successLineCount} 行，失败 ${failedBlockCount} 个块`,
        7000,
        "error"
      );
      return;
    }
    showMessage(`已清理 ${successBlockCount} 个块、${successLineCount} 行行尾空格`, 5000, "info");
  }

  private async handleDeleteFromCurrentToEnd(docId: string, protyle?: ProtyleLike) {
    const current = this.resolveCurrentBlockId(docId, protyle);
    const currentBlockId = current.id;
    if (!currentBlockId) {
      showMessage("未定位到当前段落，请将光标置于正文后重试", 5000, "error");
      return;
    }

    const blocks = await getChildBlocksByParentId(docId);
    if (!blocks.length) {
      showMessage("当前文档没有可处理的段落", 4000, "info");
      return;
    }

    const directChildIdSet = new Set(blocks.map((item) => item.id));
    let deleteStartId = currentBlockId;
    let mappedFromNested = false;
    if (!directChildIdSet.has(deleteStartId)) {
      const mapped = await resolveDocDirectChildBlockId(docId, deleteStartId);
      if (mapped) {
        mappedFromNested = true;
        deleteStartId = mapped;
      }
    }
    console.info("[DocAssistant][DeleteFromCurrent] resolve start block", {
      docId,
      source: current.source,
      currentBlockIdWasDocId: current.wasDocId,
      currentBlockId,
      deleteStartId,
      mappedFromNested,
      directChildCount: blocks.length,
    });

    const result = findDeleteFromCurrentBlockIds(blocks, deleteStartId);
    if (result.deleteCount === 0) {
      showMessage("未找到从当前段落开始的可删除内容", 5000, "error");
      return;
    }

    const ok = await this.askConfirmWithVisibleDialog(
      "确认删除后续段落",
      `将删除 ${result.deleteCount} 个段落（含当前段），是否继续？`
    );
    if (!ok) {
      return;
    }
    this.deps.setBusy?.(true);

    let failed = 0;
    for (const id of result.deleteIds) {
      try {
        await deleteBlockById(id);
      } catch {
        failed += 1;
      }
    }

    if (failed > 0) {
      showMessage(`已删除 ${result.deleteCount - failed} 个段落，失败 ${failed} 个`, 6000, "error");
      return;
    }
    showMessage(`已删除 ${result.deleteCount} 个段落`, 5000, "info");
  }
}
