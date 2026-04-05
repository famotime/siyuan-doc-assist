# 重构计划

## 1. 项目快照

- 生成日期：2026-04-05
- 范围：`siyuan-doc-assist` 当前主仓库
- 目标：识别当前最值得继续推进的结构性重构项，在不改变现有行为的前提下，优先降低高复杂度模块的耦合和回归风险
- 文档刷新目标：`docs/project-structure.md`、`README.md`

## 2. 架构与模块分析

| 模块 | 关键文件 | 当前职责 | 主要痛点 | 测试覆盖情况 |
| --- | --- | --- | --- | --- |
| 入口与生命周期 | `src/index.ts`、`src/plugin/plugin-lifecycle.ts`、`src/plugin/plugin-lifecycle-state.ts`、`src/plugin/plugin-lifecycle-menu.ts` | 插件启动、菜单状态持久化、命令注册、Dock 装配 | 生命周期主类已明显收敛，但设置页仍通过单个 UI 工厂承接大量状态与 DOM 装配 | `tests/plugin-lifecycle-state.test.ts`、`tests/plugin-menu-registration.test.ts`、`tests/plugin-settings.test.ts` |
| 动作执行编排 | `src/plugin/action-runner.ts`、`src/plugin/action-runner-dispatcher.ts`、`src/plugin/action-runner-*.ts` | 动作入口、运行态保护、确认对话框、文档级批量改写、选区级编辑处理 | `action-runner.ts` 仍约 2030 行，保留了大量文档级清理流和选区编辑流，方法密集，后续加动作时回归面仍大 | `tests/action-runner-loading.test.ts`、`tests/action-runner-block-transform.test.ts` |
| 设置页 UI | `src/ui/plugin-settings.ts` | 构建 Setting 面板、AI 配置输入、菜单注册分组、宿主样式修正 | 单文件约 611 行，DOM 原语、业务状态同步、分组渲染和宿主适配混在一起，局部修改成本高 | `tests/plugin-settings.test.ts` |
| 导出服务 | `src/services/exporter.ts` | 当前文档导出、文档集 zip 导出、资源暂存、下载触发、关键内容导出 | 文件名清洗、暂存目录、资源收集、下载副作用在一个文件里耦合，异常路径较多 | `tests/exporter-current.test.ts`、`tests/exporter-zip-download.test.ts` |
| AI 标注服务 | `src/services/ai-slop-marker.ts` | AI 请求构造、配置校验、兼容多种 JSON 响应形态、段落筛选与高亮抽取 | 两类服务共享大量传输和解析逻辑，且包含较多 `any` 形态解析，继续扩展模型兼容性时风险偏高 | `tests/ai-slop-marker-service.test.ts` |
| 关键内容模型 | `src/services/key-info-model.ts` | 文本规范化、标签/备注解析、链接与高亮文本清洗 | 纯函数多、职责相近但未进一步分组；当前仍可维护，优先级低于上面几项 | `tests/key-info-inline.test.ts`、`tests/key-info-service-heading-inline.test.ts`、`tests/key-info-service-list-prefix.test.ts`、`tests/key-info-merge.test.ts` |

## 3. 按优先级排序的重构待办

