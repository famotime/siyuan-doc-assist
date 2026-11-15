# 隐式状态机审计：遗留项说明

创建时间：`2026-11-15`
关联工作：全项目隐式状态机审计（5 个区域、60+ 项发现）及整改落地。
本文档记录：已修复项的简表、**明确延后/未实施**的遗留项、低危备忘与未确认事项，供后续排期参考。

---

## 1. 已修复项（简表）

以下问题已在本轮整改中修复并有测试锁定（详见提交记录与 `tests/` 新增用例）：

| 区域 | 已修复问题 |
| --- | --- |
| 动作执行 | 确认框 ESC/X 永挂锁死前台管线；互斥 TOCTOU 并发写；调用上下文槽位污染导致静默自动确认；overlay 无计数互相覆写；后台动作驱动全局遮罩 |
| key-info | refresh 与只读同步双 token 不联动（跨文档只读态覆盖）；destroy 不失效 in-flight 请求；unavailable 残留只读态；rowCache 滞留；滚动恢复守卫失效；重入渲染丢 spinner/杀拖拽 |
| 设置/手势 | 录制悬挂 + 废弃捕获改写手势绑定；取消划动轨迹墨迹残留；`updateManagedConfig` 死选择器 |
| 服务层 | 内核文件缺失错误分类失效（结构化错误码）；导出暂存异常残留 `/temp`；AI 批处理 Phase2 无容错 + 同块多图逆序插入；进度虚跳；4 处图片解码 objectURL 失败泄漏；请求无前端超时 |
| 浮窗 | PiP/popup 双重事件绑定；IPC 双通道重复处理；拖拽卡死；先销毁后创建无回滚；popup 孤儿窗；卸载僵尸态；字号钳制常量漂移；滑块最小透明度不一致；toast 定时器叠加；死状态清理 |
| 生命周期 | api-switch ready 监听泄漏；saveData 失败静默分叉 |

---

## 2. 明确延后的遗留项（建议后续排期）

### 2.1 后台任务注册表无超时清扫

- 位置：`src/plugin/action-runner.ts` `backgroundTaskKeys`（key 形如 `action:docId`）
- 现状：键在任务 finally 中删除，但若 handler 永久悬挂（如内核请求永不返回），键将永久残留，该「动作+文档」组合永远报「正在后台处理中」。
- 延后理由：悬挂的最大来源（确认框永挂）已在本轮修复；残余悬挂源是内核请求不可取消，根治依赖请求超时能力（已具备 `requestApi timeoutMs`，但未全量接入后台 handler）。
- 建议方案：为 `runActionInBackground` 注册任务时间戳，`runAction` 入口对超过阈值（如 10 分钟）的残留键做清扫并告警；或后台 AI handler 统一传 `timeoutMs`。

### 2.2 「当前文档」游标 docId/protyle 可失步

- 位置：`src/plugin/plugin-lifecycle.ts` `currentDocId`/`currentProtyle`、`resolveDocId`（读取带写入副作用）
- 现状：`click-editortitleicon` 事件只无条件更新 docId（protyle 仅在有值时更新）；`resolveDocId` 的 explicitId 分支只写 docId 不写 protyle；protyle 关闭标签后无清理事件，游标可指向游离 DOM。极端序列下 docId 与 protyle 指向不同文档（如关键信息刷新拿 B 的 docId 配 A 的 protyle 提取上下文）。
- 延后理由：修复需明确「显式 docId 调用是否应改变当前文档游标」的产品语义，且 `resolveDocId` 的写入副作用被现有流程隐式依赖（测试覆盖其调用契约），贸然成对化可能改变行为。
- 建议方案：先加成对校验（`getProtyleDocId(currentProtyle) === currentDocId` 不一致时以 protyle 为准重同步），观察一段时间后再考虑移除 `resolveDocId` 的写入副作用。

### 2.3 被取消的动作对外报告成功（`ok:true`）

- 位置：`src/plugin/action-runner.ts` `runAction` 尾部（handler 返回 `undefined` → `{ ok: true }`）
- 现状：用户在确认框取消后，Power Buttons / 工作流调用方拿到 `ok:true` 会继续执行下一步。
- 延后理由：`undefined → ok:true` 是既有契约且被 `tests/action-runner-workflow-context.test.ts` 锁定；贸然改为 `ok:false` 会改变所有工作流调用方的重试/继续语义，且需要区分「取消」与「空操作成功」。
- 建议方案：新增 `errorCode: "cancelled"` 结果类型；逐个审计 handler 的 `undefined` 返回路径（确认取消 vs 真空操作），分批迁移并同步 `power-buttons-provider` 的契约文档。

### 2.4 AI 批处理并发无上限

