# siyuan-doc-assist 项目结构（详细版）

更新时间：`2026-04-05`

## 1. 快照范围与统计

- 仓库根目录：`D:\MyCodingProjects\siyuan-doc-assist`
- 当前插件版本：`1.4.5`（来自 `package.json` 与 `plugin.json`）
- 统计口径：以当前工作区实际文件为准（不含 `.git` 内部对象）

| 目录 | 文件数 | 说明 |
| --- | ---: | --- |
| `src/` | 104 | 插件源码 |
| `src/core/` | 26 | 纯逻辑与转换规则 |
| `src/plugin/` | 20 | 生命周期、动作编排、控制器 |
| `src/services/` | 38 | Kernel / 文件系统 / AI / 导出服务 |
| `src/ui/` | 12 | Dock、Dialog、Setting 面板 UI |
| `src/types/` | 4 | 类型声明 |
| `src/i18n/` | 2 | 国际化文案 |
| `tests/` | 71 | Vitest 用例与 mocks |
| `assets/` | 2 | README 截图资源 |
| `docs/` | 3 | 结构文档、重构计划、变更记录 |
| `developer_docs/` | 26 | 本地 SiYuan 开发参考 |
| `reference_docs/` | 26 | 归档参考资料 |
| `plugin-sample-vite-vue/` | 35 | 模板参考工程 |

## 2. 根目录结构

| 路径 | 类型 | 说明 |
| --- | --- | --- |
| `.github/` | 目录 | CI 与发布工作流 |
| `.vscode/` | 目录 | 工作区编辑器配置 |
| `assets/` | 目录 | README 使用的截图资源 |
| `developer_docs/` | 目录 | 本地开发参考与 API 资料 |
| `dist/` | 目录 | `pnpm build` 产物 |
| `docs/` | 目录 | 内部结构文档、重构计划、changelog |
| `plugin-sample-vite-vue/` | 目录 | 模板参考工程，不参与主插件运行 |
| `reference_docs/` | 目录 | 额外归档的 SiYuan 参考资料 |
| `skills/` | 目录 | 本地协作技能脚本与说明 |
| `src/` | 目录 | 主插件源码 |
| `tests/` | 目录 | Vitest 测试与 mocks |
| `tmp/` | 目录 | 临时文件目录 |

## 3. 根目录关键文件

| 文件 | 说明 |
| --- | --- |
| `.env.example` | 本地环境变量模板，包含 `VITE_SIYUAN_WORKSPACE_PATH` |
| `AGENTS.md` | 仓库协作与开发约定 |
| `eslint.config.mjs` | ESLint 基线配置 |
| `package.json` | 脚本、依赖、版本信息 |
| `plugin.json` | SiYuan 插件清单 |
| `README.md` | 用户说明与开发入口 |
| `release.js` | 版本升级、提交与 tag 发布脚本 |
| `tsconfig.strict.json` | 严格类型检查配置 |
| `vite.config.ts` | 构建、静态资源复制、zip 打包配置 |
| `vitest.config.ts` | Vitest 配置 |

## 4. `src/` 分层与职责

### 4.1 分层总览

- `src/index.ts`：只负责加载样式并导出插件生命周期入口。
- `src/core/`：纯逻辑与 Markdown/数据转换，优先放单元测试。
- `src/plugin/`：生命周期、动作分发、控制器与运行时守卫。
- `src/services/`：SiYuan Kernel、文件系统、AI 请求、导出等集成层。
- `src/ui/`：Dock、Dialog、Setting 面板的 DOM 组装与宿主修正。
- `src/types/` / `src/i18n/`：类型声明与文案资源。

### 4.2 `src/` 根文件

| 文件 | 职责 |
| --- | --- |
| `src/index.ts` | 加载全局样式并导出 `plugin-lifecycle` |
| `src/index.scss` | 插件全局样式 |

### 4.3 `src/core/`（26 个文件）

