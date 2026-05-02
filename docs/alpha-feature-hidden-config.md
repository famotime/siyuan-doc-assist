# Alpha 功能隐藏配置

更新时间：`2026-05-02`

## 目的

用于在发布版本中手动隐藏仍处于 alpha 测试阶段的功能。

隐藏后会同时影响这些入口：

- 文档助手 Dock 的文档处理区
- 插件设置页中的”注册命令到文档菜单”列表
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

- 填写要隐藏的动作 key（见 `actions.ts` 中各 action 的 `key` 字段）。
- 被隐藏的动作不会出现在 UI、设置页、标题菜单和命令注册里。

`hiddenSettingKeys`

- 填写要单独隐藏的设置项 key。

## 可用 key 清单

### hiddenActionKeys（动作 key）

| key | 名称 |
|-----|------|
| `create-doc-concept-map` | 生成概念地图 |
| `insert-doc-summary` | 插入文档摘要 |
| `mark-irrelevant-paragraphs` | 标记口水内容 |
| `mark-key-content` | 标记关键内容 |
| `clean-ai-output` | 清理AI输出内容 |
| `create-monthly-diary` | 新建本月日记 |

### hiddenSettingKeys（设置项 key）

| key | 名称 |
|-----|------|
| `ai-service` | AI 服务接入配置（Base URL / API Key / Model） |
| `monthly-diary-template` | 本月日记模板 |

## 联动规则

部分动作隐藏时会自动带上对应设置项，无需重复填写。

当前内置映射：

- `”create-monthly-diary”` → `”monthly-diary-template”`

即：在 `hiddenActionKeys` 中加入 `”create-monthly-diary”`，设置页里的”本月日记模板”也会自动隐藏。

AI 接入配置需单独在 `hiddenSettingKeys` 中加入 `”ai-service”` 才会隐藏。

## 示例

隐藏”新建本月日记”和 AI 接入配置：

```ts
export const ALPHA_FEATURE_HIDE_CONFIG = {
  hiddenActionKeys: [“create-monthly-diary”],
  hiddenSettingKeys: [“ai-service”],
};
```

## 使用建议

- 需要隐藏 alpha 功能时，只改 `ALPHA_FEATURE_HIDE_CONFIG` 后重新构建。
- 恢复显示时，从数组中移除对应 key 即可。
- 如后续新增”动作 ↔ 设置项”联动关系，请同步更新同文件中的 `ACTION_LINKED_SETTING_KEYS`。
