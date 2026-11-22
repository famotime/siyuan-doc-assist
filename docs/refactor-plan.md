# 重构计划

## 1. 项目快照

- 生成日期：2026-11-22
- 范围：`siyuan-doc-assist` 当前主仓库（v1.6.5，已纳入最新提交 `35a0db2`、`3b3a511`）
- 目标：针对上一轮（RF-401~RF-406，已于 2026-11-15 完成并归档）之后新增的灵动浮岛视图与剪贴板监控模块、再度膨胀的生命周期组合根，以及处理器层的跨文件重复逻辑进行安全拆分与收敛
- 当前基线观察：
  - `src/` 共 `187` 个 TypeScript 文件（含灵动浮岛快捷面板浮标、工具栏悬浮按钮与剪贴板监控等最新特性）
  - 基线测试：`corepack pnpm test` 全量通过（`144` 个测试文件、`1215` 个用例）；`corepack pnpm typecheck:strict` 与 `corepack pnpm lint` 通过（0 错误）
  - **工作区已有未跟踪文件**：`docs/产品竞争力分析与特性演化建议报告.md`（用户已有文件，本轮重构不触碰）
- 文档刷新目标：`docs/project-structure.md`、`README.md`、`AGENTS.md`（按精简原则核对是否需要同步）
- 计划边界：本文件只制定本轮候选项（`RF-501`~`RF-505`）；开始实施任何条目前需用户明确批准具体 ID

## 2. 架构与模块分析

| 模块 | 关键文件 | 当前职责 | 主要痛点 | 测试覆盖情况 |
| --- | --- | --- | --- | --- |
| 灵动浮岛视图 | `src/ui/dynamic-outline/dynamic-outline-view.ts`（1858 行，全仓最大） | 多模式切换与下拉、Minimap 浮标快捷切换、搜索与键盘导航、Minimap 刻度与视口指示、已打开/最近文档分组与思源原生文档浮窗防抖、剪贴板过滤/批量选择协作 | 单函数 `createDynamicOutlineView` 约 1720 行，把 4 类正交 UI 与状态机混在同一闭包内；思源 `blockPanels` 悬停/跨行穿越保活逻辑（约 180 行）与剪贴板批量状态耦合严重 | `tests/dynamic-outline-view.test.ts`（18 用例）覆盖大纲/文档基础渲染、浮窗防抖、快捷浮标与悬浮按钮，缺少剪贴板模式 Shift 连续多选/批量合并聚合删除确认交互测试 |
| 剪贴板监控服务 | `src/services/clipboard-monitor.ts`（991 行） | 跨平台剪贴板格式编解码（Windows `CF_HDROP`、Linux `text/uri-list`、macOS Plist）、Electron/Node 运行时探测与磁盘图片读写、`openFileLocation`、轮询监控与历史 CRUD | 纯编解码、运行时环境适配、服务轮询编排三层职责混于单文件；`readCurrentSystemEntry` 达 180 行，环境解析逻辑分散在多个私有方法 | `tests/clipboard-monitor.test.ts` 覆盖编解码、`copyMergedItems`/`aggregateItems` 与 `openFileLocation`，缺少轮询生命周期、`suppressedSignature` 防回环与异步 `clipboard.read()` 路径测试 |
| 生命周期组合根 | `src/plugin/plugin-lifecycle.ts`（898 行） | 插件 `onload`/`onunload` 装配、`apiSwitch` 同步、`buildPluginSettingPage` 构造、20 个 `set*` 状态变更-持久化-通知方法、剪贴板生命周期联动 | 自 RF-404（680 行）后因灵动浮岛/剪贴板/手势配置再涨 218 行；约 230 行 `snapshotDocMenuState` + `applyDocMenuState` + 20 个雷同 `set*` 样板代码与 `apiSwitch`/设置组装内联在主类 | `tests/plugin-lifecycle-state.test.ts`、`tests/plugin-lifecycle-menu.test.ts`、`tests/plugin-lifecycle-events.test.ts`、`tests/plugin-menu-registration.test.ts` 覆盖主要分支，缺少配置持久化失败、`apiSwitch` 卸载清理与剪贴板启停联动直接测试 |
| 选区与清理处理器 | `src/plugin/action-runner-selection-handlers.ts`（803 行）、`src/plugin/action-runner-cleanup-handlers.ts`（831 行） | 选区/选中块清理与样式切换、文档空段落/空代码块/合并块/AI 产物/删除线清理与 Protyle 事务封装 | 1) `selection-handlers` 仍保留本地 `isHighRiskForMarkdownWrite` 副本（与 `core/cleanup-preview-core.ts` 重复）；2) `cleanup-handlers` 中多处重复 `getBlockDOMs` + `runProtyleTransaction` + `deleteBlocksByIds` 降级删除模板；3) `selection-handlers` 的 spacing/emoji/punctuation 存在重复的「DOM 优先 -> kramdown fallback -> 汇报」调度模板 | `tests/action-runner-loading.test.ts`、`tests/action-runner-block-transform.test.ts`、`tests/selection-dom-cleanup-core.test.ts`、`tests/cleanup-preview-core.test.ts` 覆盖核心与部分集成，事务删除回退与选区清理 fallback 缺少直接单元测试 |
| Dock 文档动作面板 | `src/ui/key-info-dock-doc-actions.ts`（697 行） | 文档动作搜索过滤、收藏分组渲染与拖拽重排、常规分组折叠与组内拖拽重排 | `renderKeyInfoDockDocActions` 单函数约 515 行，嵌套深；收藏区与常规分组区的拖放指示器及 `dragstart`/`dragover`/`drop` 逻辑高度重复 | `tests/key-info-dock-controls.test.ts`、`tests/dock-doc-action-drag-core.test.ts`、`tests/dock-doc-action-order-core.test.ts` 覆盖几何与基础控件，缺少收藏拖拽与折叠状态 DOM 集成测试 |

