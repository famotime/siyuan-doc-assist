# siyuan-plugin

思源笔记插件开发仓库，当前主项目为 `siyuan-doc-assistant`（文档助手）。

## 项目结构

- `siyuan-doc-assistant/`：当前在开发的思源插件项目（Vite + Vue3 + TypeScript）
- `plugin-sample-vite-vue/`：模板工程样例（用于参考）
- `reference_docs/`：思源插件开发参考文档（按模块整理）
- `memo.md`：需求与阶段性记录

## 插件信息（siyuan-doc-assistant）

- 插件 ID：`doc-assistant`
- 展示名称：`文档助手 / Doc Assistant`
- 最低思源版本：`3.5.7`
- 当前版本：`0.0.1`
- 技术栈：`Vue 3`、`TypeScript`、`Vite`、`Vitest`

## 已实现功能

1. 仅导出当前文档（支持媒体资源打包为 zip）。
2. 将当前文档的反链文档整理为 Markdown 列表并插入正文。
3. 打包导出反链文档为 Markdown zip。
4. 打包导出正链文档为 Markdown zip。
5. 将反链文档移动为当前文档子文档（同名自动重命名，桌面端）。
6. 根据标题相似度识别重复文档并手工勾选删除（默认阈值 `0.85`，桌面端）。

## 开发与构建

在 `siyuan-doc-assistant/` 目录执行：

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
```

开发模式会把产物输出到：

`<你的思源工作空间>/data/plugins/<plugin.json 中的 name>`

请先配置环境变量文件：

- 复制 `siyuan-doc-assistant/.env.example` 为 `siyuan-doc-assistant/.env`
- 设置 `VITE_SIYUAN_WORKSPACE_PATH` 为本地思源工作空间路径

## 测试

当前有核心单测覆盖：

- `tests/link-core.test.ts`
- `tests/move-core.test.ts`
- `tests/dedupe-core.test.ts`
- `tests/exporter-current.test.ts`
- `tests/exporter-zip-download.test.ts`
- `tests/workspace-path-core.test.ts`

本地于 `2026-02-21` 尝试执行 `pnpm test` 时失败，原因为缺少 `node_modules/vitest/vitest.mjs`。如遇相同问题，先重新执行 `pnpm install`。
