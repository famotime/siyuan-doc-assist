# 重构计划

## 1. 项目快照

- 生成日期：2026-11-15
- 范围：`siyuan-doc-assist` 当前主仓库
- 目标：在 v1.6.5 基线上，收敛当前体量最大、重复度最高的四个模块（剪藏/链接核心、选区 DOM 清理、悬浮窗模板、生命周期组合根），并为高风险路径先补测试再拆分
- 当前基线观察：
  - `package.json` 版本 `1.6.5`；`src/` 约 157 个 TypeScript 文件，`tests/` 116 个 Vitest 文件
  - 基线测试：`corepack pnpm test` 全量通过（116 文件、941 用例）
  - **工作区存在未提交改动**：鼠标手势/文档导航功能（新增 `src/core/gesture-recognition-core.ts`、`src/core/doc-navigation-core.ts`、`src/plugin/mouse-gesture-controller.ts`、`src/services/doc-navigation.ts`、`src/ui/gesture-*.ts`、`src/ui/plugin-settings-gesture.ts` 及 3 个测试文件；修改 `src/plugin/plugin-lifecycle.ts` 等 14 个文件）。该功能自带测试且已纳入基线，本轮重构在其之上进行，不触碰手势功能文件本身
  - 上一轮计划（RF-301~307，2026-05-19）已全部完成并归档于 git 历史
- 计划边界：本文件只制定本轮候选项；开始实施任何条目前需用户明确批准具体 ID

## 2. 架构与模块分析

| 模块 | 关键文件 | 当前职责 | 主要痛点 | 测试覆盖情况 |
| --- | --- | --- | --- | --- |
| 链接/剪藏核心逻辑 | `src/core/link-to-doc-core.ts`（1268 行） | URL 归一化、网页链接抽取、X/Twitter 帖子解析（vxTwitter/fxTwitter 响应解析、合并、Markdown 渲染，约 550 行）、微信原文链接抽取、网页 HTML 元数据抽取、DOM→Markdown 转换（`domNodeToMarkdown` 约 300 行）、剪藏文档构建 | 至少三个可独立边界（X 帖子解析、HTML 元数据 + HTML→Markdown、文档组装）挤在一个文件；后续维护剪藏与转链功能都要穿过 1268 行文件 | `tests/link-to-doc-core.test.ts` 覆盖主函数；`tests/link-to-doc-service.test.ts`、`tests/link-to-doc-dialog.test.ts`、`tests/action-runner-link-to-doc.test.ts` 覆盖集成路径 |
| 选区动作处理器 | `src/plugin/action-runner-selection-handlers.ts`（1109 行，上轮 845 行后又增长） | 选中块/局部选区的空格、表情、标点三类 DOM 清理 + 换行分段互转 + 样式切换 + kramdown fallback | 六个近似重复的 apply 函数（三类清理 × 「选中块」/「局部选区」两种路径），结构雷同；`removeSpaceLikeCharsInTextNodes` 等文本节点 walker 也内联在 handler 中；每新增一类清理都要复制 2 个近似函数 | `tests/selection-text-transform-core.test.ts`、`tests/emoji-cleanup-core.test.ts`、`tests/punctuation-toggle-core.test.ts` 覆盖文本级核心；DOM 路径由 `tests/action-runner-loading.test.ts` 间接覆盖，公共骨架无直接测试 |
| 悬浮窗模板 | `src/ui/floating-text/floating-window-template.ts`（2385 行，全仓最大） | `getFloatingWindowStyles()`（约 770 行 CSS 字符串）+ `buildFloatingWindowHtml()`（约 1600 行 HTML 结构 + 内嵌浏览器端 client script：IPC 关闭、字数统计、剪贴板、配置回传等） | CSS、HTML 骨架、窗口内脚本三类内容耦合在单文件；脚本与样式修改都要在 2385 行中定位 | `tests/floating-window-render.test.ts` 锁定渲染输出 |
| 悬浮窗窗口适配 | `src/services/floating-text/floating-window-adapter.ts`（1006 行） | Electron PiP 窗口创建、临时 HTML 写入、`bindPipWindowEvents`（443 行 IPC/事件桥接）、应用内 fallback | 集成层难单测；窗口事件桥接与 fallback 创建混在一个文件 | `tests/floating-text-service.test.ts` 等覆盖服务层；adapter 本体以集成验证为主 |
| 生命周期组合根 | `src/plugin/plugin-lifecycle.ts`（714 行，上轮 490 行后因手势/power buttons/悬浮文字集成再增长） | 插件加载、四个菜单事件处理器（`onEditorTitleMenu`/`onContentMenu`/`onBlockIconMenu`/`onDocTreeMenu`）内联为类成员、控制器装配 | 菜单事件 DOM 构建逻辑内联在组合根，与状态装配混杂；已有 `plugin-lifecycle-menu.ts`/`plugin-lifecycle-events.ts` 但事件处理器本体未下沉 | `tests/plugin-lifecycle-events.test.ts`、`tests/plugin-menu-registration.test.ts`、`tests/plugin-lifecycle-state.test.ts` |
| 清理动作处理器 | `src/plugin/action-runner-cleanup-handlers.ts`（940 行） | 口水内容预览、双语段落拆分、行尾空格、剪藏前缀清理等动作的预览与执行协调 | `createCleanupActionHandlers` 单工厂 940 行；`previewAiOutputCleanup`/`previewStrikethroughCleanup` 等纯预览逻辑可下沉 core | `tests/markdown-cleanup-*.test.ts` 覆盖文本核心；handler 层由 `tests/action-runner-loading.test.ts` 间接覆盖 |
| 鼠标手势/文档导航（新功能，不在本轮范围） | `src/core/gesture-recognition-core.ts`、`src/plugin/mouse-gesture-controller.ts`、`src/ui/gesture-*.ts` 等 | 右键手势识别、文档导航、轨迹 overlay、设置页 | 结构已按 core/controller/ui 分层且测试齐全（3 个测试文件），作为新基线保留 | `tests/gesture-recognition-core.test.ts`、`tests/mouse-gesture-controller.test.ts`、`tests/doc-navigation-core.test.ts` |

