# Alpha 功能隐藏配置

更新时间：`2026-05-06`

## 目的

用于在发布版本中手动隐藏仍处于 alpha 测试阶段的功能。

隐藏后会同时影响这些入口：

- 文档助手 Dock 的文档处理区
- 插件设置页中的"注册命令到文档菜单"列表
- 文档标题菜单
- 插件命令注册（命令面板 / 快捷键入口）
- 与该命令绑定的独立设置项

## 配置文件

编辑 [src/plugin/alpha-feature-config.ts](/D:/MyCodingProjects/siyuan-doc-assist/src/plugin/alpha-feature-config.ts) 中的 `ALPHA_FEATURE_HIDE_CONFIG`：

```ts
export const ALPHA_FEATURE_HIDE_CONFIG: AlphaFeatureHideConfig = {
  hiddenActionKeys: [],   // 填入要隐藏的动作 key
  hiddenSettingKeys: [],  // 填入要隐藏的设置项 key
};
```

所有功能默认可见，需隐藏时手动添加对应 key，修改后重新构建即可生效。

## 配置项

`hiddenActionKeys`

- 填写要隐藏的动作 key（见下方完整清单）。
- 被隐藏的动作不会出现在 UI、设置页、标题菜单和命令注册里。

`hiddenSettingKeys`

- 填写要单独隐藏的设置项 key。

## 可用 key 清单

### hiddenActionKeys（动作 key）

共 41 个动作，按分组列出。

**导出（export）**

| key | 名称 |
|-----|------|
| `export-current` | 仅导出当前文档 |
| `export-child-docs-zip` | 打包导出子文档 |
| `export-related-docs-zip` | 打包导出关联文档 |
| `export-backlinks-zip` | 打包导出反链文档 |
| `export-forward-zip` | 打包导出正链文档 |
| `export-child-key-info-zip` | 打包导出子文档关键内容 |
| `extract-web-links` | 提取本文档链接 |
| `export-keymap` | 导出快捷键配置 |
| `import-keymap` | 导入快捷键配置 |

**整理（organize）**

| key | 名称 |
|-----|------|
| `move-backlinks` | 移动反链文档为子文档 |
| `move-forward-links` | 移动正链文档为子文档 |
| `create-open-docs-summary` | 生成已打开文档的汇总页 |
| `create-top100-large-documents-report` | 输出Top100大文件清单 |
| `dedupe` | 识别本层级重复文档 |
| `split-doc-by-headings` | 按标题拆分文档 |

**插入（insert）**

| key | 名称 |
|-----|------|
| `insert-backlinks` | 插入反链文档列表（去重） |
| `insert-child-docs` | 插入子文档列表（去重） |
| `create-monthly-diary` | 新建本月日记 |
| `toggle-links-refs` | 链接<->引用批量互转 |
| `mark-invalid-links-refs` | 标示无效链接/引用 |
| `insert-blank-before-headings` | 标题前增加空段落 |
| `set-selection-as-title` | 选中内容作为标题 |

**AI**

| key | 名称 |
|-----|------|
| `create-doc-concept-map` | 生成概念地图 |
| `insert-doc-summary` | 插入文档摘要 |
| `mark-irrelevant-paragraphs` | 标记口水内容 |
| `mark-key-content` | 标记关键内容 |
| `recognize-doc-images` | 本文档图片文字识别 |
| `clean-ai-output` | 清理AI输出内容 |

**编辑（edit）**

| key | 名称 |
|-----|------|
| `toggle-heading-bold` | 标题块加粗状态切换 |
| `merge-selected-list-blocks` | 选中内容合并列表块 |
| `bold-selected-blocks` | 选中块全部加粗 |
| `highlight-selected-blocks` | 选中块全部高亮 |
| `toggle-linebreaks-paragraphs` | 选中内容换行-分段互转 |
| `toggle-selected-punctuation` | 选中内容中英文标点互转 |
| `remove-selected-spacing` | 选中内容删除空格 |
| `trim-trailing-whitespace` | 清理行尾空格（含Tab） |
| `clean-clipped-list-prefixes` | 清理剪藏内容 |
| `remove-extra-blank-lines` | 去除本文档空段落 |
| `delete-from-current-to-end` | 删除后续段落（含本段） |
| `delete-from-start-to-current` | 删除之前段落（含本段） |
| `remove-strikethrough-marked-content` | 清理预删除内容 |

**图片（image）**

| key | 名称 |
|-----|------|
| `convert-images-to-webp` | 批量转换为WebP |
| `convert-images-to-png` | 批量转换为PNG |
| `resize-images-to-display` | 按当前显示调整图片尺寸 |
| `remove-doc-images` | 删除本文档图片 |

### hiddenSettingKeys（设置项 key）

| key | 名称 |
|-----|------|
| `ai-service` | AI 服务接入配置（Base URL / API Key / Model） |
| `monthly-diary-template` | 本月日记模板 |

## 联动规则

部分动作隐藏时会自动带上对应设置项，无需重复填写。

当前内置映射：

- `"create-monthly-diary"` → `"monthly-diary-template"`

即：在 `hiddenActionKeys` 中加入 `"create-monthly-diary"`，设置页里的"本月日记模板"也会自动隐藏。

AI 接入配置需单独在 `hiddenSettingKeys` 中加入 `"ai-service"` 才会隐藏。

## 示例

隐藏"新建本月日记"和 AI 接入配置：

```ts
export const ALPHA_FEATURE_HIDE_CONFIG = {
  hiddenActionKeys: ["create-monthly-diary"],
  hiddenSettingKeys: ["ai-service"],
};
```

隐藏全部 AI 相关动作和 AI 接入配置：

```ts
export const ALPHA_FEATURE_HIDE_CONFIG = {
  hiddenActionKeys: [
    "create-doc-concept-map",
    "insert-doc-summary",
    "mark-irrelevant-paragraphs",
    "mark-key-content",
    "recognize-doc-images",
    "clean-ai-output",
  ],
  hiddenSettingKeys: ["ai-service"],
};
```

常见隐藏项：

```ts
export const ALPHA_FEATURE_HIDE_CONFIG: AlphaFeatureHideConfig = {
  hiddenActionKeys: [
    "create-doc-concept-map",
    "insert-doc-summary",
    "mark-irrelevant-paragraphs",
    "mark-key-content",
    "recognize-doc-images",
    "clean-ai-output",
    "create-monthly-diary",
    "set-selection-as-title",
    "toggle-heading-bold",
    "export-keymap",
    "import-keymap",
  ],
  hiddenSettingKeys: ["ai-service"],
};
```

## 使用建议

- 需要隐藏 alpha 功能时，只改 `ALPHA_FEATURE_HIDE_CONFIG` 后重新构建。
- 恢复显示时，从数组中移除对应 key 即可。
- 如后续新增"动作 ↔ 设置项"联动关系，请同步更新同文件中的 `ACTION_LINKED_SETTING_KEYS`。
