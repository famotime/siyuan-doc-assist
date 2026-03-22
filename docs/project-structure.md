# siyuan-doc-assist 项目结构（详细版）

更新时间：`2026-03-07`

## 1. 快照范围与统计

- 仓库根目录：`D:\MyCodingProjects\siyuan-doc-assist`
- 当前插件版本：`1.4.2`（来自 `package.json` 与 `plugin.json`）
- 统计口径：以当前工作区实际文件为准（包含未提交文档，不含 `.git` 内部对象明细）

| 目录 | 文件数 | 子目录数 | 说明 |
| --- | ---: | ---: | --- |
| `src/` | 78 | 8 | Source |
| `src/core/` | 20 | 0 | Core logic |
| `src/plugin/` | 17 | 0 | Plugin orchestration |
| `src/services/` | 27 | 0 | Kernel/IO 集成层 |
| `src/ui/` | 6 | 0 | Dock/Dialog/UI |
| `src/types/` | 4 | 0 | 类型声明 |
| `src/i18n/` | 2 | 0 | 国际化文案 |
| `tests/` | 56 | 1 | Vitest tests + mocks |
| `assets/` | 2 | 0 | README 截图资源 |
| `docs/` | 2 | 0 | 项目文档（结构快照、重构计划） |
| `reference_docs/` | 26 | 8 | SiYuan 参考资料 |
| `plugin-sample-vite-vue/` | 35 | 10 | 模板参考工程 |

## 2. 根目录结构（目录级）

| 路径 | 类型 | 说明 |
| --- | --- | --- |
| `.git/` | 目录 | Git 元数据目录 |
| `.github/` | 目录 | CI 配置，当前包含发布工作流 |
| `.vscode/` | 目录 | 工作区编辑器配置 |
| `assets/` | 目录 | README 展示图片等静态资源 |
| `dist/` | 目录 | `pnpm build` 产物目录 |
| `docs/` | 目录 | 项目内部文档（结构快照、重构计划） |
| `node_modules/` | 目录 | 依赖安装目录（构建产物） |
| `plugin-sample-vite-vue/` | 目录 | 模板工程（不参与主插件运行） |
| `reference_docs/` | 目录 | 本地化整理的 SiYuan 开发参考 |
| `src/` | 78 | 8 | Source |
| `tests/` | 目录 | 单元测试 |
| `tmp/` | 目录 | 临时文件目录（当前有临时 `.sy` 文件） |

## 3. 根目录文件说明（文件级）

| 文件 | 说明 |
| --- | --- |
| `.editorconfig` | 缩进、换行、尾空白等统一格式约定 |
| `.env` | 本地环境变量（当前存在，通常用于本机开发） |
| `.env.example` | 环境变量模板（核心是 `VITE_SIYUAN_WORKSPACE_PATH`） |
| `.gitignore` | Git 忽略规则 |
| `AGENTS.md` | 仓库协作与开发约定（给代理/协作者） |
| `CLAUDE.md` | 额外协作说明文档 |
| `eslint.config.mjs` | ESLint 配置（`@antfu/eslint-config`） |
| `icon.png` | 插件图标 |
| `LICENSE` | 开源许可证 |
| `package.json` | 项目元数据、脚本、依赖版本 |
| `package.zip` | 打包发布产物（构建后生成） |
| `plugin.json` | SiYuan 插件清单（插件名、版本、最低版本等） |
| `pnpm-lock.yaml` | 依赖锁文件 |
| `preview.png` | 插件预览图 |
| `README.md` | 项目说明文档 |
| `release.js` | 版本号升级、提交、打 tag、推送脚本 |
| `tsconfig.json` | TypeScript 主配置 |
| `tsconfig.node.json` | Node 侧 TS 配置 |
| `tsconfig.strict.json` | 严格类型检查配置（`pnpm typecheck:strict`） |
| `vite.config.ts` | Vite 构建配置（watch 与 build 产物路径、静态资源复制、zip 打包） |
| `vitest.config.ts` | Vitest 配置 |

## 4. `src/` 详细结构与文件职责

### 4.1 Layering

- `src/index.ts`: plugin entry that only loads styles and re-exports the lifecycle.
- `src/plugin/*`: runtime orchestration layer for event binding, command registration, and action dispatch. `action-runner.ts` is now the execution shell, `plugin-lifecycle.ts` coordinates lifecycle helpers, and `key-info-controller.ts` delegates dock-specific callback/state shaping to helpers.
- `src/core/*`: pure computation and transformation logic, suitable for focused unit tests.
- `src/services/*`: SiYuan Kernel/file-system integration layer.
- `src/ui/*`: Dock, dialog, and overlay behavior. `key-info-dock.ts` now focuses on state-driven rendering and scroll behavior, while `key-info-dock-controls.ts` builds the static control shell.
- `src/types/*` + `src/i18n/*`: types and text resources.