## 3. 按优先级排序的重构待办

| ID | 优先级 | 模块/场景 | 涉及文件 | 重构目标 | 行为不变式 | 风险等级 | 重构前测试清单 | 文档影响 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RF-501 | P0 | 灵动浮岛视图拆分子面板与文档浮窗控制器 | `src/ui/dynamic-outline/dynamic-outline-view.ts`；新增 `src/ui/dynamic-outline/dynamic-outline-doc-popover.ts`（文档浮窗悬停状态机）、`src/ui/dynamic-outline/dynamic-outline-docs-panel.ts`（已打开/最近文档分组与行渲染）、`src/ui/dynamic-outline/dynamic-outline-clipboard-batch.ts`（剪贴板过滤/多选与批量栏状态协调） | 将 1858 行视图拆分为清晰子模块，`dynamic-outline-view.ts` 保留模式切换、快捷浮标、搜索/键盘导航、minimap 与飞出层控制 | `createDynamicOutlineView` 对外签名与 DOM class/属性不变；原生浮窗 350ms 延迟触发/跨行 360ms 保活/移出销毁不变；快捷浮标与工具栏悬浮按钮不变；剪贴板 Shift 连选、批量合并/聚合/删除确认流程不变 | 高 | - [x] `tests/dynamic-outline-view.test.ts` 补充剪贴板批量模式切换、Shift 范围选择、Ctrl 锚点保留、全选/合并复制/聚合/删除确认及切出模式退出批量态用例<br>- [x] 定向跑通 `dynamic-outline-view`、`dynamic-outline-controller`、`dynamic-outline-core` 测试（61 用例）<br>- [x] 全量 `corepack pnpm test`（144 文件 1216 用例）、`typecheck:strict`、`lint`（0 错误） | `docs/project-structure.md` 待刷新 `src/ui/dynamic-outline/` 新子模块；`README.md` 无需修改 | done |
| RF-502 | P0 | 剪贴板监控服务分层（编解码 core + 运行时适配 + 监控编排） | `src/services/clipboard-monitor.ts`；新增 `src/core/clipboard-codec-core.ts`（`CF_HDROP`/URI-list/Plist 纯编解码）、`src/services/clipboard-runtime.ts`（Electron/Node 运行时探测、图片读写、`openFileLocation`）；`clipboard-monitor.ts` 保留 re-export 维持兼容 | 剥离纯编解码至 `core/`、剥离平台运行时至 `clipboard-runtime.ts`，使 `clipboard-monitor.ts` 聚焦轮询、抑制防回环与历史 CRUD | 现有导出签名全兼容；剪贴板探测优先级（文件 > 图像 > 文本 > 异步 `clipboard.read()`）、`suppressedSignature` 防回环、300ms 节流保存与 `stop()` 刷盘行为不变 | 中 | - [x] 补充 `tests/clipboard-monitor.test.ts` 覆盖 `start()`/`stop()` 轮询、`suppressedSignature` 防回环、异步 `clipboard.read()` fallback 及图片 DataURL/缺失边界用例<br>- [x] 定向跑通 `clipboard-core`、`clipboard-monitor` 测试（19 用例）<br>- [x] 全量 `corepack pnpm test`（144 文件 1218 用例）、`typecheck:strict`、`lint`（0 错误） | `docs/project-structure.md` 待刷新 `clipboard-codec-core.ts` 与 `clipboard-runtime.ts`；`README.md` 无需修改 | done |
| RF-503 | P1 | 生命周期组合根瘦身（设置桥接与状态变更收口） | `src/plugin/plugin-lifecycle.ts`；新增 `src/plugin/plugin-lifecycle-settings-bridge.ts`（`apiSwitch` 同步、`buildPluginLifecycleSettingPage` 设置面板参数组装、剪贴板监控启停判定） | 收敛 20 个重复 `set*` 状态更新-持久化样板、用单一 `menuState` + 只读 getter 替代 18 个冗余字段同步、外移 `apiSwitch` 与设置桥接 | `DocLinkToolkitPlugin` 公共与测试调用签名全兼容；`onload`/`onunload` 资源注册与释放顺序不变；`syncPairedCursor` 与 `resolveDocId` 契约不变 | 中 | - [x] 新增 `tests/plugin-lifecycle.test.ts`（4 用例）锁定持久化失败 toast、`apiSwitch` 延迟注册卸载清理、`syncClipboardMonitorLifecycle` 启停条件<br>- [x] 定向跑通 `plugin-lifecycle-*`、`plugin-menu-registration`、`plugin-settings*` 测试（69 用例）<br>- [x] 全量 `corepack pnpm test`（145 文件 1222 用例）、`typecheck:strict`、`lint`（0 错误） | `docs/project-structure.md` 待刷新 `plugin-lifecycle-settings-bridge.ts` 与新测试文件；`README.md` 无需修改 | done |
| RF-504 | P1 | 选区与清理处理器去重（高风险判定复用与事务删除收口） | `src/plugin/action-runner-selection-handlers.ts`、`src/plugin/action-runner-cleanup-handlers.ts`、`src/plugin/action-runner-delete-range-handlers.ts`、`src/plugin/action-runner-block-transform.ts` | 1) 消除 `selection-handlers` 本地 `isHighRiskForMarkdownWrite` 副本，统一复用 `core/cleanup-preview-core`；2) 在 `action-runner-block-transform.ts` 抽取共享 `deleteBlocksWithTransactionFallback` 消除多处删除事务重复；3) 收敛选区 spacing/emoji/punctuation 清理与 fallback 调度骨架 | DOM 路径优先 -> kramdown fallback 顺序、事务 `(支持撤销)` 提示与失败降级、高风险块跳过规则与 toast 文案完全不变 | 中 | - [x] 在 `tests/action-runner-block-transform.test.ts` 与 `tests/action-runner-loading.test.ts` 补充 `deleteBlocksWithTransactionFallback`、空行删除及倒删事务回退单测<br>- [x] 定向跑通 `action-runner-loading`、`action-runner-block-transform`、`selection-dom-cleanup-core`、`cleanup-preview-core` 测试（161 用例）<br>- [x] 全量 `corepack pnpm test`（145 文件 1226 用例）、`typecheck:strict`、`lint`（0 错误） | `docs/project-structure.md` 按实际改动更新职责说明；`README.md` 无需修改 | done |
| RF-505 | P2 | Dock 文档动作渲染与拖拽事件去重 | `src/ui/key-info-dock-doc-actions.ts` | 将 515 行的 `renderKeyInfoDockDocActions` 拆分为搜索栏、行构造与通用可排序拖拽绑定 helper（消除收藏区与常规分组区的重复 drag/drop 代码） | `WeakMap` 折叠态/拖拽态保持、收藏重排与同组重排规则、选中保留与按钮禁用态样式完全不变 | 低 | - [x] 在 `tests/key-info-dock-controls.test.ts` 补充收藏区拖拽重排与分组折叠后重渲染保持状态用例<br>- [x] 定向跑通 `key-info-dock-controls`、`key-info-dock-state`、`dock-doc-action-*` 测试（32 用例）<br>- [x] 全量 `corepack pnpm test`（145 文件 1227 用例）、`typecheck:strict`、`lint`（0 错误） | 无需改 `docs/project-structure.md`；`README.md` 无需修改 | done |