## 3. 按优先级排序的重构待办

| ID | 优先级 | 模块/场景 | 涉及文件 | 重构目标 | 行为不变式 | 风险等级 | 重构前测试清单 | 文档影响 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RF-401 | P0 | link-to-doc-core 拆分 X 帖子解析与 HTML→Markdown 子模块 | `src/core/link-to-doc-core.ts`；拟新增 `src/core/x-post-core.ts`（`extractXPostId`、`isXPostUrl`、`parseVxTwitterResponse`、`parseFxTwitterResponse`、`mergeXPostData`、`renderXArticleToMarkdown`、`formatXPostMarkdown`、X 相关类型）、`src/core/web-article-html-core.ts`（`extractWechatOriginalLink`、`extractWebMetadataFromHtml`、`cleanAndConvertHtmlToMarkdown`、`domNodeToMarkdown`）；`link-to-doc-core.ts` 保留原导出（re-export）维持兼容；相关测试 `tests/link-to-doc-core.test.ts` | 将 1268 行文件按子域拆为「X 帖子」「网页 HTML 采集」「文档组装/URL 归一化」三个模块，原文件退化为聚合出口 | 所有导出签名、X 响应解析容错、文章实体渲染顺序、微信原文链接判定、HTML 转义与链接处理、剪藏文档标题/引用格式保持不变 | 中 | - [x] 重构前基线定向测试通过（4 文件 44 用例）<br>- [x] 新增 `tests/x-post-core.test.ts`（20 用例）与 `tests/web-article-html-core.test.ts`（12 用例）直接锁定新模块边界<br>- [x] `corepack pnpm vitest run`（6 文件 76 用例全过）<br>- [x] `corepack pnpm test`（118 文件 973 用例）与 `corepack pnpm typecheck:strict` | `docs/project-structure.md` 记录新 core 模块 | done |
| RF-402 | P0 | 选区 DOM 清理收敛为公共骨架，六函数去重 | `src/plugin/action-runner-selection-handlers.ts`；拟新增 `src/core/selection-dom-cleanup-core.ts`（文本节点 walker：空格/表情/标点遍历 + 局部选区块收集/更新计划骨架）；相关测试 `tests/selection-text-transform-core.test.ts`、`tests/emoji-cleanup-core.test.ts`、`tests/punctuation-toggle-core.test.ts`、`tests/action-runner-loading.test.ts` | 将 `applySelectedBlocksSpacingCleanupFromDom`/`applyPartialSelectionSpacingCleanup` 及 emoji、标点共 6 个近似函数收敛为「清理 walker + 公共 DOM 路径骨架」的配置化调用；`removeSpaceLikeCharsInTextNodes` 等内联 walker 移入 core | 显式选中块优先于局部选区、DOM 改写成功不走 kramdown fallback、清理字符集合与替换规则、高风险内容跳过、失败/跳过提示文案保持不变 | 高 | - [x] 新增 `tests/selection-dom-cleanup-core.test.ts`（23 用例）：walker 计数、选中块缺失/复杂结构返回 null、input 事件、局部选区替换/折叠/跨块/块外边界<br>- [x] `corepack pnpm vitest run`（5 文件 167 用例全过）<br>- [x] `corepack pnpm test`（118 文件 996 用例）与 `corepack pnpm typecheck:strict` | `docs/project-structure.md` 记录新 core 模块 | done |
| RF-403 | P1 | 悬浮窗模板拆分 CSS / client script / HTML 组装 | `src/ui/floating-window-template.ts`（2385 行）；拟新增 `src/ui/floating-text/floating-window-styles.ts`（`getFloatingWindowStyles` CSS 字符串）、`src/ui/floating-text/floating-window-client-script.ts`（内嵌浏览器端脚本字符串）；`floating-window-template.ts` 保留 `buildFloatingWindowHtml` 组装 | 三类内容机械搬移为独立模块，`buildFloatingWindowHtml` 保持同名同签名；纯字符串重组、零逻辑改动 | 生成的 HTML/CSS/JS 字符串逐字节等价（`tests/floating-window-render.test.ts` 锁定）、类名/选择器/事件绑定不变 | 低 | - [x] 拆分前输出快照存档（tmp/html-before.txt，131209 字节）<br>- [x] 拆分后 `cmp` 逐字节对比：**BYTE-IDENTICAL**<br>- [x] `corepack pnpm vitest run tests/floating-window-render.test.ts`（12 用例）<br>- [x] `corepack pnpm test`（119 文件 996 用例）与 `corepack pnpm typecheck:strict` | `docs/project-structure.md` 更新 floating-text UI 模块清单 | done |
| RF-404 | P1 | 生命周期菜单事件处理器下沉 | `src/plugin/plugin-lifecycle.ts`；拟新增 `src/plugin/plugin-lifecycle-menu-handlers.ts`（或并入现有 `plugin-lifecycle-menu.ts`）；相关测试 `tests/plugin-lifecycle-events.test.ts`、`tests/plugin-menu-registration.test.ts`、`tests/plugin-lifecycle-state.test.ts` | 将 `onEditorTitleMenu`/`onContentMenu`/`onBlockIconMenu`/`onDocTreeMenu` 四个事件处理器的菜单项构建逻辑外移为可测工厂，lifecycle 类仅保留绑定与回调 | 菜单出现条件、图标/名称 i18n、排序（docActionOrderState/favorites）、点击回调目标、移动端差异、禁用态保持不变 | 中 | - [x] 新增 `tests/plugin-lifecycle-menu.test.ts`（18 用例）：hidden 判定、内容/块图标/文档树菜单项添加与 click 分支、toolbar/窗口选区 range 捕获、空选区与非法参数边界<br>- [x] `corepack pnpm vitest run`（4 文件 52 用例全过）<br>- [x] `corepack pnpm test`（120 文件 1014 用例）与 `corepack pnpm typecheck:strict` | `docs/project-structure.md` 更新 plugin 生命周期模块职责 | done |
| RF-405 | P2 | 悬浮窗窗口适配层拆分事件桥接与 fallback | `src/services/floating-text/floating-window-adapter.ts`；拟新增 `src/services/floating-text/floating-window-pip-events.ts`（`bindPipWindowEvents`）、`src/services/floating-text/floating-window-fallback.ts`（`openInAppFloatingFallback`） | 将 1006 行 adapter 拆为主入口 + 事件桥接 + fallback 三文件 | 窗口打开顺序、PiP 支持判定、IPC 事件名、dark theme 判定、fallback DOM 结构保持不变 | 中 | - [x] 新增 `tests/floating-window-pip-events.test.ts`（9 用例：关闭/Esc/popover/字号/视图切换/复制/滑块/尺寸记忆）与 `tests/floating-window-fallback.test.ts`（5 用例：Dialog 参数/容器清理/图片强制 markdown/关闭按钮/Esc/custom event 幂等）<br>- [x] `corepack pnpm vitest run`（7 文件 106 用例全过）<br>- [x] `corepack pnpm test`（122 文件 1028 用例）与 `corepack pnpm typecheck:strict` | `docs/project-structure.md` 更新 floating-text services 清单 | done |
| RF-406 | P2 | 清理处理器纯预览逻辑下沉 core | `src/plugin/action-runner-cleanup-handlers.ts`；拟新增 `src/core/cleanup-preview-core.ts`（`previewAiOutputCleanup`、`previewStrikethroughCleanup` 及纯文本预览 helper） | 将确认弹窗用的纯预览计算移出 940 行工厂，handler 只留编排 | 预览文案、截断省略、命中块计数、确认/取消分支保持不变 | 低 | - [x] 新增 `tests/cleanup-preview-core.test.ts`（13 用例）：高风险判定五类标记、分割线块识别、AI 产物分类计数、删除线计数、risky/无变化/空块跳过<br>- [x] `corepack pnpm vitest run`（6 文件 201 用例全过）<br>- [x] `corepack pnpm test`（123 文件 1041 用例）与 `corepack pnpm typecheck:strict` | `docs/project-structure.md` 记录新 core 模块 | done |