### 4.2 `src/` 根文件

| 文件 | 职责 |
| --- | --- |
| `src/index.ts` | 加载全局样式并导出插件主类（`plugin-lifecycle`） |
| `src/index.scss` | 插件全局样式 |

### 4.3 `src/core/` (20 files)

| File | Responsibility |
| --- | --- |
| `src/core/dedupe-core.ts` | Duplicate-title normalization, grouping, and keep-candidate recommendation |
| `src/core/doc-menu-registration-core.ts` | Menu registration, ordering, and favorite-state normalization/update logic |
| `src/core/dock-doc-action-order-core.ts` | Dock action ordering and reorder checks |
| `src/core/dock-panel-core.ts` | Dock tab/action models and builders |
| `src/core/export-media-core.ts` | Media path extraction, filename normalization, and export-link rewriting |
| `src/core/image-display-size-core.ts` | Markdown image display-size parsing and rewrite helpers |
| `src/core/image-webp-core.ts` | Local-image format checks and link rewrite/remove helpers |
| `src/core/key-info-core.ts` | Key-info types, extraction helpers, and Markdown rendering |
| `src/core/key-info-scroll-core.ts` | Key-info list scroll-state maintenance and post-render actions |
| `src/core/key-info-scroll-lock-core.ts` | Scroll-lock coordination between programmatic and user scrolling |
| `src/core/link-core.ts` | Link/ref conversion, invalid-link marking, block-id extraction, and link filtering |
| `src/core/logger-core.ts` | Scoped plugin logger and debug toggle |
| `src/core/markdown-cleanup-ai-core.ts` | AI-output cleanup rules and metrics aggregation |
| `src/core/markdown-cleanup-block-core.ts` | Blank-paragraph, heading-spacing, and delete-range block analysis |
| `src/core/markdown-cleanup-core.ts` | Public cleanup facade that re-exports text/AI/block cleanup APIs |
| `src/core/markdown-cleanup-text-core.ts` | Blank-line cleanup and trailing-whitespace cleanup for Markdown/DOM |
| `src/core/markdown-style-core.ts` | Selected-block bold/highlight transforms |
| `src/core/move-core.ts` | Move conflict strategy (skip/rename then move) |
| `src/core/punctuation-toggle-core.ts` | Chinese/English punctuation mode detection and conversion |
| `src/core/workspace-path-core.ts` | Workspace-path normalization and `/api/file/getFile` request building |

### 4.4 `src/plugin/` (17 files)

| File | Responsibility |
| --- | --- |
| `src/plugin/action-runner-block-transform.ts` | Block-level Markdown batch executor with risk skipping and summary reporting |
| `src/plugin/action-runner-context.ts` | Current block and selected-block ID resolution |
| `src/plugin/action-runner-dispatcher.ts` | Central ActionKey -> handler dispatch and handler map types |
| `src/plugin/action-runner-export-handlers.ts` | Export action handlers |
| `src/plugin/action-runner-insert-handlers.ts` | Insert action handlers |
| `src/plugin/action-runner-media-handlers.ts` | Image/media action handlers |
| `src/plugin/action-runner-organize-handlers.ts` | Organize/dedupe action handlers |
| `src/plugin/action-runner.ts` | Action execution shell with guards, context resolution, confirmation, and heavy edit flows |
| `src/plugin/actions.ts` | Action metadata catalog |
| `src/plugin/doc-context.ts` | Protyle-compatible types and doc-id extraction |
| `src/plugin/key-info-controller-dock.ts` | Key-info dock helper for callback bridging and doc-action state shaping |
| `src/plugin/key-info-controller.ts` | Key-info controller for dock registration, refresh flow, navigation, export, and interaction orchestration |
| `src/plugin/key-info-state.ts` | Key-info list merge strategy |
| `src/plugin/plugin-lifecycle-events.ts` | Lifecycle event bind/unbind helpers |
| `src/plugin/plugin-lifecycle-menu.ts` | Lifecycle helper for title-menu population and command registration |
| `src/plugin/plugin-lifecycle-state.ts` | Lifecycle helper for menu-state defaults, normalization, serialization, and updates |
| `src/plugin/plugin-lifecycle.ts` | Plugin main class and lifecycle composition root |

### 4.5 `src/services/`（27 个文件）

