# 思源文档助手（Doc Assistant）

[English](./README.md)

用于整理思源文档链接关系、导出相关文档并处理重复文档的插件。

## 插件信息

- 插件名（`plugin.json`）：`doc-assistant`
- 展示名：`文档助手 / Doc Assistant`
- 最低思源版本：`3.5.7`
- 当前版本：`0.0.1`

## 功能

1. 仅导出当前文档。
2. 当前文档若包含本地媒体资源，自动打包为 zip 导出。
3. 将当前文档的反链列表插入正文（Markdown 列表）。
4. 打包导出反链文档为 Markdown zip。
5. 打包导出正链文档为 Markdown zip。
6. 将反链文档移动为当前文档子文档（仅桌面端，标题冲突时自动重命名）。
7. 按标题相似度识别本层级重复文档并手工勾选删除（仅桌面端，默认阈值 `0.85`）。

## 使用入口

- 命令面板：已注册全部插件命令。
- 编辑器标题菜单：打开文档后点击标题图标菜单，可直接执行对应操作。

## 开发

前置依赖：

- Node.js
- pnpm

安装依赖：

```bash
pnpm install
```

配置本地环境变量：

```bash
cp .env.example .env
```

在 `.env` 中设置 `VITE_SIYUAN_WORKSPACE_PATH` 为本地思源工作空间路径。

启动监听构建：

```bash
pnpm dev
```

监听模式输出目录：

`<思源工作空间>/data/plugins/<plugin.json.name>`

## 构建

```bash
pnpm build
```

构建后会生成：

- `dist/` 插件文件
- `package.zip` 发布包

## 测试

```bash
pnpm test
```

当前测试覆盖 `tests/` 下核心逻辑：

- 链接提取与去重
- 移动冲突处理
- 标题重复识别
- 媒体导出辅助逻辑
- zip 下载路径处理

## 发布

本地发布辅助命令：

```bash
pnpm release
pnpm release:manual
pnpm release:patch
pnpm release:minor
pnpm release:major
```

`release.js` 会更新 `plugin.json` 和 `package.json` 版本号，并执行提交、打标签与推送。

GitHub Action（`.github/workflows/release.yml`）在推送 `v*` tag 后自动构建并上传 `package.zip` 到 Release。
