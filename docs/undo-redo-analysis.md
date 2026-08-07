# 撤销/重做（Undo/Redo）集成方案深度分析与借鉴报告

## 一、 方案解析

能够支持安全的 `Ctrl+Z`，是因为它**完全摒弃了后端接口进行写入**，转而利用了前端已加载的 DOM 和思源编辑器原生事务机制。

核心实现路径：
1. **获取 Protyle 实例**：通过遍历 `siyuan.getAllEditor()`，寻找当前处于前台并且光标所在（或匹配节点所在的）激活的 Protyle 实例。
2. **提取与克隆 DOM**：在实例视图中通过 DOM 选择器（`[data-node-id="..."]`）找到命中的活动的 Block，并保存其修改前的 `outerHTML` 作为撤销回退用的快照（Undo 数据）。随后克隆出一个 `cloneNode(true)` 用于在内存里执行修改。
3. **前端内存替换**：对这个克隆出来的 DOM 树执行纯前端的文本节点 (`Text`) 操作，将命中字符替换掉。
4. **事务打包提交**：
   - 调用 `protyle.transaction(doOperations, undoOperations)`（多块替换）。
   - 或 `protyle.updateTransactionElement(liveSubmit, oldHTML)`（单块替换）。
   
   在提交的这一刻，思源内核会接收到这个事务并向全网广播更新，同时前台 Protyle 编辑器顺理成章地将这个事务推入了它的 Undo 栈。

## 二、 `siyuan-doc-assist` 引入撤销重做的可行性

目前 `siyuan-doc-assist` 进行文档处理（清理空白段落、修剪多余空格、拆分中英文等）基本是在 `src/services/kernel-block.ts` 中**直接通过 HTTP API (`updateBlockMarkdown` 等) 调用后端核心**。
由 HTTP 后台接口强行写入的改动，会以“远端更新”的形式通过 WebSocket 将前端冲刷一遍，这类修改**天然会被排除在本地的 Undo 栈之外**，用户发现误操作时无法通过快捷键恢复。

借鉴思路来重构是**高度可行的**，能极大改善体验。但难点在于：可行的是基于纯文本（纯 DOM Text 节点）进行的修改，而 `doc-assist` 中大量高级处理是基于 **Markdown 字符串**的正则清洗与结构变更，两者存在数据维度的鸿沟。

下面逐个分析各项操作命令的重构思路和阻力评估：

### A. 纯删除类操作：低成本、高收益（强烈建议优先改造）
- **涉及命令**：
  - `handleRemoveExtraBlankLines`（清理冗余空段落）
  - 选区删除/裁剪 （`action-runner-delete-range-handlers.ts`, `action-runner-trim-handlers.ts`）
- **当前机制**：收集一批空块或需要移除的块的 ID，调用 `deleteBlocksByIds` 接口直接后端删除。
- **改造方案（完全可行）**：
  由于只涉及“删”，不需要处理 Markdown 渲染问题。我们在前端拦截时，先去存活的 Protyle 里拿到这些要被删的 DOM 的 `outerHTML`，以及它们的前驱节点 ID (`previousID`)。
  构建事务：
  - `doOperations`: `[{ action: "delete", id: blockId }]`
  - `undoOperations`: `[{ action: "insert", id: blockId, previousID, data: oldHTML }]`
  
  直接投递给 `protyle.transaction()`。

### B. 单块结构无损的清洗操作：中等成本
- **涉及命令**：
  - `handleTrimTrailingWhitespace`（去除段落末尾空格）
  - `handleRemoveStrikethrough`（清理删除线内容）
  - `handleRemoveClippedListPrefix`（清理残缺的列表前缀）
  - `handleCleanupAiOutput`（清理 AI 生成的隐形字符伪影）
- **当前机制**：获取 Markdown -> 正则清洗内容 -> 走 `updateBlockMarkdown`。
- **改造方案**：
  如果要送入 `protyle.transaction()`，操作的 `data` 载荷必须是标准的 block DOM，不支持传入 Markdown。
  因此，我们需要在内存里修改完 Markdown 以后，建立一个异步工具函数（例如借用后端的 `/api/block/kramdown2Block` 或者在前端静默调用 Lute），将“洗好的 Markdown” **单点转换为 DOM 字符串**。
  取得新 DOM 后构建事务：
  - `doOperations`: `[{ action: "update", id, data: newHTML }]`
  - `undoOperations`: `[{ action: "update", id, data: oldHTML }]`

### C. 涉及块结构拆分与合并的复杂操作：难度偏高
- **涉及命令**：
  - `action-runner-block-transform.ts` (如中英段落打断并分拆)
- **当前机制**：一段 Markdown 被处理为两段，向后端发起 `deleteBlocksByIds` 原节点，并在原地 `insertBlockBefore` 两个新节点。
- **改造方案**：
  `protyle.transaction` 完美支持数组组合操作。对于“一拆二”的场景，这在事务中属于原子操作：
  - `doOperations`: 先 `update` 原始块（承载分离出的中文段落新 HTML），紧接着执行一条 `insert` 操作（插入新分离出的英文 HTML，设置 `previousID` 为上一个块）。
  - `undoOperations`: 先 `delete` 分离出的第二个英文块，然后 `update` 原始块回最开始的中英混合快照 (`oldHTML`)。
  
  这个逻辑较复杂，要求必须极度细致地维护各个 ID 的依赖关系。

### D. 大量内容注入 / AI 流式输入流：适配难度大
- **涉及命令**：
  - `action-runner-ai-*.ts` 中的打字机效果、大篇幅文章生成。
- **当前机制**：通常也是使用 `appendBlock` 或 `insertBlockBefore`。部分有流式特性。
- **改造方案**：
  针对批量处理和整块文章排版可以退化成上面 `C` 方案一样，构建出一个巨大的 `insert` DOM 树。
  但对于“逐步吐字流式输出”的 AI 功能，原生的事务录制很难细化到每一个吐字环节（会导致 Ctrl+Z 按断手）。对于这种流式插入，建议在全部流式生成**结束**时，清空掉流式期间的事务或者合并成单次最终的大 `insert` 事务；亦或者针对 AI 相关的输出直接保留现状（走 Backend API），不强制要求支持 Undo。

## 三、 结论与改造路线图建议

借鉴方案来实现文档整理插件的可撤销性不仅是可行的，而且是追求“Native UI”般丝滑体验的必经之路。建议采取渐进式重构路线：

1. **底层引擎调度分离**：
   在 `src/plugin/action-runner-dispatcher.ts` 或对应位置建立 `TransactionRunner` 的概念。在执行处理时，先检测 `siyuan.getAllEditor()` 判断当前光标/操作是否位于前端活动的编辑器中：
   - 若在活动编辑器中，优先走 **前端 DOM 快照 + Transaction API 模式**；
   - 若找不到对应编辑器（比如后台离线批量清理文档），则**回退使用现有的 Kernel HTTP 模式**。

2. **第一阶段验证：纯删除逻辑的迁移**：
   挑软柿子捏，先把诸如“清理连串空段落”此类纯删除动作重写。只要捕获 `oldHTML` 构建 `{action:"delete"}` 事务就能马上让这个动作具备 `Ctrl+Z` 能力。

3. **第二阶段引入桥接层**：
   引入 `Markdown2DOM` 转换池。对于“删除线清理”等处理单块 Markdown 的代码，在获取到新的 Markdown 后，临时调换成新 DOM 返回，再构建 `{action:"update"}`。

4. **第三阶段优化复合结构逻辑**：
   最后挑战中英文拆分、格式化排版等结构破坏型操作。