优先级说明：
- `P0`：价值最高（剪藏核心与选区清理是文档变更主路径），执行时必须先补定向测试
- `P1`：机械拆分与结构收敛，中等风险；在 P0 完成并稳定后执行
- `P2`：低风险清理项；最后执行，可视情况获批跳过

状态说明：
- `pending`：尚未开始
- `in_progress`：已获批并正在执行
- `done`：已完成代码、测试与文档同步
- `blocked`：因测试基线、需求不清或外部依赖阻塞

## 4. 执行日志

| ID | 开始日期 | 结束日期 | 验证命令 | 结果 | 已刷新文档 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| RF-401 | 2026-11-15 | 2026-11-15 | `corepack pnpm vitest run tests/link-to-doc-core.test.ts tests/link-to-doc-service.test.ts tests/link-to-doc-dialog.test.ts tests/action-runner-link-to-doc.test.ts tests/x-post-core.test.ts tests/web-article-html-core.test.ts`；`corepack pnpm test`；`corepack pnpm typecheck:strict` | pass | `docs/project-structure.md`（README 无需修改） | 拆出 `x-post-core.ts`、`web-article-html-core.ts`，另增共享模块 `web-clip-shared-core.ts`（`sanitizeDocTitle`/`WebArticleMeta`）避免循环依赖——对计划的合理细化；`link-to-doc-core.ts`（1268→约 210 行）保留链接域并聚合 re-export，消费方零改动；新增 32 个用例。备注：仓库预存 eslint 配置引用缺失文件 `src/utils/eslint/i18n-validate-keys.mjs`（历史问题，与本轮无关），门禁以 typecheck:strict + vitest 为准 |
| RF-402 | 2026-11-15 | 2026-11-15 | `corepack pnpm vitest run tests/selection-dom-cleanup-core.test.ts tests/selection-text-transform-core.test.ts tests/emoji-cleanup-core.test.ts tests/punctuation-toggle-core.test.ts tests/action-runner-loading.test.ts`；`corepack pnpm test`；`corepack pnpm typecheck:strict` | pass | `docs/project-structure.md`（README 无需修改） | 新增 `selection-dom-cleanup-core.ts`（`transformTextNodesInElement`/`collectSelectedBlockElements`/`applyTextTransformToSelectedBlocks`/`applyTextTransformToPartialSelection` + 5 个 DOM helper），handler 中 3 个 walker + 6 个近似 apply 函数收敛为薄包装（1109→805 行）；标点模式检测保留在 handler 侧（collect → detect → transform）；新增 23 个骨架用例。教训记录：骨架统一 `changedCount` 契约，spacing/emoji 的 `removedCount` 由 handler 的 `toTextTransform` 适配，曾因契约不一致漏改 4 个集成用例、定向测试全部拦截 |
| RF-403 | 2026-11-15 | 2026-11-15 | 拆分前后快照 `cmp`（BYTE-IDENTICAL）；`corepack pnpm vitest run tests/floating-window-render.test.ts`；`corepack pnpm test`；`corepack pnpm typecheck:strict` | pass | `docs/project-structure.md`（README 无需修改） | 程序化拆分（node 行提取脚本）为 `floating-window-styles.ts`（CSS 769 行）、`floating-window-client-script.ts`（声明区参数化 + 主体常量 1205+132 行，`buildFloatingWindowClientScript` 接收 8 个插值参数）、`floating-window-template.ts`（2385→280 行，保留 `buildFloatingWindowHtml` 与 marked 沙箱脚本）；快照对比逐字节等价，消费方零改动 |
| RF-404 | 2026-11-15 | 2026-11-15 | `corepack pnpm vitest run tests/plugin-lifecycle-menu.test.ts tests/plugin-lifecycle-events.test.ts tests/plugin-menu-registration.test.ts tests/plugin-lifecycle-state.test.ts`；`corepack pnpm test`；`corepack pnpm typecheck:strict` | pass | `docs/project-structure.md`（README 无需修改） | 按既有模块扩展惯例并入 `plugin-lifecycle-menu.ts`（87→218 行）而非新建平行模块：新增 `isFloatSelectedTextHidden`、`addFloatSelectedTextContentMenuItem`、`captureFloatingSelectionRange`、`addFloatSelectedTextBlockMenuItem`、`addFloatDocTreeMenuItem`；`onContentMenu`/`onBlockIconMenu`/`onDocTreeMenu` 薄化为编排委托（lifecycle 714→680 行），`onEditorTitleMenu` 原已委托 `populateEditorTitleMenu` 未动；`extractFloatingMarkdownFromSelection` 依赖移出 lifecycle，`floatingTextService` 经回调注入保留在组合根；新增 18 个用例 |
| RF-405 | 2026-11-15 | 2026-11-15 | `corepack pnpm vitest run tests/floating-window-pip-events.test.ts tests/floating-window-fallback.test.ts tests/floating-window-render.test.ts tests/floating-text-service.test.ts tests/floating-text-core.test.ts tests/floating-text-search-core.test.ts tests/floating-selection-helper.test.ts`；`corepack pnpm test`；`corepack pnpm typecheck:strict` | pass | `docs/project-structure.md`（README 无需修改） | 程序化搬移 `bindPipWindowEvents`（443 行）与 `openInAppFloatingFallback`（104 行）为独立模块，adapter 1006→458 行；两函数自包含（无 adapter 私有状态依赖），消费方签名不变。**顺手修复测试暴露的原有缺陷**：`updateWordCount()` 原在 `getCurrentText`（const）定义前调用，在 docPiP/window.open 路径（模板含 `#ft-word-count`）必然触发 TDZ ReferenceError 使事件绑定中断（electron 主路径不受影响，故此前未被发现）；已将调用移至定义之后。后续建议：SiYuan 内人工冒烟 docPiP/弹窗降级路径 |
| RF-406 | 2026-11-15 | 2026-11-15 | `corepack pnpm vitest run tests/cleanup-preview-core.test.ts tests/markdown-cleanup-core.test.ts tests/markdown-cleanup-blocks.test.ts tests/markdown-cleanup-bilingual.test.ts tests/markdown-cleanup-clipped-list.test.ts tests/action-runner-loading.test.ts`；`corepack pnpm test`；`corepack pnpm typecheck:strict` | pass | `docs/project-structure.md`（README 无需修改） | 纯函数下沉为 `cleanup-preview-core.ts`（`previewAiOutputCleanup`/`previewStrikethroughCleanup`/`isHighRiskForMarkdownWrite`/`isThematicBreakBlock` + 预览类型），handler 940→831 行；`isHighRiskForMarkdownWrite` 在 selection-handlers 中仍有相同副本（本轮未动，后续可复用 core 版）；新增 13 个用例 |