- 位置：`src/services/ai-image-ocr.ts` / `src/services/ai-paragraph-translation.ts` Phase 1
- 现状：请求数 = 图片数×切片数（或段落数），全部同时发射；大文档易触发 API 限流或内核内存压力。
- 建议方案：引入 4-8 路信号量（可在 `core/` 做一个纯函数 `mapWithConcurrency`，两处复用）。

### 2.5 文档拆分与移动的部分失败无回滚/报告矛盾

- 位置：`src/services/split-doc-by-headings.ts`（create 循环无逐项容错，同名 title 会 hPath 冲突中止）、`src/services/mover.ts`（rename 成功 + move 失败时报告自相矛盾、失败 rename 的新标题不入 `existingChildTitles`）
- 延后理由：均为「中途失败后的补偿语义」设计问题（保留半成品并报告 vs 回滚），需产品决策。
- 建议方案：拆分失败时汇报「已建 N 个子文档 + 未删除原文档」；mover 将失败 rename 的新标题同样加入占用集合。

### 2.6 网络摘要缓存失效不比对内容哈希

- 位置：`src/services/network-lens-ai-index.ts`（`sourceHash` 存而不比；v3 命中时 `summaryMedium === summaryShort` 静默降级）
- 建议方案：失效条件加入 `sourceHash` 比较；命中降级路径打日志。

---

## 3. 低危备忘（无测试锁定，改动时顺手处理）

- **浮窗临时 HTML 固定文件名竞态**：`floating-window-adapter.ts` 写 `siyuan-doc-assist-floating-window.html` 到固定路径，两个思源窗口同时开悬浮窗时可能互相覆盖（仅影响「加载中窗口被覆盖」边缘场景）。建议文件名加入随机段。
- **降级 Dialog 捕获阶段吞 Esc**：`floating-window-fallback.ts` 对整个 document 捕获 Esc 并 `stopPropagation`——Dialog 打开期间页面所有 Esc（含思源自身处理）被吞；多个降级 Dialog 并存时一次 Esc 全关。
- **popup 路径置顶按钮是假状态机**：`floating-window-pip-events.ts` 的 pin 切换只翻 UI；popup 本就不置顶。建议 popup 环境隐藏 pin 按钮（目前仅 dialog fallback 隐藏）。
- **Markdown 渲染三引擎并存**：初始 Lute → 重渲染 marked → 降级 `simpleMarkdownToHtml`（client script 内手抄副本，与 `core/floating-text-core.ts` 存在引号转义/待办正则差异）。降级路径暴露面小但属实质漂移。
- **双实现守护测试锚点脆弱**：`tests/floating-window-search-parity.test.ts` 用 `indexOf("function stripLeadingPrefixes(")` 类字符串锚点切片；重命名函数即失效。长期可考虑把共享逻辑抽到可同时被两侧消费的形式。
- **手势轨迹性能**：`gesture-capture.ts` mousemove 无节流、`points` 无上限，配合全量重绘为 O(n²)；超长划动会卡顿。
- **`sqlPaged` 12800 行静默截断**：`kernel-shared.ts` 达 `maxPages(200)×pageSize(64)` 上限无告警；超大文档批量操作（如 OCR）可能漏块。建议触顶时打 warn 或在返回值中携带 `truncated` 标记。
- **slop-marker `includes` 原文校验静默丢段**：`ai-slop-marker-parser.ts` entries 路径要求 AI 返回逐字原文，改写即丢段无告警；建议对未命中段落计数并在报告中呈现。
- **标签策略 1 未截断**：`ai-summary.ts` 策略 1 结果未 `slice(0, 5)`，与策略 2/3 不一致。

---

## 4. 未确认事项（需实机验证后定级）

| 事项 | 依赖的验证 |
| --- | --- |
| SiYuan 桌面端 dock 布局重载是否 destroy+re-init 同一 dock tab | 影响 key-info controller 重建竞态的实际可达性（已做防御，影响面未知） |
| `@electron/remote` 跨渲染进程调用宿主闭包对象是否可靠 | 影响浮窗 IPC 单通道改造中 sendTo 路径的可靠性（已加 send 回退） |
| 思源卸载插件时是否强制关闭其已打开设置对话框 | 影响设置面板残留问题的定级（录制清理已不依赖该答案） |
| 旧版内核 getFile 失败文案是否命中 missing 匹配 | `kernel-file-error-core` 对旧内核的兼容性（匹配集已尽量超集覆盖） |

---

## 5. 提交交叉说明

- 本轮整改中 `src/plugin/action-runner.ts`（互斥/overlay/上下文重构）与 `src/plugin/plugin-lifecycle.ts`（api-switch 监听、saveData 容错、浮窗卸载清理）的改动，因与并行进行的 `fix(insert)` 工作同时存在于工作区，已被并行提交 `6ce780b` 一并带入历史；该提交信息未覆盖这两部分内容，特此说明。
- 其余全部整改（含 `action-runner.ts` 的 lint 缩进修正）由本说明所附的整改提交承载。
