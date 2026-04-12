# 对外开放插件命令配置说明

本文说明当前 `siyuan-doc-assist` 插件命令的定义、注册和“对外开放”方式。

## 结论

- 所有动作的统一定义都在 `src/plugin/actions.ts`。
- SiYuan 插件命令面板中的命令，在插件加载时通过 `registerPluginCommands()` 全量注册。
- 真正“对外开放”给其他插件或外部调用方使用的命令，不是自动继承全部动作，而是由 `src/plugin/power-buttons-provider.ts` 里的白名单 `PUBLIC_ACTION_KEYS` 单独控制。
- 因此，当前对外开放命令的配置入口只有一个核心位置：
  `src/plugin/power-buttons-provider.ts` 中的 `PUBLIC_ACTION_KEYS`。

## 1. 动作定义源

插件把“命令”抽象成 `ActionConfig`，集中定义在 `src/plugin/actions.ts`：

- `key`: 命令唯一标识，也是内部调度 ID
- `commandText`: 命令面板和公开命令标题文本
- `menuText`: 文档标题菜单文本
- `tooltip`: 对外描述文本
- `group`: 命令分组
- `desktopOnly`: 是否仅桌面端可用
- `requiresWritableDoc`: 是否要求当前文档可写
- `runInBackground`: 是否后台执行
- `icon` / `dockIconText`: UI 展示字段

也就是说，命令的“元数据”先统一定义，再被不同入口复用。

## 2. SiYuan 内部命令如何注册

插件加载时，`src/plugin/plugin-lifecycle.ts` 在 `onload()` 中调用：

- `registerPluginCommands({ actions: this.getOrderedActions(), ... })`

真正的注册逻辑在 `src/plugin/plugin-lifecycle-menu.ts`：

- 遍历 `actions`
- 对每个动作调用 `this.addCommand(...)`
- `langKey` 形如 `docLinkToolkit.${action.key}`
- `langText` 使用 `action.commandText`
- `callback` / `editorCallback` 最终都会调用 `runAction(action.key, ...)`

这意味着：

- SiYuan 命令面板里的命令，默认来自 `getOrderedActions()`
- 它们会受到 `actionOrder` 和 `ALPHA_FEATURE_HIDE_CONFIG.hiddenActionKeys` 的影响
- 但不会受“文档标题菜单是否启用”开关影响

## 3. 文档标题菜单不是“对外开放命令”

文档标题菜单同样复用 `ACTIONS`，但它是另一套入口：

- 菜单填充逻辑在 `populateEditorTitleMenu()`
- 是否显示由 `docMenuRegistrationState` 决定
- 默认值是全部 `false`
- 存储键为 `doc-menu-registration`

所以文档标题菜单更像“插件内部 UI 暴露”，不是对外协议的一部分。

## 4. 当前真正对外开放的命令

对外协议由 `src/plugin/power-buttons-provider.ts` 提供，协议对象通过
`plugin.getPowerButtonsIntegration()` 暴露出去。

Provider 的关键字段：

- `protocol: "power-buttons-command-provider"`
- `protocolVersion: 1`
- `providerId: "siyuan-doc-assist"`

当前动作全集共 37 个，其中：

- 已对外开放：13 个
- 当前未对外开放：24 个

### 已对外开放

当前公开命令白名单如下：

| ActionKey | 显示标题 |
| --- | --- |
| `export-current` | 仅导出当前文档 |
| `export-child-docs-zip` | 打包导出子文档 |
| `export-child-key-info-zip` | 打包导出子文档关键内容 |
| `insert-backlinks` | 插入反链文档列表（去重） |
| `insert-child-docs` | 插入子文档列表（去重） |
| `create-open-docs-summary` | 生成已打开文档的汇总页 |
| `clean-ai-output` | 清理AI输出内容 |
| `trim-trailing-whitespace` | 清理行尾空格（含Tab） |
| `remove-extra-blank-lines` | 去除本文档空段落 |
| `toggle-links-refs` | 链接<->引用批量互转 |
| `insert-doc-summary` | 插入文档摘要 |
| `delete-from-current-to-end` | 删除后续段落（含本段） |
| `convert-images-to-webp` | 批量转换为WebP |

这份列表直接来自：

```ts
const PUBLIC_ACTION_KEYS = new Set<ActionKey>([
  "export-current",
  "export-child-docs-zip",
  "export-child-key-info-zip",
  "insert-backlinks",
  "insert-child-docs",
  "create-open-docs-summary",
  "clean-ai-output",
  "trim-trailing-whitespace",
  "remove-extra-blank-lines",
  "toggle-links-refs",
  "insert-doc-summary",
  "delete-from-current-to-end",
  "convert-images-to-webp",
]);
```

### 当前未对外开放

下表命令已经在 `src/plugin/actions.ts` 中定义，也会参与插件内部命令/UI 体系，但当前**不在** `PUBLIC_ACTION_KEYS` 白名单中，因此不会通过 `power-buttons-command-provider` 暴露给外部调用方：