| 文件 | 职责 |
| --- | --- |
| `src/services/block-lineage.ts` | 将嵌套块映射到文档直系子块，用于删除后续段落等场景 |
| `src/services/dedupe.ts` | 重复文档候选查询、默认删除建议、批量删除 |
| `src/services/exporter.ts` | 单文档导出、文档集合 zip 导出、子文档关键内容导出 |
| `src/services/image-display-size-converter.ts` | 本地图片按显示宽高缩放并输出新资源（含跳过原因与节省字节统计） |
| `src/services/image-display-size.ts` | 当前文档图片按显示尺寸批量缩放、链接回写与统计汇总 |
| `src/services/image-png-converter.ts` | 单图片转 PNG（含跳过原因） |
| `src/services/image-png.ts` | 当前文档图片批量转 PNG 与块内容回写 |
| `src/services/image-remove.ts` | 当前文档图片链接删除与统计 |
| `src/services/image-webp-converter.ts` | 单图片转 WebP（含失败/跳过分类） |
| `src/services/image-webp.ts` | 当前文档图片批量转 WebP 与统计 |
| `src/services/kernel-adapter-core.ts` | Kernel 批量结果解析与单条 fallback 读取 |
| `src/services/kernel-block.ts` | 块读写 API：读 Kramdown/DOM、增删改块、取子块 |
| `src/services/kernel-file.ts` | 文件与文档 API：移动、重命名、删除、写文件、取文件、列目录 |
| `src/services/kernel-ref.ts` | 引用相关与树查询：正链目标、root 映射、子树文档列表等 |
| `src/services/kernel-shared.ts` | SQL 工具函数（转义、`IN` 子句） |
| `src/services/kernel.ts` | Kernel 聚合出口 + 高层 API（反链、导出、文档元信息等） |
| `src/services/key-info-collectors.ts` | 标题项、Markdown/元信息项收集 |
| `src/services/key-info-inline.ts` | spans 与 DOM 内联标记抽取 |
| `src/services/key-info-merge.ts` | 多来源内联项去重与优先级合并 |
| `src/services/key-info-model.ts` | 关键内容 SQL 行模型、文本规范化、标签/备注解析工具 |
| `src/services/key-info-order.ts` | 关键内容顺序解析（结构顺序 + sy 树顺序 + fallback） |
| `src/services/key-info-pipeline.ts` | 关键内容管道归一化、补文档标题、按锚点排序 |
| `src/services/key-info-query.ts` | 分页查询 blocks/spans、root ID 解析、kramdown map 构建 |
| `src/services/key-info.ts` | 关键内容总装配服务（汇总 query + collectors + pipeline） |
| `src/services/link-resolver.ts` | 反链/子文档/正链解析与链接列表 Markdown 生成 |
| `src/services/mover.ts` | 文档移动执行器（冲突改名、跳过规则、结果报告） |
| `src/services/request.ts` | `fetchSyncPost` 二次封装与统一错误抛出 |

### 4.6 `src/ui/` (6 files)

| File | Responsibility |
| --- | --- |
| `src/ui/action-processing-overlay.ts` | Busy overlay show/hide/destroy |
| `src/ui/dialogs.ts` | Dedupe dialog rendering and callback bridge |
| `src/ui/key-info-dock-controls.ts` | Key-info dock control shell: tabs, filters, footer, and doc-process panel DOM creation |
| `src/ui/key-info-dock-doc-actions.ts` | Dock doc-action rendering and interaction |
| `src/ui/key-info-dock-state.ts` | Dock render-flag and tab/filter state derivation |
| `src/ui/key-info-dock.ts` | Key-info dock renderer: list updates, scroll state, partial rerendering, and public handle |

### 4.7 `src/types/`（4 个文件）

| 文件 | 职责 |
| --- | --- |
| `src/types/api.d.ts` | API 类型声明 |
| `src/types/index.d.ts` | 通用类型入口声明 |
| `src/types/link-tool.ts` | 文档引用、去重候选、操作报告等业务类型 |
| `src/types/siyuan-augment.d.ts` | 对 `siyuan` 相关类型的补充声明 |

### 4.8 `src/i18n/`（2 个文件）

| 文件 | 职责 |
| --- | --- |
| `src/i18n/en_US.json` | 英文文案 |
| `src/i18n/zh_CN.json` | 中文文案 |

### 4.9 预留目录

- `src/components/`：当前为空，预留 UI 组件拆分使用。
- `src/utils/`：当前为空，预留通用工具函数使用。

## 5. `tests/` 详细结构（完整）

### 5.1 测试职责分布

- `core` 逻辑：文本转换、排序、菜单注册、移动冲突、关键内容抽取等。
- `services` 逻辑：Kernel 适配、导出、图片处理、去重、链接解析。
- `plugin/ui` 逻辑：ActionRunner、Dock 状态、Controller 行为与菜单动作。
- `tests/mocks/siyuan.ts`：SiYuan API mock。

