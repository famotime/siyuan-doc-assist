# siyuan-plugin

思源笔记插件开发仓库，主项目为 `siyuan-doc-assistant`（文档助手）。

## 仓库结构

- `siyuan-doc-assistant/`：主插件工程（Vite + Vue 3 + TypeScript）
- `plugin-sample-vite-vue/`：官方模板参考工程
- `reference_docs/`：思源插件开发参考文档
- `memo.md`：需求与阶段性记录

## 主插件信息

- 插件 ID：`doc-assistant`
- 展示名称：`文档助手 / Doc Assistant`
- 最低思源版本：`3.5.7`
- 当前版本：`1.0.0`

## 功能总览

插件侧栏提供两个板块：

### 1. 关键内容

- 自动提取文档中的标题、加粗、斜体、高亮、备注、标签
- 支持类型多选筛选、手动刷新和滚动状态保持
- 点击条目可在当前文档中平滑定位到对应块，失败时自动回退协议跳转
- 支持将当前筛选结果导出为 Markdown

### 2. 文档处理

- 导出：仅导出当前文档、打包导出反链文档、打包导出正链文档，含媒体资源时自动打包 zip
- 整理：移动反链为子文档、识别重复文档并批量处理（支持打开全部文档/插入全部链接）
- 编辑：插入反链/子文档列表、去除空段落、标题前补空段落、删除从当前段到文末、选中块批量加粗/高亮

## 使用入口

- 命令面板：可执行全部插件命令
- 编辑器标题菜单：可直接执行文档处理动作
- 右侧 Dock 面板：提供“关键内容 / 文档处理”双标签页

说明：

- 支持在 Dock 面板中按动作开启或关闭“注册到文档标题菜单”
- 部分动作为桌面端限定，移动端会自动置灰并给出提示

## 开发

在 `siyuan-doc-assistant/` 目录执行：

```bash
pnpm install
cp .env.example .env
```

编辑 `.env`，设置：

- `VITE_SIYUAN_WORKSPACE_PATH`：本地思源工作空间路径（含 `data/` 目录）
- `VITE_DEV_DIST_DIR`：可选，手动指定开发产物目录（符号链接场景）

启动监听构建：

```bash
pnpm dev
```

监听模式输出目录：

`<思源工作空间>/data/plugins/<plugin.json.name>`

## 常用命令

```bash
pnpm dev
pnpm build
pnpm test
pnpm test:watch
pnpm typecheck:strict
```

- `pnpm dev`：监听构建，输出到 `<workspace>/data/plugins/<plugin.json.name>`
- `pnpm build`：生成 `dist/` 与 `package.zip`
- `pnpm test`：运行 Vitest 单测

当前测试主要覆盖：

- 关键信息提取、排序、滚动锁定与点击交互
- 正链/反链解析与导出路径
- 文本清理与块级编辑动作
- 文档菜单注册状态持久化
- 子块/kramdown 兼容与回退逻辑

## 发布

在 `siyuan-doc-assistant/` 目录执行发布命令：

```bash
pnpm release
pnpm release:manual
pnpm release:patch
pnpm release:minor
pnpm release:major
```

`release.js` 会同步更新 `plugin.json` 与 `package.json` 版本号，并执行打 tag 与推送。