## 5. 决策与确认

- 用户批准的条目：`RF-401`、`RF-402`、`RF-403`、`RF-404`、`RF-405`、`RF-406`（全部，2026-11-15）
- 延后的条目：
- 阻塞条目及原因：
- 工作区前提：存在未提交的鼠标手势/文档导航功能改动（见项目快照），已确认为用户进行中的工作，本轮重构不回退、不触碰该功能文件

## 6. 文档刷新

- `docs/project-structure.md`：已于 2026-11-15 全面刷新至 v1.6.5 基线——更新统计（`src/` 168 文件、`tests/` 122）、`src/core/` 49 个文件职责表（含本轮新增的 `web-clip-shared-core`/`x-post-core`/`web-article-html-core`/`selection-dom-cleanup-core`/`cleanup-preview-core` 与 link-to-doc 聚合出口说明）、`src/plugin/` 39 个（`plugin-lifecycle-menu` 职责更新为含悬浮菜单工厂，cleanup/selection handler 标注下沉说明）、`src/services/` 与 `src/services/floating-text/`（含 `floating-window-pip-events`/`floating-window-fallback`）、`src/ui/floating-text/` 模板三模块、`src/styles/` 清单、全量测试清单（121 个用例文件）
- `README.md`：经核对为纯用户向文档（场景与功能介绍，无版本号/开发命令/结构信息），本轮均为内部结构重构、用户可见能力不变，无需修改
- 最终同步检查：已完成；最终验证 `corepack pnpm test` 123 文件 1041 用例全部通过，`corepack pnpm typecheck:strict` 通过

## 7. 下一步

1. 本轮已获批条目 `RF-401` 至 `RF-406` 已全部完成，执行日志见第 4 节
2. 建议后续（非本轮范围）：SiYuan 内人工冒烟悬浮窗 docPiP/window.open 降级路径（RF-405 修复的 TDZ 属该路径）；`selection-handlers` 中 `isHighRiskForMarkdownWrite` 副本可复用 `core/cleanup-preview-core` 版本
3. 仓库预存问题备忘：eslint 配置引用缺失文件 `src/utils/eslint/i18n-validate-keys.mjs`（与本轮无关，修复需独立任务）
