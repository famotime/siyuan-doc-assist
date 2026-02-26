# Refactor Plan

## 1. Project Snapshot

- Refreshed on: 2026-02-26
- Scope: `siyuan-doc-assist` plugin project
- Current version: `1.2.0`
- Refactor goal: 在不改变现有功能行为的前提下，降低核心模块复杂度、消除重复边界、提升后续迭代可维护性
- Latest progress summary:
  - 已发布 `v1.2.0`，并更新插件图标与元信息
  - 仓库已完成结构整理（移除 `plugin-sample-vite-vue/`、`reference_docs/`、`memo.md`）
  - 新增“清理行尾空格”动作与对应测试，并修复 `white-space:pre` 相关边界
  - 文档处理动作支持拖拽排序，并修复跨组拖拽边界问题
  - 完成 `RF-001`：`ActionRunner` 已拆分为分发器与上下文辅助模块，补齐 insert/move/dedupe 行为测试
  - 推进 `RF-002`：移除 `kernel.ts` 内重复 `resolveDocDirectChildBlockId`，新增 `block-lineage` 独立单测
  - 推进 `RF-002` Phase 2：提取 `kernel-shared.ts`（SQL 公共能力）与 `kernel-ref.ts`（引用/根文档查询），`kernel.ts` 保持兼容 facade
  - 完成 `RF-002`：新增 `kernel-file.ts`、`kernel-block.ts`，`kernel.ts` 从 `913` 行降至 `382` 行并保持兼容导出
  - 完成 `RF-003`：新增 `key-info-collectors.ts`，`getDocKeyInfo` 主流程改为编排 `order/collectors/inline merge` 模块，并补齐 `key-info-collectors.test.ts`
  - 完成 `RF-004`：抽离 Dock 文档动作拖拽排序为 `key-info-dock-doc-actions.ts` + `dock-doc-action-order-core.ts`，`key-info-dock.ts` 从 `973` 行降至 `664` 行
  - 完成 `RF-005`：提取 `plugin-lifecycle-events.ts` 统一事件绑定/解绑，并补齐 `onload/onunload` 监听解绑测试
- Baseline test:
  - Command: `corepack pnpm test`
  - Result: pass (`37` files, `171` tests)

## 2. Architecture and Module Analysis

| Module | Key Files | Current Responsibility | Main Pain Points | Test Coverage Status |
| --- | --- | --- | --- | --- |
| Plugin lifecycle and command wiring | `src/plugin/plugin-lifecycle.ts`, `src/plugin/plugin-lifecycle-events.ts`, `src/plugin/actions.ts`, `src/plugin/doc-context.ts` | 插件生命周期、命令注册、文档菜单接入、Dock 控制器接线 | 生命周期接线仍集中在主类，但事件绑定/解绑已抽离协作模块 | 覆盖完善（`plugin-menu-registration` 已含 `onload/onunload` 解绑验证） |
| Action orchestration | `src/plugin/action-runner.ts`, `src/plugin/action-runner-dispatcher.ts`, `src/plugin/action-runner-context.ts` | 统一分发文档处理动作、确认交互、DOM 选区解析、错误展示 | 主流程已拆出分发与上下文辅助，但 action handlers 仍集中在 `ActionRunner` 主类 | 覆盖增强（`action-runner-loading` 已覆盖 insert/move/dedupe 关键链路） |
| Kernel/data access layer | `src/services/kernel.ts`, `src/services/kernel-shared.ts`, `src/services/kernel-ref.ts`, `src/services/kernel-file.ts`, `src/services/kernel-block.ts`, `src/services/request.ts`, `src/services/block-lineage.ts` | API 请求、SQL 查询、文件读写、文档树与块映射 | 已完成 query/ref/file/block 分层，仍需观察 facade 兼容期后的调用收敛 | `kernel-*` 覆盖良好；`block-lineage.test.ts` 已补齐 |
| Key info extraction pipeline | `src/services/key-info.ts`, `src/services/key-info-order.ts`, `src/services/key-info-collectors.ts`, `src/services/key-info-query.ts`, `src/services/key-info-inline.ts`, `src/services/key-info-merge.ts`, `src/core/key-info-core.ts` | 关键内容提取、排序策略、列表前缀解析、多来源合并 | 主流程仍是编排入口，但排序/提取/合并职责已模块化，后续规则扩展成本下降 | 覆盖较好，新增 `key-info-collectors.test.ts`，sy/structural/fallback 与 list-prefix 边界持续稳定 |
| Dock UI rendering | `src/ui/key-info-dock.ts`, `src/ui/key-info-dock-doc-actions.ts`, `src/core/dock-doc-action-order-core.ts`, `src/plugin/key-info-controller.ts` | Dock 渲染、过滤、滚动锁、动作列表拖拽与操作 | 拖拽排序已下沉到子模块，主 Dock 文件显著缩减，剩余优化以渲染复用为主 | 覆盖较好（`key-info-dock-*`, `key-info-controller-*` + `dock-doc-action-order-core`），含跨组拖拽拒绝场景 |
| Document processing domains | `src/services/link-resolver.ts`, `src/services/exporter.ts`, `src/services/mover.ts`, `src/services/dedupe.ts`, `src/core/*-core.ts` | 链接处理、导出、移动、去重、文本清理/样式变换 | 业务逻辑整体稳定，但调试日志分散、工具层薄弱测试仍存在缺口 | 大部分有覆盖；`mover.ts`、`request.ts`、`block-lineage.ts` 仍缺直接单测 |