| 文件 | 职责 |
| --- | --- |
| `src/core/ai-service-config-core.ts` | AI 服务配置默认值、规范化与完整性判定 |
| `src/core/ai-summary-core.ts` | AI 摘要文本清理、内部链接识别与插入位置 |
| `src/core/dedupe-core.ts` | 重复标题归一化、分组与保留建议 |
| `src/core/doc-menu-registration-core.ts` | 文档菜单注册状态、排序与标准化 |
| `src/core/dock-doc-action-order-core.ts` | Dock 文档动作排序与拖拽检查 |
| `src/core/dock-panel-core.ts` | Dock 标签页与动作面板模型构建 |
| `src/core/export-media-core.ts` | 导出时媒体路径提取、文件名规范化、链接改写 |
| `src/core/heading-bold-toggle-core.ts` | 标题加粗切换预览与更新计划 |
| `src/core/image-display-size-core.ts` | 图片显示尺寸解析与 Markdown 改写 |
| `src/core/image-webp-core.ts` | 图片格式检查与 WebP 链接改写 |
| `src/core/key-info-core.ts` | 关键内容类型、提取辅助与 Markdown 渲染 |
| `src/core/key-info-scroll-core.ts` | 关键内容滚动状态与渲染后动作 |
| `src/core/key-info-scroll-lock-core.ts` | 编程滚动与用户滚动锁协调 |
| `src/core/link-core.ts` | 链接/引用互转、失效标记、块 ID 提取 |
| `src/core/list-block-merge-core.ts` | 多个段落/列表块合并为单列表块的预览与拼装 |
| `src/core/logger-core.ts` | 作用域日志封装 |
| `src/core/markdown-cleanup-ai-core.ts` | AI 输出清理规则与清理指标 |
| `src/core/markdown-cleanup-block-core.ts` | 空段落、标题前空行、删除范围分析 |
| `src/core/markdown-cleanup-core.ts` | Markdown 清理公共出口 |
| `src/core/markdown-cleanup-text-core.ts` | 文本空行、行尾空格清理 |
| `src/core/markdown-style-core.ts` | 选中块加粗/高亮转换 |
| `src/core/monthly-diary-core.ts` | 本月日记默认模板、日期变量渲染与月度内容拼装 |
| `src/core/move-core.ts` | 文档移动冲突策略 |
| `src/core/pinned-tab-placement-core.ts` | 新打开页签在钉住页签后的放置策略 |
| `src/core/punctuation-toggle-core.ts` | 中英文标点检测与互转 |
| `src/core/workspace-path-core.ts` | 工作区路径标准化与 `/api/file/getFile` 请求构造 |

### 4.4 `src/plugin/`（20 个文件）

| 文件 | 职责 |
| --- | --- |
| `src/plugin/action-runner-ai-handlers.ts` | AI 摘要与 AI 标注类动作处理器 |
| `src/plugin/action-runner-block-transform.ts` | 文档级 Markdown 批量改写执行器，负责高风险跳过与结果汇总 |
| `src/plugin/action-runner-cleanup-handlers.ts` | 文档清理类动作处理器，如空段落、标题空行、链接清理、AI 输出清理 |
| `src/plugin/action-runner-context.ts` | 当前文档、当前块、选中块上下文解析 |
| `src/plugin/action-runner-dispatcher.ts` | `ActionKey -> handler` 分发表与类型定义 |
| `src/plugin/action-runner-export-handlers.ts` | 导出动作处理器 |
| `src/plugin/action-runner-insert-handlers.ts` | 插入反链/子文档列表、本月日记创建等动作处理器 |
| `src/plugin/action-runner-media-handlers.ts` | 图片转换、移除等媒体动作处理器 |
| `src/plugin/action-runner-organize-handlers.ts` | 去重、移动、打开汇总页等整理类动作处理器 |
| `src/plugin/action-runner-selection-handlers.ts` | 选区/选中块动作处理器，如加粗、高亮、空格清理、标点互转、列表块合并 |
| `src/plugin/action-runner.ts` | 动作执行壳，负责运行态守卫、只读校验、确认对话框、忙碌态与剩余少量主流程 |
| `src/plugin/actions.ts` | 动作元数据、分组与说明 |
| `src/plugin/doc-context.ts` | Protyle 兼容类型与文档 ID 提取 |
| `src/plugin/key-info-controller-dock.ts` | Key-info Dock 回调桥接与文档动作状态投影 |
| `src/plugin/key-info-controller.ts` | Key-info 控制器，负责 Dock 注册、刷新、导航、导出与交互编排 |
| `src/plugin/key-info-state.ts` | 关键内容列表合并策略 |
| `src/plugin/plugin-lifecycle-events.ts` | 生命周期事件绑定与解绑辅助 |
| `src/plugin/plugin-lifecycle-menu.ts` | 标题菜单注册、命令注册与菜单刷新 |
| `src/plugin/plugin-lifecycle-state.ts` | 插件设置状态默认值、标准化、序列化与持久化，含 AI 与月记模板配置 |
| `src/plugin/plugin-lifecycle.ts` | 插件主类与组合根 |

