# Refactor Plan

## 1. Project Snapshot

- Generated on: 2026-02-25
- Scope: `siyuan-doc-assist` plugin project
- Goal: 在不改变现有功能行为的前提下，降低核心模块复杂度、消除重复边界、提升后续迭代可维护性
- Baseline test:
  - Command: `pnpm test` (run in repository root)
  - Result: pass (`34` files, `153` tests)

## 2. Architecture and Module Analysis

| Module | Key Files | Current Responsibility | Main Pain Points | Test Coverage Status |
| --- | --- | --- | --- | --- |
| Plugin lifecycle and command wiring | `src/plugin/plugin-lifecycle.ts`, `src/plugin/actions.ts`, `src/plugin/doc-context.ts` | 插件生命周期、命令注册、文档菜单接入、Dock 控制器接线 | 生命周期类承担状态持久化与事件注册等多职责，后续扩展成本偏高 | 有覆盖（`plugin-menu-registration`, `plugin-actions`, `plugin-doc-context`） |
| Action orchestration | `src/plugin/action-runner.ts` | 统一分发 13 个文档处理动作、确认交互、DOM 选区解析、错误展示 | 单文件约 864 行，动作逻辑、UI 交互、重试策略、消息提示高度耦合 | 有覆盖（`action-runner-loading`）但仍偏集中于部分场景 |
| Kernel/data access layer | `src/services/kernel.ts`, `src/services/request.ts`, `src/services/block-lineage.ts` | API 请求、SQL 查询、文件读写、文档树与块映射 | `kernel.ts` 约 876 行，跨多域职责；`resolveDocDirectChildBlockId` 在 `kernel.ts` 与 `block-lineage.ts` 重复实现 | 有覆盖（多项 `kernel-*`）；`block-lineage.ts` 缺独立测试 |
| Key info extraction pipeline | `src/services/key-info.ts`, `src/services/key-info-query.ts`, `src/services/key-info-inline.ts`, `src/services/key-info-merge.ts`, `src/core/key-info-core.ts` | 关键内容提取、排序、列表前缀解析、DOM/Span/Markdown 合并 | 核心流程链路长，排序策略与提取策略耦合，后续扩展新规则成本高 | 覆盖较好（`key-info-*` 多项） |
| Dock UI rendering | `src/ui/key-info-dock.ts`, `src/plugin/key-info-controller.ts` | Dock 结构渲染、过滤、滚动锁、文档处理动作 UI | `key-info-dock.ts` 约 887 行，DOM 构建、拖拽排序、滚动状态混在一处 | 有覆盖（`key-info-dock-*`, `key-info-controller-*`） |
| Document processing domains | `src/services/link-resolver.ts`, `src/services/exporter.ts`, `src/services/mover.ts`, `src/services/dedupe.ts`, `src/core/*-core.ts` | 链接处理、导出、移动、去重、文本清理/样式变换 | 业务逻辑整体稳定，但调试日志分散、部分工具模块缺单测 | 大部分有覆盖；`export-media-core.ts`, `mover.ts` 等缺直接单测 |

## 3. Prioritized Refactor Backlog