优先级说明：
- `P0`：体量大、耦合高且直接支撑当前核心交互与桌面端服务（灵动浮岛视图、剪贴板监控），优先补强测试并拆分
- `P1`：中等风险，收敛组合根与处理器跨文件重复逻辑，放在 `P0` 稳定后执行
- `P2`：低风险 UI 结构整理，最后执行

状态说明：
- `pending`：尚未开始
- `in_progress`：已获批并正在执行
- `done`：已完成代码、测试与文档同步
- `blocked`：因测试基线、需求不清或外部依赖阻塞

## 4. 执行日志

| ID | 开始日期 | 结束日期 | 验证命令 | 结果 | 已刷新文档 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| RF-501 | 2026-11-22 | 2026-11-22 | `corepack pnpm vitest run tests/dynamic-outline-view.test.ts tests/dynamic-outline-controller.test.ts tests/dynamic-outline-core.test.ts`；`corepack pnpm lint`；`corepack pnpm typecheck:strict`；`corepack pnpm test` | pass | 待末尾统一刷新 `docs/project-structure.md` | 拆出 `dynamic-outline-doc-popover.ts`、`dynamic-outline-docs-panel.ts`、`dynamic-outline-clipboard-batch.ts`；主视图 1858→1192 行，消除了 `dynamic-outline-view.ts` 全数 `ts/no-use-before-define` 警告；`tests/dynamic-outline-view.test.ts` 新增剪贴板多选与批量操作用例（19 用例） |
| RF-502 | 2026-11-22 | 2026-11-22 | `corepack pnpm vitest run tests/clipboard-monitor.test.ts tests/clipboard-core.test.ts`；`corepack pnpm lint`；`corepack pnpm typecheck:strict`；`corepack pnpm test` | pass | 待末尾统一刷新 `docs/project-structure.md` | 拆出 `core/clipboard-codec-core.ts` 与 `services/clipboard-runtime.ts`，`clipboard-monitor.ts` 991→534 行（保留原导出 re-export）；新增轮询、防回环与 `clipboard.read()` fallback 测试（19 用例） |
| RF-503 | 2026-11-22 | 2026-11-22 | `corepack pnpm vitest run tests/plugin-lifecycle.test.ts tests/plugin-lifecycle-state.test.ts tests/plugin-lifecycle-menu.test.ts tests/plugin-lifecycle-events.test.ts tests/plugin-menu-registration.test.ts tests/plugin-settings.test.ts`；`corepack pnpm lint`；`corepack pnpm typecheck:strict`；`corepack pnpm test` | pass | 待末尾统一刷新 `docs/project-structure.md` | 拆出 `plugin-lifecycle-settings-bridge.ts`；`plugin-lifecycle.ts` 919→833 行（含 `menuState` 收口、只读 getter 兼容与 `updateMenuState` 统一持久器）；新增 `tests/plugin-lifecycle.test.ts`（4 用例） |
| RF-504 | 2026-11-22 | 2026-11-22 | `corepack pnpm vitest run tests/action-runner-loading.test.ts tests/action-runner-block-transform.test.ts tests/selection-dom-cleanup-core.test.ts tests/cleanup-preview-core.test.ts`；`corepack pnpm lint`；`corepack pnpm typecheck:strict`；`corepack pnpm test` | pass | 待末尾统一刷新 `docs/project-structure.md` | 消除 `selection-handlers` 的 `isHighRiskForMarkdownWrite` 副本（复用 `cleanup-preview-core`）并收敛 DOM/kramdown 选区清理骨架；`action-runner-block-transform.ts` 抽取 `deleteBlocksWithTransactionFallback` 消除了 `cleanup-handlers` 与 `delete-range-handlers` 3 处重复删除事务模板 |
| RF-505 | 2026-11-22 | 2026-11-22 | `corepack pnpm vitest run tests/key-info-dock-controls.test.ts tests/key-info-dock-state.test.ts tests/dock-doc-action-drag-core.test.ts tests/dock-doc-action-order-core.test.ts`；`corepack pnpm lint`；`corepack pnpm typecheck:strict`；`corepack pnpm test` | pass | 已刷新全部文档 | 抽取 `clearContainerDropIndicators`、`setActionButtonRunning`、`buildFavoriteButton`、`buildActionButton`、`bindSortableRowDragEvents`、`buildActionSearchBox`；`key-info-dock-doc-actions.ts` 697→669 行；新增收藏/分组拖拽重排与折叠状态保持测试（32 用例） |