### 4.5 `src/services/`（38 个文件）

| 文件 | 职责 |
| --- | --- |
| `src/services/ai-slop-marker-parser.ts` | AI 段落筛选/高亮响应解析，兼容多种 JSON shape 与代码块包裹 |
| `src/services/ai-slop-marker-prompts.ts` | AI 段落筛选与关键内容高亮的 prompt 构造、段落入参标准化 |
| `src/services/ai-slop-marker.ts` | AI 标注服务外观，负责配置校验、请求发送与调用 parser/prompt helper |
| `src/services/ai-summary.ts` | AI 文档摘要请求封装与响应提取 |
| `src/services/block-lineage.ts` | 将嵌套块映射到直系子块，供删除后续段落等流程使用 |
| `src/services/dedupe.ts` | 重复文档候选查询、默认删除建议与批量删除 |
| `src/services/exporter-download.ts` | 文本下载、工作区文件下载、导出路由 GET 下载与文件名解析 |
| `src/services/exporter-staging.ts` | 导出资源暂存、缺失资源容错与临时目录落盘 |
| `src/services/exporter.ts` | 导出编排服务，负责单文档导出、文档集 zip 导出、关键内容导出 |
| `src/services/image-display-size-converter.ts` | 单图片按显示尺寸缩放并输出新资源 |
| `src/services/image-display-size.ts` | 当前文档图片按显示尺寸批量缩放与统计 |
| `src/services/image-png-converter.ts` | 单图片转 PNG |
| `src/services/image-png.ts` | 当前文档图片批量转 PNG 与回写 |
| `src/services/image-remove.ts` | 当前文档图片链接删除 |
| `src/services/image-webp-converter.ts` | 单图片转 WebP |
| `src/services/image-webp.ts` | 当前文档图片批量转 WebP 与回写 |
| `src/services/kernel-adapter-core.ts` | Kernel 批量结果解析与单条 fallback 读取 |
| `src/services/kernel-attr.ts` | 块属性读取与写入的轻量封装 |
| `src/services/kernel-block.ts` | 块读写 API：读取 Kramdown/DOM、增删改块、子块查询 |
| `src/services/kernel-file.ts` | 文件与文档 API：移动、重命名、删除、写文件、取文件、列目录 |
| `src/services/kernel-network.ts` | 网络代理 API：`forwardProxy` 封装 |
| `src/services/kernel-ref.ts` | 引用、root 映射、子树文档列表等查询 |
| `src/services/kernel-shared.ts` | SQL 工具函数 |
| `src/services/kernel.ts` | Kernel 聚合出口与高层 API |
| `src/services/key-info-collectors.ts` | 标题项、Markdown 项、元信息项收集 |
| `src/services/key-info-inline.ts` | DOM/spans 内联标记抽取 |
| `src/services/key-info-merge.ts` | 多来源内联项去重与优先级合并 |
| `src/services/key-info-model.ts` | 关键内容 SQL 行模型、文本规范化、标签/备注解析 |
| `src/services/key-info-order.ts` | 关键内容顺序解析 |
| `src/services/key-info-pipeline.ts` | 关键内容归一化、补标题与按锚点排序 |
| `src/services/key-info-query.ts` | blocks/spans 查询、root ID 解析、kramdown map 构建 |
| `src/services/key-info.ts` | 关键内容总装配服务 |
| `src/services/link-resolver.ts` | 反链/正链/子文档解析与 Markdown 列表生成 |
| `src/services/mover.ts` | 文档移动执行器 |
| `src/services/monthly-diary.ts` | 基于当前笔记本 Daily Note 路径创建本月月记文档 |
| `src/services/network-lens-ai-index.ts` | 已打开文档汇总页的索引与内容整理服务 |
| `src/services/open-doc-summary.ts` | 已打开文档汇总页生成与写入 |
| `src/services/request.ts` | `fetchSyncPost` 二次封装与统一错误抛出 |