## 3. Prioritized Refactor Backlog

| ID | Priority | Module/Scenario | Files in Scope | Refactor Objective | Risk | Pre-Refactor Test Checklist | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RF-001 | P0 | ActionRunner 解耦与职责拆分 | `src/plugin/action-runner.ts`, `src/plugin/action-runner-dispatcher.ts`, `src/plugin/action-runner-context.ts` | 拆分为“动作分发器 + handler + 交互辅助组件”，降低单文件复杂度 | High | - [x] 增加 `insert-backlinks`/`insert-child-docs` 行为测试<br>- [x] 增加 `move-backlinks` 确认/取消/失败测试<br>- [x] 增加 `dedupe` 对话框回调联动测试<br>- [x] 保持 `action-runner-loading` 通过 | done |
| RF-002 | P0 | Kernel 边界重整与重复实现清理 | `src/services/kernel.ts`, `src/services/kernel-shared.ts`, `src/services/kernel-ref.ts`, `src/services/kernel-file.ts`, `src/services/kernel-block.ts`, `src/services/block-lineage.ts`, 相关调用点 | 按职责切分 kernel 并移除重复 `resolveDocDirectChildBlockId`，统一单一来源 | High | - [x] 补充 `block-lineage` 独立单测<br>- [x] 移除重复 `resolveDocDirectChildBlockId` 实现<br>- [x] 抽取 `kernel-ref.ts`（`mapRoot/getRootMd/getForwardRefs/listSubtree`）<br>- [x] 抽取 `kernel-file.ts` 与 `kernel-block.ts`<br>- [x] 跑通全部 `kernel-*` 测试<br>- [x] 验证 `delete-from-current-to-end` 相关测试通过 | done |
| RF-003 | P1 | 关键信息提取管线可维护性重构 | `src/services/key-info.ts`, `src/services/key-info-order.ts`, `src/services/key-info-collectors.ts`, `src/services/key-info-query.ts`, `src/services/key-info-model.ts`, `src/services/key-info-merge.ts`, `src/services/key-info-inline.ts` | 将“排序决策/列表上下文/来源合并”拆成可组合纯函数 | Medium-High | - [x] sy/structural/fallback 排序选择测试已覆盖<br>- [x] list-item 映射边界测试已覆盖<br>- [x] 抽取 `key-info-order.ts`（排序与 list-context 纯函数）<br>- [x] 抽取 `key-info-collectors.ts`（heading/markdown/meta 收集）<br>- [x] `getDocKeyInfo` 主流程改为编排式调用<br>- [x] `key-info-service-*`、`key-info-merge`、`key-info-core`、`key-info-collectors` 保持通过 | done |
| RF-004 | P1 | Dock 视图层模块化 | `src/ui/key-info-dock.ts`, `src/ui/key-info-dock-doc-actions.ts`, `src/core/dock-doc-action-order-core.ts` | 拆分“过滤渲染/拖拽排序/滚动状态管理”子模块，降低认知负担 | Medium | - [x] `key-info-dock-scroll-interaction` 全通过<br>- [x] `key-info-dock-list-prefix` 通过<br>- [x] 跨组拒绝/组内重排测试已覆盖<br>- [x] 抽取 `key-info-dock-doc-actions.ts`<br>- [x] 新增 `dock-doc-action-order-core.test.ts` | done |
| RF-005 | P1 | 生命周期状态管理收敛 | `src/plugin/plugin-lifecycle.ts`, `src/plugin/plugin-lifecycle-events.ts`, `src/core/doc-menu-registration-core.ts`, `src/plugin/key-info-controller.ts` | 提取 doc-menu 状态持久化与生命周期事件注册为独立协作对象 | Medium | - [x] `plugin-menu-registration` 通过<br>- [x] 增加 `onload/onunload` 事件解绑验证<br>- [x] 抽取 `plugin-lifecycle-events.ts`（事件绑定协作）<br>- [x] `key-info-controller-*` 通过 | done |
| RF-006 | P2 | 调试日志治理 | `src/plugin/action-runner.ts`, `src/services/link-resolver.ts`, `src/services/kernel.ts`, `src/core/markdown-cleanup-core.ts` | 引入统一 logger（可控 debug 开关），降低生产环境日志噪声 | Low | - [ ] 新增 logger 行为测试（debug 开关）<br>- [x] 现有行为测试无回归（全量测试通过） | pending |
| RF-007 | P2 | 补齐工具层薄弱测试 | `src/core/export-media-core.ts`, `src/services/mover.ts`, `src/services/request.ts`, `src/services/block-lineage.ts` | 为关键工具与中间层补充低成本高收益单测 | Low | - [ ] 新增 `export-media-core.test.ts`<br>- [ ] 新增 `mover.test.ts`<br>- [ ] 新增 `request.test.ts`<br>- [x] 新增 `block-lineage.test.ts` | pending |

