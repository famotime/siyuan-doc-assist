# 隐式状态机审计：遗留项说明

创建时间：`2026-11-15`
最后更新：`2026-11-15`（第二批整改落地 + 第 4 节源码核实）
关联工作：全项目隐式状态机审计（5 个区域、60+ 项发现）及整改落地。
本文档记录：已修复项的简表、决策记录、剩余低危备忘与核实结论，供后续排期参考。

---

## 1. 已修复项（简表）

### 1.1 第一批（审计整改）

以下问题已在本轮整改中修复并有测试锁定（详见提交记录与 `tests/` 新增用例）：

| 区域 | 已修复问题 |
| --- | --- |
| 动作执行 | 确认框 ESC/X 永挂锁死前台管线；互斥 TOCTOU 并发写；调用上下文槽位污染导致静默自动确认；overlay 无计数互相覆写；后台动作驱动全局遮罩 |
| key-info | refresh 与只读同步双 token 不联动（跨文档只读态覆盖）；destroy 不失效 in-flight 请求；unavailable 残留只读态；rowCache 滞留；滚动恢复守卫失效；重入渲染丢 spinner/杀拖拽 |
| 设置/手势 | 录制悬挂 + 废弃捕获改写手势绑定；取消划动轨迹墨迹残留；`updateManagedConfig` 死选择器 |
| 服务层 | 内核文件缺失错误分类失效（结构化错误码）；导出暂存异常残留 `/temp`；AI 批处理 Phase2 无容错 + 同块多图逆序插入；进度虚跳；4 处图片解码 objectURL 失败泄漏；请求无前端超时 |
| 浮窗 | PiP/popup 双重事件绑定；IPC 双通道重复处理；拖拽卡死；先销毁后创建无回滚；popup 孤儿窗；卸载僵尸态；字号钳制常量漂移；滑块最小透明度不一致；toast 定时器叠加；死状态清理 |
| 生命周期 | api-switch ready 监听泄漏；saveData 失败静默分叉 |

### 1.2 第二批（2026-11-15 复核核实后，经确认实施）

对第 2/3/4 节逐项核实后按确认范围实施，全部有测试覆盖：

| 来源 | 修复内容 | 关键落点 |
| --- | --- | --- |
| 2.1 | 后台任务键 `Set` → `Map<key, startedAt>`；`runAction` 入口清扫悬挂 ≥10 分钟的残留键并告警 | `action-runner.ts` |
| 2.2 | 游标成对校验：`resolvePairedCursorDocId` 纯函数 + 成对消费点（key-info 的 `getCurrentDocId`）以 protyle 为准重同步写回；`resolveDocId` 写入副作用按原方案保留 | `doc-context.ts`、`plugin-lifecycle.ts` |
| 2.3 | 取消契约（增量式）：`ACTION_CANCELLED` 字符串哨兵 + `errorCode:"cancelled"`；21 处确认框取消路径全部迁移；`undefined → ok:true` 旧契约保持不变（测试锁定） | `action-runner-dispatcher.ts`、`action-runner.ts`、7 个 handler 文件 |
| 2.4 | `core/map-with-concurrency.ts`（默认 4 路、可配置、保序）；ai-image-ocr / ai-paragraph-translation Phase 1 接入 | 新 core + 两个服务 |
| 2.5 | 拆分 create 循环逐项容错：部分失败时保留原文档并报告 `failedSectionTitles`；全部失败抛首个错误；mover 在 rename 成功 + move 失败时将新标题加入占用集合、`renamed` 只在两者都成功后计入（矛盾报告修正） | `split-doc-by-headings.ts`、`mover.ts`、organize handler |
| 2.6 | 缓存失效加入 `expectedSourceHash` 比较（v3 与 legacy 两路）+ v3 降级路径 debug 日志 | `network-lens-ai-index.ts` |
| 4.1 | dock init 前先销毁旧实例（防未来「不销毁直接重建」路径泄漏） | `key-info-controller.ts` |
| 4.2 | `onunload` 主动 `setting.close()` 兜底旧版前端不关面板 | `plugin-lifecycle.ts` |
| 4.3 | 匹配集补 `cannot find the path`（Win 英文目录变体）；错误信封 body `code===404` 作为结构性判据 | `kernel-file-error-core.ts`、`kernel-file.ts` |
| 低危 | 手势轨迹 rAF 节流 + 600 点上限（识别器仍逐事件喂点）；`sqlPaged` 触顶告警 + 返回数组 `truncated` 标记；slop-marker 未命中/未知段落计数 + warn + 诊断出参 `SlopMarkerParseDiagnostics`；标签策略 1 补 `slice(0,5)`；PiP/popup 隐藏假 pin 按钮（`pinControlDisabled`）并联动停用 Alt+P；降级窗 Esc 完全交还思源原生处理（实机复核发现思源 window 级 keydown 本身按「一次 Esc 关栈顶一个 Dialog」工作，插件自实现会与之叠加成一次关多个，且 document 级捕获监听会吞页面 Esc，详见第 5 节实机验证） | `gesture-capture.ts`、`kernel-shared.ts`、`ai-slop-marker-parser.ts`、`ai-summary.ts`、`floating-window-template/adapter/client-script/pip-events/fallback` |

测试：新增 `map-with-concurrency`、`gesture-capture`、`ai-slop-marker-parser` 用例；扩展 `action-runner-concurrency`（清扫 + 取消契约）、`mover`、`split-doc-by-headings-service`、`network-lens-ai-index`、`kernel-file(-error-core)`、`floating-window-fallback`（Esc 栈）、`floating-window-render`（pin 隐藏）、`plugin-doc-context`、`ai-summary-tag-parser`。
验证：`pnpm test` 1115 通过；`pnpm lint` 0 errors；`pnpm typecheck:strict` 0 errors。