| ActionKey | 显示标题 |
| --- | --- |
| `export-related-docs-zip` | 打包导出关联文档 |
| `export-backlinks-zip` | 打包导出反链文档 |
| `export-forward-zip` | 打包导出正链文档 |
| `move-backlinks` | 移动反链文档为子文档 |
| `move-forward-links` | 移动正链文档为子文档 |
| `dedupe` | 识别本层级重复文档 |
| `create-monthly-diary` | 新建本月日记 |
| `mark-invalid-links-refs` | 标示无效链接/引用 |
| `insert-blank-before-headings` | 标题前增加空段落 |
| `create-doc-concept-map` | 生成概念地图 |
| `mark-irrelevant-paragraphs` | 标记口水内容 |
| `mark-key-content` | 标记关键内容 |
| `toggle-heading-bold` | 标题块加粗状态切换 |
| `merge-selected-list-blocks` | 选中内容合并列表块 |
| `bold-selected-blocks` | 选中块全部加粗 |
| `highlight-selected-blocks` | 选中块全部高亮 |
| `toggle-linebreaks-paragraphs` | 选中内容换行-分段互转 |
| `toggle-selected-punctuation` | 选中内容中英文标点互转 |
| `remove-selected-spacing` | 选中内容删除空格 |
| `clean-clipped-list-prefixes` | 清理剪藏内容 |
| `remove-strikethrough-marked-content` | 清理预删除内容 |
| `convert-images-to-png` | 批量转换为PNG |
| `resize-images-to-display` | 按当前显示调整图片尺寸 |
| `remove-doc-images` | 删除本文档图片 |

可以把这张表理解为“插件已有能力全集减去当前对外协议白名单”的结果。

## 5. 对外命令的过滤规则

`listCommands()` 返回的并不是全部 `ACTIONS`，而是：

1. 先从 `ACTIONS` 取全部动作
2. 经过 `filterVisibleActions(ACTIONS)`
3. 再过滤为 `PUBLIC_ACTION_KEYS` 白名单中的动作

所以当前对外命令是否可见，受两层控制：

- 第一层：`PUBLIC_ACTION_KEYS`
- 第二层：`ALPHA_FEATURE_HIDE_CONFIG.hiddenActionKeys`

注意以下几点：

- 不受 `docMenuRegistrationState` 影响
- 不受用户在设置页里是否启用标题菜单影响
- 目前也不走用户自定义排序；公开命令顺序基本按 `ACTIONS` 中的原始顺序输出

## 6. 对外命令如何执行

外部调用方通过 provider 的 `invokeCommand(commandId)` 执行命令。

执行流程：

1. 通过 `commandId` 在公开命令集合里查找对应动作
2. 找不到则返回 `command-not-found`
3. 找到后调用 `runAction(action.key)`
4. 进入统一执行器 `ActionRunner.runAction()`

因此，对外命令与插件内部命令共用同一套执行约束：

- 找不到当前文档时返回 `context-unavailable`
- `desktopOnly` 命令在移动端会返回 `not-supported`
- `requiresWritableDoc` 命令会先检查文档是否只读
- `runInBackground` 命令会走后台执行逻辑

也就是说，“是否对外开放”只决定能不能被外部发现和调用，不改变命令本身的执行规则。

## 7. 如果要新增或下线对外公开命令，改哪里

### 新增一个对外公开命令

1. 先在 `src/plugin/actions.ts` 中定义动作
2. 在 `ActionRunner` 对应 handler 中实现执行逻辑
3. 把该 `action.key` 加入 `src/plugin/power-buttons-provider.ts` 的 `PUBLIC_ACTION_KEYS`
4. 如有需要，补充或更新测试：
   - `tests/power-buttons-provider.test.ts`
   - `tests/plugin-menu-registration.test.ts`

### 下线一个对外公开命令

1. 从 `PUBLIC_ACTION_KEYS` 中删除对应 `action.key`
2. 如果只是临时隐藏，也可以通过 `ALPHA_FEATURE_HIDE_CONFIG.hiddenActionKeys` 屏蔽

二者区别：

- 从 `PUBLIC_ACTION_KEYS` 删除：该命令不再属于对外协议
- 放进 `hiddenActionKeys`：该命令仍在白名单定义里，但当前构建不会暴露出来

## 8. 当前代码中的职责划分

- `src/plugin/actions.ts`
  统一维护动作元数据
- `src/plugin/plugin-lifecycle-menu.ts`
  负责 SiYuan 命令面板和编辑器标题菜单注册
- `src/plugin/plugin-lifecycle.ts`
  在插件生命周期中完成命令注册和 provider 暴露
- `src/plugin/power-buttons-provider.ts`
  负责对外协议、公开命令白名单和外部调用入口
- `src/plugin/action-runner.ts`
  负责命令实际执行与运行时约束

## 9. 一句话总结

当前“对外开放的插件命令”不是通过设置页动态配置的，而是通过
`src/plugin/power-buttons-provider.ts` 中的 `PUBLIC_ACTION_KEYS` 静态白名单配置；所有公开命令底层仍复用 `src/plugin/actions.ts` 的统一动作定义和 `ActionRunner` 的统一执行链路。
