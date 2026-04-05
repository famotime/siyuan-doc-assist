# Alpha 功能隐藏配置

更新时间：`2026-04-05`

## 目的

用于在发布版本中先保留实现、但隐藏仍处于 alpha 测试阶段的功能。

隐藏后会同时影响这些入口：

- 文档助手 Dock 的文档处理区
- 插件设置页中的“注册命令到文档菜单”列表
- 文档标题菜单
- 插件命令注册（命令面板 / 快捷键入口）
- 与该命令绑定的独立设置项

## 配置文件

编辑 [src/plugin/alpha-feature-config.ts](/D:/MyCodingProjects/siyuan-doc-assist/src/plugin/alpha-feature-config.ts)：

```ts
export const ALPHA_FEATURE_HIDE_CONFIG = {
  hiddenActionKeys: [],
  hiddenSettingKeys: [],
};
```

## 配置项

`hiddenActionKeys`

- 填写要隐藏的动作 key。
- 被隐藏的动作不会出现在 UI、设置页、标题菜单和命令注册里。

`hiddenSettingKeys`

- 填写要单独隐藏的设置项 key。
- 当前支持：
  - `"ai-service"`：隐藏设置页里的 AI 接入配置
  - `"monthly-diary-template"`：隐藏“本月日记模板”

## 联动规则

部分动作会自动带上对应设置项隐藏，不需要重复填写。

当前内置映射：

- `"create-monthly-diary"` -> `"monthly-diary-template"`

也就是说，如果在 `hiddenActionKeys` 中加入 `"create-monthly-diary"`，设置页里的“本月日记模板”也会一起隐藏。

AI 接入配置是独立隐藏项，不会因为 AI 动作隐藏而自动消失；如需隐藏，请单独在 `hiddenSettingKeys` 中加入 `"ai-service"`。

## 示例

隐藏“新建本月日记”，并单独隐藏 AI 接入配置：

```ts
export const ALPHA_FEATURE_HIDE_CONFIG = {
  hiddenActionKeys: ["create-monthly-diary"],
  hiddenSettingKeys: ["ai-service"],
};
```

效果：

- “新建本月日记”不会出现在文档处理 UI、文档标题菜单和命令注册中
- 设置页里的“本月日记模板”会自动隐藏
- 设置页里的“AI 服务”会单独隐藏

## 使用建议

- 发布版需要隐藏 alpha 功能时，直接改这个文件后重新构建。
- 开发测试结束后，把对应 key 从配置中移除即可恢复显示。
- 如后续新增“动作 <-> 设置项”联动关系，请同步更新 [src/plugin/alpha-feature-config.ts](/D:/MyCodingProjects/siyuan-doc-assist/src/plugin/alpha-feature-config.ts) 中的 `ACTION_LINKED_SETTING_KEYS`。