### 4.6 `src/ui/`（12 个文件）

| 文件 | 职责 |
| --- | --- |
| `src/ui/action-processing-overlay.ts` | 动作执行中的忙碌遮罩 |
| `src/ui/dialogs.ts` | 去重对话框渲染与事件桥接 |
| `src/ui/key-info-dock-controls.ts` | Key-info Dock 的静态控制壳：标签、筛选、页脚、文档处理入口 |
| `src/ui/key-info-dock-doc-actions.ts` | Dock 文档动作区域渲染与交互 |
| `src/ui/key-info-dock-state.ts` | Dock 渲染标志与筛选状态投影 |
| `src/ui/key-info-dock.ts` | Key-info Dock 列表渲染、局部刷新与滚动管理 |
| `src/ui/plugin-settings-ai.ts` | AI 设置面板 DOM 组装与状态同步 |
| `src/ui/plugin-settings-diary.ts` | 本月日记模板设置面板 |
| `src/ui/plugin-settings-host.ts` | SiYuan `Setting` 宿主节点修正与面板归一化 |
| `src/ui/plugin-settings-menu.ts` | 文档标题菜单注册分组面板与开关联动 |
| `src/ui/plugin-settings-shared.ts` | Setting 面板通用 DOM 原语：checkbox、input、textarea、collapse button、field row |
| `src/ui/plugin-settings.ts` | 插件设置页装配层，串联钉住页签、AI 面板、月记模板面板、菜单注册面板 |

### 4.7 `src/types/` 与 `src/i18n/`

| 文件 | 职责 |
| --- | --- |
| `src/types/api.d.ts` | API 类型声明 |
| `src/types/index.d.ts` | 通用类型入口声明 |
| `src/types/link-tool.ts` | 文档引用、去重候选、操作报告等业务类型 |
| `src/types/siyuan-augment.d.ts` | `siyuan` 相关类型补充声明 |
| `src/i18n/en_US.json` | 英文文案 |
| `src/i18n/zh_CN.json` | 中文文案 |

## 5. `tests/` 结构与清单

### 5.1 覆盖重点

- `core`：纯逻辑、Markdown 转换、菜单注册、排序、移动冲突等。
- `services`：Kernel 适配、导出、图片处理、AI 服务、链接解析。
- `plugin/ui`：ActionRunner、设置页、菜单注册、Dock 状态与控制器。
- `tests/mocks/siyuan.ts`：SiYuan API mock。

### 5.2 全量测试文件列表（71）