## 5. 决策与确认

- 用户批准的条目：`RF-501`、`RF-502`、`RF-503`、`RF-504`、`RF-505`（全部，2026-11-22）
- 延后的条目：
- 阻塞条目及原因：

## 6. 文档刷新

- `docs/project-structure.md`：已于 2026-11-22 全面刷新至最新工作区（`src/` 208 文件、`tests/` 146 文件含 1 mock），补全 `src/ui/dynamic-outline/`、`src/core/clipboard-codec-core.ts`、`src/services/clipboard-runtime.ts`、`src/plugin/plugin-lifecycle-settings-bridge.ts` 等新模块及全量测试清单
- `README.md`：补充「场景七：灵动浮岛与高效导航」介绍已上线的灵动浮岛、快捷切换浮标、桌面端剪贴板历史监控与鼠标手势能力
- `AGENTS.md`：在 Architecture Notes 中精简补充灵动浮岛与剪贴板监控入口路径
- 最终同步检查：已完成；`corepack pnpm test`（145 文件 1227 用例）、`corepack pnpm typecheck:strict`、`corepack pnpm lint`（0 错误）均已通过

## 7. 下一步

1. 本轮已获批条目 `RF-501` 至 `RF-505` 已全部完成，执行日志见第 4 节
2. 工作区原有未跟踪文件 `docs/产品竞争力分析与特性演化建议报告.md` 已原样保留未改动
3. 等待用户审阅结果并确认是否需要创建本地 commit