| ID | Priority | Module/Scenario | Files in Scope | Refactor Objective | Risk Level | Pre-Refactor Test Checklist | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RF-001 | P0 | ActionRunner 解耦与职责拆分 | `src/plugin/action-runner.ts` | 拆分为“动作分发器 + 具体 handler + 选区/确认辅助组件”，减少单文件复杂度并提升回归定位效率 | High | - [ ] 增加 `insert-backlinks`/`insert-child-docs` 行为测试；- [ ] 增加 `move-backlinks` 确认/取消/失败测试；- [ ] 增加 `dedupe` 对话框回调联动测试；- [ ] 保持现有 `action-runner-loading` 通过 | pending |
| RF-002 | P0 | Kernel 边界重整与重复实现清理 | `src/services/kernel.ts`, `src/services/block-lineage.ts`, 相关 import 调用点 | 按职责切分 kernel（query/file/block/ref）并移除重复的 `resolveDocDirectChildBlockId` 实现，统一单一来源 | High | - [ ] 补充 `block-lineage` 独立单测；- [ ] 跑通全部 `kernel-*` 测试；- [ ] 验证 `delete-from-current-to-end` 相关测试仍通过 | pending |
| RF-003 | P1 | 关键信息提取管线可维护性重构 | `src/services/key-info.ts`, `src/services/key-info-query.ts`, `src/services/key-info-model.ts`, `src/services/key-info-merge.ts`, `src/services/key-info-inline.ts` | 将“排序决策/列表上下文/来源合并”拆成可组合纯函数，收敛流程复杂度 | Medium-High | - [ ] 增加 sy/structural/fallback 排序选择测试；- [ ] 增加 list-item 映射边界测试；- [ ] 保持 `key-info-service-*`、`key-info-merge`、`key-info-core` 通过 | pending |
| RF-004 | P1 | Dock 视图层模块化 | `src/ui/key-info-dock.ts` | 拆分“过滤列表渲染/动作列表拖拽/滚动状态管理”子模块，降低 UI 文件体积与认知负担 | Medium | - [ ] 保持 `key-info-dock-scroll-interaction` 全通过；- [ ] 保持 `key-info-dock-list-prefix` 通过；- [ ] 新增 action 分组拖拽边界测试（跨组拒绝/组内重排） | pending |
| RF-005 | P1 | 生命周期状态管理收敛 | `src/plugin/plugin-lifecycle.ts`, `src/core/doc-menu-registration-core.ts`, `src/plugin/key-info-controller.ts` | 提取 doc-menu 状态持久化与生命周期事件注册为独立协作对象，降低主类耦合 | Medium | - [ ] 保持 `plugin-menu-registration` 通过；- [ ] 增加 `onload/onunload` 事件解绑验证；- [ ] 保持 `key-info-controller-*` 通过 | pending |
| RF-006 | P2 | 调试日志治理 | `src/plugin/action-runner.ts`, `src/services/link-resolver.ts`, `src/services/kernel.ts`, `src/core/markdown-cleanup-core.ts` | 引入统一 logger（可控 debug 开关），避免生产环境噪声日志分散 | Low | - [ ] 新增 logger 行为测试（debug 开关）；- [ ] 核验现有行为测试无回归 | pending |
| RF-007 | P2 | 补齐工具层薄弱测试 | `src/core/export-media-core.ts`, `src/services/mover.ts`, `src/services/request.ts`, `src/services/block-lineage.ts` | 为关键工具与中间层补充低成本高收益单测，提升后续重构安全垫 | Low | - [ ] 新增 `export-media-core.test.ts`；- [ ] 新增 `mover.test.ts`；- [ ] 新增 `request.test.ts`；- [ ] 新增 `block-lineage.test.ts` | pending |

Priority definition:
- `P0`: 高价值且高风险/高频路径，优先处理
- `P1`: 中风险中价值，跟随 P0 推进
- `P2`: 低风险治理项，收尾阶段处理

Status definition:
- `pending`
- `in_progress`
- `done`
- `blocked`

## 4. Execution Log

| ID | Start Date | End Date | Test Commands | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| BASELINE | 2026-02-25 | 2026-02-25 | `pnpm test` | pass | `34` files, `153` tests |
| RF-001 |  |  | `pnpm test -- action-runner` / `pnpm test` |  |  |
| RF-002 |  |  | `pnpm test -- kernel` / `pnpm test -- action-runner-loading` / `pnpm test` |  |  |
| RF-003 |  |  | `pnpm test -- key-info` / `pnpm test` |  |  |
| RF-004 |  |  | `pnpm test -- key-info-dock` / `pnpm test` |  |  |
| RF-005 |  |  | `pnpm test -- plugin-menu-registration` / `pnpm test` |  |  |
| RF-006 |  |  | `pnpm test` |  |  |
| RF-007 |  |  | `pnpm test` |  |  |

## 5. Decision and Confirmation

- User approved items:
- Deferred items:
- Blocked items and reasons:

## 6. Next Actions

1. 用户确认本计划中要先执行的条目（建议先从 `RF-001` 与 `RF-002` 开始）。
2. 对首个批准条目先补测试，再进入重构实现。
3. 每完成一项立即回写本文件状态与测试结果。