```text
tests/action-runner-block-transform.test.ts
tests/action-runner-loading.test.ts
tests/actions-grouping.test.ts
tests/ai-service-config-core.test.ts
tests/ai-slop-marker-service.test.ts
tests/ai-summary-service.test.ts
tests/block-lineage.test.ts
tests/dedupe-core.test.ts
tests/dedupe-dialog.test.ts
tests/dedupe-service.test.ts
tests/doc-menu-registration-core.test.ts
tests/dock-doc-action-order-core.test.ts
tests/dock-panel-core.test.ts
tests/export-media-core.test.ts
tests/exporter-current.test.ts
tests/exporter-zip-download.test.ts
tests/image-display-size-service.test.ts
tests/image-png-service.test.ts
tests/image-remove-service.test.ts
tests/image-webp-core.test.ts
tests/image-webp-service.test.ts
tests/kernel-adapter-core.test.ts
tests/kernel-child-blocks.test.ts
tests/kernel-child-docs.test.ts
tests/kernel-kramdown-compat.test.ts
tests/kernel-list-docs-subtree.test.ts
tests/kernel-map-root.test.ts
tests/kernel-sy-order.test.ts
tests/key-info-collectors.test.ts
tests/key-info-controller-doc-action.test.ts
tests/key-info-controller-state.test.ts
tests/key-info-core.test.ts
tests/key-info-dock-controls.test.ts
tests/key-info-dock-list-prefix.test.ts
tests/key-info-dock-scroll-interaction.test.ts
tests/key-info-dock-state.test.ts
tests/key-info-inline.test.ts
tests/key-info-merge.test.ts
tests/key-info-pipeline.test.ts
tests/key-info-scroll-core.test.ts
tests/key-info-scroll-lock-core.test.ts
tests/key-info-service-heading-inline.test.ts
tests/key-info-service-list-prefix.test.ts
tests/link-core.test.ts
tests/link-resolver-backlink.test.ts
tests/link-resolver-child.test.ts
tests/link-resolver-forward.test.ts
tests/list-block-merge-core.test.ts
tests/logger-core.test.ts
tests/markdown-cleanup-bilingual.test.ts
tests/markdown-cleanup-blocks.test.ts
tests/markdown-cleanup-clipped-list.test.ts
tests/markdown-cleanup-core.test.ts
tests/markdown-style-core.test.ts
tests/monthly-diary-core.test.ts
tests/monthly-diary-service.test.ts
tests/mocks/siyuan.ts
tests/move-core.test.ts
tests/mover.test.ts
tests/network-lens-ai-index.test.ts
tests/open-doc-summary.test.ts
tests/pinned-tab-placement-core.test.ts
tests/plugin-actions.test.ts
tests/plugin-doc-context.test.ts
tests/plugin-lifecycle-state.test.ts
tests/plugin-menu-registration.test.ts
tests/plugin-settings.test.ts
tests/plugin-tab-placement.test.ts
tests/punctuation-toggle-core.test.ts
tests/request.test.ts
tests/workspace-path-core.test.ts
```

## 6. 其他目录说明

### 6.1 `assets/`

| 文件 | 说明 |
| --- | --- |
| `assets/image-20260222174322-tnvviaq.png` | README 功能截图（关键内容） |
| `assets/image-20260222174713-dh2y23m.png` | README 功能截图（文档处理） |

### 6.2 `docs/`

| 文件 | 说明 |
| --- | --- |
| `docs/changelog.md` | 项目变更记录 |
| `docs/project-structure.md` | 本文档，记录当前仓库结构与职责映射 |
| `docs/refactor-plan.md` | 当前重构计划与执行进度 |

### 6.3 参考目录

- `developer_docs/`：当前主要使用的本地 SiYuan 开发参考。
- `reference_docs/`：归档参考资料，包含官方索引、Kernel API、块模型等。
- `plugin-sample-vite-vue/`：模板参考工程，不参与当前插件构建。

## 7. 构建、测试与发布链路

| 行为 | 命令/触发 | 关键文件 |
| --- | --- | --- |
| 本地 watch 构建 | `pnpm dev` | `vite.config.ts`, `.env` |
| 生产构建 | `pnpm build` | `vite.config.ts`, `plugin.json` |
| 单元测试 | `pnpm test` | `vitest.config.ts`, `tests/*` |
| 严格类型检查 | `pnpm typecheck:strict` | `tsconfig.strict.json` |
| 发布脚本 | `pnpm release:*` | `release.js`, `package.json`, `plugin.json` |
| GitHub Release | push tag `v*` | `.github/workflows/release.yml` |

## 8. 维护约定

1. 新增或删除源码文件时，同步更新第 4 章的职责表。
2. 新增或删除测试文件时，同步更新第 5.2 节清单。
3. 结构性重构完成后，同时刷新 `docs/refactor-plan.md`、`docs/project-structure.md` 与 `README.md`。