| ID | 优先级 | 模块/场景 | 涉及文件 | 重构目标 | 行为不变式 | 风险等级 | 重构前测试清单 | 文档影响 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RF-101 | P0 | `ActionRunner` 继续瘦身，拆分文档级清理流与选区编辑流 | `src/plugin/action-runner.ts`；新增 `src/plugin/action-runner-selection-handlers.ts`、`src/plugin/action-runner-cleanup-handlers.ts`；`tests/action-runner-loading.test.ts` | 让 `action-runner.ts` 只保留执行壳、依赖装配和跨模块共用守卫；把选区类处理和文档清理类处理进一步下沉到专门模块 | 所有 `ActionKey` 的处理器映射保持不变；只读文档拦截、忙碌态切换、确认对话框时序、提示文案与现有测试覆盖行为保持一致 | 高 | - [x] `pnpm vitest run tests/action-runner-loading.test.ts tests/action-runner-block-transform.test.ts`<br>- [x] 覆盖选区样式/标点/换行互转流程<br>- [x] 覆盖文档清理流程：空段落、剪藏列表、删除线清理<br>- [x] 覆盖失败分支：风险块跳过、更新异常、无选区提示 | `docs/project-structure.md` 需补充新的 action-runner helper；`README.md` 仅在需要补充开发结构说明时更新 | done |
| RF-102 | P1 | 设置页 UI 拆分为独立面板构建器和状态同步辅助 | `src/ui/plugin-settings.ts`；新增 `src/ui/plugin-settings-shared.ts`、`src/ui/plugin-settings-ai.ts`、`src/ui/plugin-settings-menu.ts`、`src/ui/plugin-settings-host.ts`；`tests/plugin-settings.test.ts` | 把 AI 配置面板、菜单注册面板、宿主样式修正从单一工厂中拆出，降低 DOM 结构修改时的连带影响 | Setting 项顺序保持不变；开关与输入框回调的持久化行为保持不变；折叠按钮和宿主 class 修正行为保持不变 | 中 | - [x] `pnpm vitest run tests/plugin-settings.test.ts`<br>- [x] 覆盖默认值、分组渲染、状态持久化、宿主样式修正 | `docs/project-structure.md` 需新增设置页 helper 说明；`README.md` 可选补充内部结构描述 | done |
| RF-103 | P1 | 导出服务拆分下载副作用、临时目录暂存与 zip 组装逻辑 | `src/services/exporter.ts`；新增 `src/services/exporter-download.ts`、`src/services/exporter-staging.ts`；`tests/exporter-current.test.ts`、`tests/exporter-zip-download.test.ts` | 分离“生成导出内容”“落盘/暂存资源”“触发下载”三类职责，便于后续补充导出模式或替换下载策略 | 导出文件命名规则、标题前缀、资源去重、缺失文档/资源的跳过策略与返回统计保持一致 | 中 | - [x] `pnpm vitest run tests/exporter-current.test.ts tests/exporter-zip-download.test.ts`<br>- [x] 覆盖单文档导出、子文档导出、关键内容导出、缺失资源容错 | `docs/project-structure.md` 需更新 exporter 拆分后的职责映射；`README.md` 通常只需轻量同步开发结构 | done |
| RF-104 | P2 | AI 段落标注服务拆分传输层与响应解析层 | `src/services/ai-slop-marker.ts`；新增 `src/services/ai-slop-marker-parser.ts`、`src/services/ai-slop-marker-prompts.ts`；`tests/ai-slop-marker-service.test.ts` | 让请求构造、prompt 模板、响应 JSON 容错解析相互解耦，减少兼容更多模型返回格式时的修改面 | 配置校验、超时换算、接口路径拼接、兼容多种返回 shape、去重和 allowed-id 过滤行为保持不变 | 中 | - [x] `pnpm vitest run tests/ai-slop-marker-service.test.ts`<br>- [x] 覆盖代码块包裹 JSON、替代字段名、重复/缺失段落 ID 过滤<br>- [x] 覆盖分段 `message.content` 数组返回 | `docs/project-structure.md` 需补充 AI 标注 helper；`README.md` 无用户可见变化时只做最小同步 | done |

优先级说明：
- `P0`：价值和风险都最高，优先执行
- `P1`：价值或风险中等，放在 `P0` 之后
- `P2`：低风险清理项，最后执行

状态说明：
- `pending`
- `in_progress`
- `done`
- `blocked`

## 4. 执行日志

| ID | 开始日期 | 结束日期 | 验证命令 | 结果 | 已刷新文档 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| RF-101 | 2026-04-05 | 2026-04-05 | `pnpm vitest run tests/action-runner-loading.test.ts tests/action-runner-block-transform.test.ts`；`pnpm test` | pass | `docs/project-structure.md`、`README.md` | 新增选区 no-op 测试 2 条；`action-runner.ts` 收敛为执行壳，选区类与大部分清理类动作已下沉到 helper，`trim-trailing-whitespace` 与 `delete-from-current-to-end` 暂留主文件 |
| RF-102 | 2026-04-05 | 2026-04-05 | `pnpm vitest run tests/plugin-settings.test.ts`；`pnpm test` | pass | `docs/project-structure.md`、`README.md` | 新增移动端禁用项测试；`plugin-settings.ts` 收敛为装配层，AI 面板、菜单面板、宿主 class 修正和共享 DOM 原语已拆出 |
| RF-103 | 2026-04-05 | 2026-04-05 | `pnpm vitest run tests/exporter-current.test.ts tests/exporter-zip-download.test.ts`；`pnpm test` | pass | `docs/project-structure.md`、`README.md` | 新增 export-route GET 下载测试；`exporter.ts` 仍保留导出编排和命名规则，下载与资源暂存副作用已拆到 helper |
| RF-104 | 2026-04-05 | 2026-04-05 | `pnpm vitest run tests/ai-slop-marker-service.test.ts`；`pnpm test` | pass | `docs/project-structure.md`、`README.md` | 新增 segmented `message.content` 解析测试；`ai-slop-marker.ts` 收敛为配置校验和请求壳，prompt 组装与响应 JSON 容错解析分别拆到 helper |

## 5. 决策与确认

- 用户批准的条目：
  - `RF-101`
  - `RF-102`
  - `RF-103`
  - `RF-104`
- 延后的条目：无
- 阻塞条目及原因：无

## 6. 文档刷新

- `docs/project-structure.md`：已于 `2026-04-05` 刷新，补充 `action-runner` 选择/清理 helper、`plugin-settings-*`、`exporter-*`、`ai-slop-marker-*` 等拆分模块，并同步当前目录统计与测试清单
- `README.md`：已于 `2026-04-05` 刷新，补充当前开发命令与重构后的内部结构边界说明
- 最终同步检查：4 个获批条目均已完成，结构文档与 README 已和仓库现状对齐

## 7. 下一步

1. 如需继续重构，可基于新的模块边界重新评估下一轮候选项。
2. 后续若再拆分运行时模块，保持 `docs/refactor-plan.md`、`docs/project-structure.md` 和 `README.md` 同步更新。