---

## 2. 决策记录（原「明确延后的遗留项」处理结论）

第 2 节原 6 项延后条目已于 2026-11-15 全部实施（见 1.2）。保留两点备注：

- **2.3 为增量迁移**：仅「确认框拒绝」这一定性明确的取消路径返回哨兵；handler 的其它 `undefined` 返回路径（真空操作）仍映射 `ok:true`。如需彻底区分，再按 handler 分批审计迁移。
- **2.6 比较能力已就位、生效条件未达成**：本仓无法复现脉络镜（siyuan-network-lens）的 `sourceHash` 计算算法，现有调用方传不出 `expectedSourceHash`；待脉络镜暴露哈希 API 或我方实现同款算法后才能真正参与失效判定。`sourceUpdatedAt` 比较仍是当前唯一的失效条件。

---

## 3. 低危备忘（更新后剩余）

**已处理（2026-11-15 第二批）**：手势轨迹 O(n²)、`sqlPaged` 静默截断、slop-marker 静默丢段、标签策略 1 未截断、popup/pip 假 pin、降级 Dialog 多窗 Esc 全关（最终方案：插件侧 Esc 自实现整体移除，交还思源原生「一次关一个」，见第 5 节）。

**剩余（经确认本轮不动，改动时顺手处理）**：

- **浮窗临时 HTML 固定文件名竞态**：`floating-window-adapter.ts` 写 `siyuan-doc-assist-floating-window.html` 到固定路径，两个思源窗口同时开悬浮窗时可能互相覆盖。复核补充：**全仓没有任何清理该临时文件的逻辑**，固定名覆盖即「隐式清理」（泄漏上限恒为 1 个文件）；若改随机段必须配套清理（如新浮窗创建时清扫同前缀残留），否则泄漏将从恒 1 个变成无限累积。
- **Markdown 渲染三引擎并存**：初始 Lute → 重渲染 marked → 降级 `simpleMarkdownToHtml`（client script 手抄副本）。复核确认两处实质漂移：① core 的 `escapeHtml` 转义引号，client 的 `renderInline` 不转义引号；② core 的 todo 正则允许多空格（`^-\s+\[([ x])\]`），client 只认精确前缀（双空格 todo 在 client 侧显示字面 `[ ]`）。降级路径暴露面小但属实质漂移。
- **双实现守护测试锚点脆弱**：`tests/floating-window-search-parity.test.ts` 用 `indexOf("function stripLeadingPrefixes(")` 类字符串锚点切片；重命名函数即失效。长期可考虑把共享逻辑抽到可同时被两侧消费的形式。

---

## 4. 未确认事项 → 核实结论（2026-11-15，对照 siyuan-note 源码）

| 原事项 | 核实结论 | 后续动作 |
| --- | --- | --- |
| 桌面端 dock 布局重载是否 destroy+re-init 同一 dock tab | **已确认 destroy+re-init，且更强**：布局重载/重置是整页 `window.location.reload()`（`app/src/layout/util.ts`），页面重启后 `JSONToDock` 新建 Dock 实例并重走插件 model 工厂与 init 回调；destroy 链（`Dock.remove` → 插件 destroy 回调）先于再 init | 一行自卫已加（init 前先 destroy）；**关闭** |
| 卸载插件时是否强制关闭其已打开设置对话框 | **已确认新版会**：2026-09-30 提交 `8bdac9df1` 起 loader 的 onunload 适配器第一行即 `plugin.setting?.close()`，禁用/卸载/重载三路都走；更旧版本不会（v3.6.5 的 uninstall 只调 `plugin.onunload()`） | 自兜底已加（onunload 主动 close）；**关闭** |
| 旧版内核 getFile 失败文案是否命中 missing 匹配 | **已确认新旧全覆盖**，且 HTTP 层从来不是 404 而是 **202 + JSON body `{code:404, msg:<os.Stat 原始错误>}`**（`kernel/api/file.go`；文案从未改过：Linux `no such file or directory`、Win en `The system cannot find the file specified.`、Win zh-CN `系统找不到指定的文件。`）；唯一缺口是 Win en 目录变体 `cannot find the path specified` 与 body code 未参与判定 | 两个缺口均已补；**关闭** |
| `@electron/remote` 跨渲染进程调用宿主闭包对象是否可靠 | **反证 + 死路确认**：官方渲染进程 0 处使用 remote（v2.10.9 明确用 ipcRenderer 替换，issue #9368），且只对自家窗口 enable；`ipcRenderer.sendTo` 在 Electron 28 起移除（官方当前 Electron 44.10.0），client script 的 sendTo 回退在现环境为死路径（消息进主进程即被丢弃）；真正可依赖的只剩子窗口 remote 闭包调用一条路，其可用性（enable 与否）**必须实机验证** | 实机验证清单：`docs/floating-window-ipc-verification.md`；验证后再决定是否做主进程中转改造 |

---

## 5. 提交交叉说明

- 第一批整改中 `src/plugin/action-runner.ts`（互斥/overlay/上下文重构）与 `src/plugin/plugin-lifecycle.ts`（api-switch 监听、saveData 容错、浮窗卸载清理）的改动，因与并行进行的 `fix(insert)` 工作同时存在于工作区，已被并行提交 `6ce780b` 一并带入历史；该提交信息未覆盖这两部分内容，特此说明。
- 第一批其余整改（含 `action-runner.ts` 的 lint 缩进修正）由该说明所附的整改提交承载。
- 第二批整改（1.2 表所列）目前在工作区未提交；提交时建议按「延后项整改 / 低危与浮窗整改 / 测试与文档」拆分或合并为单一提交均可，注意提交信息覆盖 `action-runner.ts` 的取消契约与清扫改动。