### 5.2 全量测试文件列表（55）

```text
tests/action-runner-block-transform.test.ts
tests/action-runner-loading.test.ts
tests/actions-grouping.test.ts
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
tests/key-info-dock-list-prefix.test.ts
tests/key-info-dock-controls.test.ts
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
tests/link-resolver-child.test.ts
tests/link-resolver-forward.test.ts
tests/logger-core.test.ts
tests/markdown-cleanup-blocks.test.ts
tests/markdown-cleanup-core.test.ts
tests/markdown-style-core.test.ts
tests/mocks/siyuan.ts
tests/move-core.test.ts
tests/mover.test.ts
tests/plugin-actions.test.ts
tests/plugin-doc-context.test.ts
tests/plugin-menu-registration.test.ts
tests/punctuation-toggle-core.test.ts
tests/request.test.ts
tests/workspace-path-core.test.ts
```

## 6. 其他目录说明

### 6.1 `assets/`

| 文件 | 说明 |
| --- | --- |
| `assets/image-20260222174322-tnvviaq.png` | README 功能截图（关键内容相关） |
| `assets/image-20260222174713-dh2y23m.png` | README 功能截图（文档处理相关） |

### 6.2 `docs/`

| 文件 | 说明 |
| --- | --- |
| `docs/project-structure.md` | 本文档，记录项目结构与职责映射 |
| `docs/refactor-plan.md` | 当前重构计划与执行进度，要求在重构完成后同步 README 与结构文档 |

### 6.3 `reference_docs/`（SiYuan 参考资料）

| 子目录 | 主题 |
| --- | --- |
| `reference_docs/01-start/` | 入门与工程实践、关键概念 |
| `reference_docs/02-plugin-api/` | 插件 API、生命周期、事件总线 |
| `reference_docs/03-kernel-api/` | Kernel API 导航、调用示例、弃用迁移、官方文档镜像 |
| `reference_docs/04-database-av/` | 数据库表结构与 AV 实战 |
| `reference_docs/05-block-model/` | 块模型、块类型映射、属性规范 |
| `reference_docs/06-guides/` | 调试发布流程、SDK 边界 |
| `reference_docs/07-official-index/` | 官方 API 全量索引与路由变更风险 |
| `reference_docs/README.md` | 参考资料总览 |

### 6.4 `plugin-sample-vite-vue/`（模板参考工程）

- 用途：保留的示例项目，用于对照插件模板实现，不直接参与当前插件打包。
- 主要内容：
  - 完整模板级 `package.json`、`vite.config.ts`、`release.js`、`plugin.json`
  - `src/` 包含 `App.vue`、`main.ts`、`api.ts`、`SiyuanTheme` 组件
  - 模板 i18n 与类型声明
  - 自带 `.github/workflows/release.yml`

## 7. 构建产物与临时目录

### 7.1 `dist/`（当前构建结果）

```text
dist/index.js
dist/index.css
dist/plugin.json
dist/icon.png
dist/preview.png
dist/README.md
dist/i18n/en_US.json
dist/i18n/zh_CN.json
```

### 7.2 其他产物

- `package.zip`：发布压缩包（`pnpm build` 生成）。
- `node_modules/`：依赖安装目录。
- `tmp/`：临时文件目录（当前存在临时 `.sy` 文件，非发布内容）。

## 8. 构建、测试、发布链路（文件映射）

| 行为 | 命令/触发 | 关键文件 |
| --- | --- | --- |
| 本地 watch 构建 | `pnpm dev` | `vite.config.ts`, `.env` |
| 生产构建 | `pnpm build` | `vite.config.ts`, `plugin.json` |
| 单元测试 | `pnpm test` | `vitest.config.ts`, `tests/*` |
| 严格类型检查 | `pnpm typecheck:strict` | `tsconfig.strict.json` |
| 发布脚本 | `pnpm release:*` | `release.js`, `package.json`, `plugin.json` |
| GitHub Release | push tag `v*` | `.github/workflows/release.yml` |

## 9. 维护建议（保证“结构文档持续准确”）

1. 新增/删除源码文件时，同步更新本文第 4 章对应表格。
2. 新增测试文件时，同步更新第 5.2 节完整清单。
3. 构建产物格式变化（例如新增静态资源）时，更新第 7.1 节。
4. 新增 CI 工作流或发布步骤时，更新第 8 章映射表。
5. 完成结构性重构后，同时刷新 `docs/refactor-plan.md`、`docs/project-structure.md` 与 `README.md`。