Priority definition:
- `P0`: 高价值且高风险/高频路径，优先处理
- `P1`: 中风险中价值，跟随 P0 推进
- `P2`: 低风险治理项，收尾阶段处理

Status definition:
- `pending`: 尚未开始
- `in_progress`: 前置测试或拆分工作已开始
- `done`: 条目完成并验证通过
- `blocked`: 被外部依赖或条件阻塞

## 4. Execution Log

| ID | Start Date | End Date | Test Commands | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| BASELINE-REFRESH | 2026-02-25 | 2026-02-25 | `corepack pnpm install` + `corepack pnpm test` | pass | `34` files, `153` tests |
| RF-001-PRECHECK | 2026-02-25 | 2026-02-25 | `corepack pnpm test` | partial | 仅确认现有用例稳定，动作主链路测试缺口仍在 |
| RF-002-PRECHECK | 2026-02-25 | 2026-02-25 | `corepack pnpm test` | partial | `kernel-*` 与 `delete-from-current-to-end` 相关路径稳定；`block-lineage` 仍缺独立测试 |
| RF-003-PRECHECK | 2026-02-25 | 2026-02-25 | `corepack pnpm test` | ready | sy/structural/fallback 与 list-prefix 相关测试已覆盖 |
| RF-004-PRECHECK | 2026-02-25 | 2026-02-25 | `corepack pnpm test` | ready | 组内重排与跨组拒绝均已有测试 |
| RF-005-PRECHECK | 2026-02-25 | 2026-02-25 | `corepack pnpm test` | partial | 缺 `onload/onunload` 解绑测试 |
| RF-001-IMPLEMENT | 2026-02-25 | 2026-02-25 | `corepack pnpm exec vitest run tests/action-runner-loading.test.ts` + `corepack pnpm test` | pass | `action-runner` 拆分为 dispatch/context 辅助模块，新增 6 个动作链路测试 |
| RF-002-PHASE1 | 2026-02-25 | 2026-02-25 | `corepack pnpm exec vitest run tests/block-lineage.test.ts` + `corepack pnpm test` | pass | 删除 `kernel.ts` 重复实现；新增 `block-lineage.test.ts`（5 tests） |
| RF-002-PHASE2 | 2026-02-25 | 2026-02-25 | `corepack pnpm exec tsc -p tsconfig.strict.json --noEmit` + `corepack pnpm test` | pass | 新增 `kernel-shared.ts` 与 `kernel-ref.ts`，`kernel.ts` 以 facade 形式兼容原导出 |
| RF-002-PHASE3 | 2026-02-25 | 2026-02-25 | `corepack pnpm exec tsc -p tsconfig.strict.json --noEmit` + `corepack pnpm test` | pass | 新增 `kernel-file.ts` 与 `kernel-block.ts`；`kernel.ts` 缩减到 `382` 行并保持导出兼容 |
| RF-003-PHASE1 | 2026-02-25 | 2026-02-25 | `corepack pnpm exec vitest run tests/key-info-core.test.ts tests/key-info-service-heading-inline.test.ts tests/key-info-service-list-prefix.test.ts tests/key-info-merge.test.ts` + `corepack pnpm test` | pass | 新增 `key-info-order.ts`，将排序决策与列表上下文解析从 `key-info.ts` 抽离 |
| RF-003-PHASE2 | 2026-02-26 | 2026-02-26 | `corepack pnpm exec tsc -p tsconfig.strict.json --noEmit` + `corepack pnpm exec vitest run tests/key-info-core.test.ts tests/key-info-service-heading-inline.test.ts tests/key-info-service-list-prefix.test.ts tests/key-info-merge.test.ts tests/key-info-collectors.test.ts` | pass | 新增 `key-info-collectors.ts` 并修复编排回归，`key-info` 管线拆分完成 |
| RF-004-IMPLEMENT | 2026-02-26 | 2026-02-26 | `corepack pnpm exec vitest run tests/dock-doc-action-order-core.test.ts tests/key-info-dock-scroll-interaction.test.ts` + `corepack pnpm test` | pass | 抽离 `key-info-dock-doc-actions.ts` 与 `dock-doc-action-order-core.ts`，保持拖拽排序与跨组拒绝行为 |
| RF-005-IMPLEMENT | 2026-02-26 | 2026-02-26 | `corepack pnpm exec vitest run tests/plugin-menu-registration.test.ts` + `corepack pnpm test` | pass | 抽离 `plugin-lifecycle-events.ts`，补齐 `onload/onunload` 监听解绑测试 |

## 5. Decision and Confirmation

- User approved items:
- Deferred items:
- Blocked items and reasons:

## 6. Next Actions

1. 进入 `RF-006`：设计并落地统一 logger（含 debug 开关）并补最小行为测试。
2. 进入 `RF-007`：优先补齐 `request.ts` 与 `mover.ts` 单测，再补 `export-media-core.test.ts`。
3. 在下一轮重构完成后刷新本文件基线测试统计与执行日志。
