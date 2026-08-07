# 撤销/重做（Undo/Redo）集成改造计划

本计划旨在针对 `siyuan-doc-assist` 插件中收益最大的 A 类（纯删除操作）和 B 类（单块无损清洗操作）场景进行重构，通过引入前端 `Protyle` 事务（Transaction）机制，实现对原生撤销栈（`Ctrl+Z`）的支持。

## 方案关键点

**API 依赖变更与降级策略**：本次改造将尝试直接操作思源的前端 DOM 和使用 `protyle.transaction` 内部 API。如果因为文档未激活、在后台运行或 DOM 获取失败，操作会自动降级为现有的基于 `Kernel HTTP` 的直接写入（降级后将和原来一样不支持 Undo）。

**Markdown 与 DOM 转换**：B类操作原先是在 Markdown 层面正则修改，为了使用 transaction 必须转换成 DOM。计划中将引入后端渲染调用（如调用 Lute 的 API）。这可能会带来轻微的请求延迟（每个被修改的块需要先转换再构建 transaction）。

## 提议的变更项

---

### Phase 1: 基础设施建设 (Transaction Runner Framework)

构建在前端与后端 API 之间智能路由的事务管理器。

#### [NEW] `src/plugin/transaction-runner.ts`
- 实现 `runProtyleTransaction(protyle, doOperations, undoOperations)`。
- 实现 `resolveSubmitBlockElement(protyle, blockId)`：从激活的 Protyle 树中找到当前的 Live DOM 节点，获取其 `outerHTML`、`previousID` 和 `parentID`，作为 Undo 快照的基石。

#### [MODIFY] `src/plugin/doc-context.ts` & `action-runner-context.ts`
- 补充、完善 `getActiveEditor` 提取 `protyle` 实例的方法。确保在各种 Action Handler 中能顺利把 `protyle` 实例传递给 `transaction-runner.ts`。

---

### Phase 2: Category A（纯删除类操作）改造

这类操作只涉及删除，直接提取活 DOM 作为撤销快照，收益最高且无 Markdown 解析负担。

#### [MODIFY] `src/plugin/action-runner-cleanup-handlers.ts`
- **目标**：`handleRemoveExtraBlankLines`
- **逻辑变更**：将原来直接调用的 `deleteBlocksByIds` 替换为一个智能封装（尝试构建 `{action: "delete"}` 的 Do 动作，并查阅 Live DOM 提取 `oldHTML` 构建 `{action: "insert"}` 的 Undo 动作）。

#### [MODIFY] `src/plugin/action-runner-delete-range-handlers.ts` & `action-runner-trim-handlers.ts`
- **目标**：选中区域的删除和裁剪逻辑。
- **逻辑变更**：同上。收集被删块的 ID，映射到活 DOM 并构建 transaction 提交。失败则降级。

---

### Phase 3: Category B（块结构无损的文本清洗）改造

这类操作需要将清洗后的 Markdown 再转为 DOM 供前端替换。

#### [MODIFY] `src/services/kernel-block.ts`
- **目标**：新增与 SiYuan Lute 或渲染相关的 API 绑定。
- **逻辑变更**：添加 `kramdownToBlockDOM(kramdown: string): Promise<string>` 方法。若内核没有单一 API，可能需要通过临时插入获取或查询现有 `getBlockDOM`。

#### [MODIFY] `src/plugin/action-runner-cleanup-handlers.ts`
- **目标**：`handleRemoveStrikethrough`, `handleRemoveClippedListPrefix`, `handleCleanupAiOutput`
- **逻辑变更**：在正则修改 Markdown 并确认有变化后，通过新增的 `kramdownToBlockDOM` 拿到新 DOM。收集 `{action: "update", data: newHTML}` 作为 Do，原 DOM 作为 Undo 提交。

#### [MODIFY] `src/plugin/action-runner-trim-handlers.ts`
- **目标**：`handleTrimTrailingWhitespace`
- **逻辑变更**：对于只修改了 Markdown 尚未能取到 DOM 的块，同样进行 `Markdown -> DOM` 转换；对于已经是通过 `removeTrailingWhitespaceFromDom` 处理得到 DOM 的块，可直接封装事务提交。

## 验证计划

1. **纯删除验证**：运行“清理冗余空段落”命令，确认空行消失。按下 `Ctrl+Z`，空行恢复且文档没有报错。
2. **清洗验证**：制造带有删除线的高亮文字。运行清理命令，删除线消失。按下 `Ctrl+Z`，高亮格式与删除线完美恢复。
3. **降级验证**：在新页签通过后台执行命令，或聚焦在不可编辑区域执行。验证能否顺利降级回 HTTP 接口静默生效（无报错）。
