# 悬浮文本（桌面置顶与背景透明）可行性分析报告与技术方案设计

- 编写日期：2026-09-03
- 状态：已定稿 / 待实施
- 归属项目：`siyuan-doc-assist`（思源文档助手）

---

## 1. 背景与需求概述

### 1.1 业务背景
在日常笔记、写作、翻译、资料比对和编程开发过程中，用户经常需要对照某些参考资料或提炼的要点。传统的笔记软件窗口最小化或切到其他软件（如 Word、VSCode、浏览器）后，思源笔记窗口退入后台，用户无法实时对照参考。

### 1.2 需求范围
1. **系统级全局置顶悬浮**：支持将“选定段落”或“整篇文档”固定悬浮在其他操作系统应用程序之上，不被遮挡。
2. **文本背景透明可调**：支持配置文本背景为透明/半透明（玻璃拟态），滑块调节透明度，文字本身清晰可见。
3. **交互与操作体验（参考 utools-suspension-text）**：
   - 滚轮调字号：支持 `Ctrl + 鼠标滚轮` 放大/缩小字体。
   - 快捷关闭：按 `Esc` 或关闭按钮快速退出并暂存窗口状态。
   - 尺寸与位置记忆：自动记忆上次使用的窗口宽高与位置。
   - 视图模式：支持纯文本与 Markdown 预览渲染切换。
4. **功能入口与菜单集成**：
   - **“文档处理-整理”分类**：增加“悬浮选中文本”操作按钮（未选中文本时自动降级悬浮整篇文档）。
   - **右键菜单**：选中文本时右键增加“悬浮选中文本”；文档菜单/文档树右键增加“悬浮整篇文档”。
   - **设置面板**：增加“悬浮文本设置”，支持预设透明度、默认字号、快捷键与行为选项。

---

## 2. 技术可行性与底层路径深度剖析

### 2.1 为什么思源笔记常规浮窗（In-App Popover）无法满足要求？
思源笔记内的许多浮窗插件（如悬浮大纲插件）是通过 DOM 的 `position: fixed` 插入到当前思源窗口内的。
- **致命限制**：此类浮窗仅属于当前网页 DOM 节点。一旦用户将焦点切换到其他应用程序（如 Word、IDE、浏览器），思源笔记主窗口整体退到系统底层，**内部的所有 DOM 浮窗必然一同被第三方程序遮挡**。
- **技术结论**：要做到“在其他程序之上不被遮挡”，必须依赖**操作系统级（OS-Level）的顶层置顶独立窗口**。

### 2.2 方案对比与演进选型

| 技术方案 | 工作原理 | 全局置顶能力 | 背景透明度支持 | 稳定性与兼容性 | 综合评价 |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **方案 A：原生编辑器子窗口** | 调用官方 `openWindow({ doc: { id }, alwaysOnTop: true })` | ✅ 支持 | ❌ 不支持（含思源整套顶栏、框架与实底） | 官方标准 API | 仅适合阅读完整文档，不具备便签轻量感和背景透明。 |
| **方案 B：Document Picture-in-Picture** | 调用 `documentPictureInPicture.requestWindow()` | ✅ 理论支持（标准 Chrome） | ✅ 完整支持 | ⚠️ **Electron 限制**（Issue #39633：Electron 未实现 PiP WindowManager，调用会抛出 `InvalidStateError: Internal error: no window`） | 在标准 Chrome/Edge 浏览器中有效，但在思源桌面版 Electron 容器中会报错。 |
| **方案 C：SiYuan 原生置顶独立窗口 + 静态便签页（最终采纳）** | 通过 `siyuan-open-window` IPC 打开插件自包含便签页 `floating.html`，配置 `setAlwaysOnTop: true` | ✅ **操作系统级最高置顶**（主进程原生 `win.setAlwaysOnTop(true)`） | ✅ **支持内容区 10%~100% 半透明与毛玻璃拟态** | **最高**。直接复用思源桌面主进程已内建的顶级窗口 IPC 管道，零报错，完全不遮挡。 | **最佳落地方案**。在桌面端使用 SiYuan 原生置顶独立窗口，在 Web 端自动适配标准画中画/弹窗，移动端优雅降级。 |

### 2.3 核心实现与分层策略
- **桌面端（Electron 环境）**：
  - 思源主进程 `app/electron/main.js` 监听了 `siyuan-open-window` 事件，参数支持 `url`、`width`、`height` 以及 `setAlwaysOnTop: true`，且窗口默认采用 `titleBarStyle: "hidden"` 无边框风格。
  - 插件将自包含的 `floating.html` 打包至插件目录根部，通过 `${origin}/plugins/siyuan-doc-assist/floating.html` 由思源内核静态服务器直出。
  - 数据通过 `localStorage` 的 `doc-assistant-floating-payload` 共享，并结合 `storage` 事件实现多选区实时热更新。
- **Web 端与浏览器环境**：
  - 支持 `Document Picture-in-Picture` 或标准 `window.open` 弹出窗口。
- **受限移动端环境**：
  - 优雅降级为应用内透明 `Dialog` 浮窗。

---

## 3. 背景透明与视觉呈现设计

### 3.1 为什么窗口内容区半透明是最佳实践？
在操作系统桌面环境中，全透明穿透（Click-through）会导致用户无法点击悬浮窗内部的复制按钮、滚动条和文字选择。
因此，采用**半透明磨砂玻璃拟态（Frosted Glass / Glassmorphism）**是兼顾“透视下方内容”与“内容操作性”的最佳方案：
- **容器背景**：`background: rgba(var(--ft-bg-color), var(--ft-opacity))`。
- **背景模糊**：`backdrop-filter: blur(12px)`，即便透明度降到 20%，下层窗口的高对比图案也不会干扰文字阅读。
- **文字与控制按钮**：`color: var(--ft-text-color)`，保持 100% 不透明显示。
- **边框与阴影**：`border: 1px solid rgba(255, 255, 255, 0.12); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25)`。

### 3.2 透明度调节交互
- 窗口右上角或悬浮设置抽屉提供滑动条（`10% ~ 100%`），拖动时实时改变 CSS 变量 `--ft-opacity`。
- 提供“极简无干扰模式”切换：隐藏顶栏与边框修饰，纯文字悬浮。

---

## 4. 参考 utools 插件特性的功能映射与增强

| 功能维度 | utools 原版实现 (`itldg/utools-suspension-text`) | 本插件设计方案（思源文档助手） |
| :--- | :--- | :--- |
| **内容来源** | 仅支持读取剪贴板内容或手动打字 | **多维数据源**：<br>1. 选中文本（实时读取编辑器选中字符或块）<br>2. 整篇文档（内核 `exportMdContent` 导出）<br>3. 浮窗内手动编辑与便签模式 |
| **字号缩放** | `Ctrl + 滚轮` 放大缩小 | **完全支持**：监听 `wheel` 事件结合 `ctrlKey`/`metaKey`，步进调节 `fontSize` 并持久化。 |
| **快捷退出** | 按 `Esc` 关闭窗口并暂存 | **完全支持**：按 `Esc` 关闭，且自动记忆最后一次关闭时的内容、窗口大小和位置。 |
| **尺寸记忆** | `localStorage` 记忆宽高与坐标 | **完全支持**：通过思源插件存储与 `localStorage` 双重持久化上次的 `width` 与 `height`。 |
| **样式与主题** | 自定义明暗背景色、系统深色模式 | **自适应思源**：自动检测并跟随思源当前的亮色/暗色主题（Daylight/Midnight），并允许用户覆盖。 |
| **内容渲染** | 仅纯文本 `<textarea>` | **增强特性**：支持一键切换“纯文本视图”与“Markdown 格式渲染视图”（支持加粗、代码块、待办列表等）。 |

---

## 5. 架构归属决策：集成到本插件 vs 独立插件

### 5.1 方案对比
- **集成到本插件（`siyuan-doc-assist`）**：
  - **优势**：直接复用现成的前端选区解析、上下文识别、右键菜单体系、i18n 国际化以及设置项管理；用户在使用文档助手提炼关键内容时，能一键悬浮对照，协同价值极高。
  - **设计原则**：严格做好模块解耦（将悬浮功能收敛在 `src/services/floating-text/` 与 `src/ui/floating-text/` 中），不与现有核心排版/清理模块硬耦合。
- **作为独立插件**：
  - **劣势**：多维护一套构建、测试、集市审核与发布流水线，且两套插件之间缺乏开箱即用的右键菜单与上下文协作。

### 5.2 决策结论
**采用“模块化解耦集成进本插件”策略**：
1. 本插件定位为“文档助手”，阅读辅助与悬浮比对是文档助手的天然场景扩展；
2. 架构上保持高内聚、零污染，代码结构独立，未来若有独立发布需求，可随时零成本剥离。

---

## 6. 完整功能设计与交互流程

### 6.1 功能入口
1. **Dock 面板“文档处理 - 整理”分类**：
   - 动作 Key：`float-selected-text`
   - 按钮名称：**悬浮选中文本**
   - 行为逻辑：
     - 优先获取当前 Protyle 编辑器中选中的文本；
     - 若未选中文本，自动降级为提取当前整篇文档的 Markdown 内容并悬浮展示；
     - 给出短消息提示（例如：“已悬浮选中文本”或“未选中文本，已自动悬浮整篇文档”）。
2. **右键菜单（Context Menu）**：
   - **选中文本右键菜单**（`open-menu-content`）：显示“📌 悬浮选中文本”。
   - **文档标题与文档树菜单**（`click-editortitleicon` / `open-menu-doctree`）：显示“📌 悬浮整篇文档”。
3. **插件命令面板**：
   - 注册统一命令 `悬浮选中文本`（可自由绑定全局快捷键）。
4. **设置面板**：
   - 在插件设置页新增“悬浮文本设置”模块：
     - 默认不透明度（10% ~ 100%，默认 85%）
     - 默认字号（12px ~ 32px，默认 15px）
     - 默认视图模式（纯文本 / Markdown 预览）
     - 窗口记忆开关（自动记忆宽高）

### 6.2 模块划分与代码架构

```text
src/
├── core/
│   └── floating-text-core.ts         // 纯函数：配置归一化、透明度计算、Markdown/纯文本过滤、快捷键判定
├── services/
│   └── floating-text/
│       ├── floating-text-service.ts  // 业务层：获取选区文本 / 整篇文档内容，调度浮窗
│       ├── floating-text-storage.ts  // 持久化：窗口尺寸、透明度、字号配置存取
│       └── floating-window-adapter.ts// 适配器：Document PiP 窗口管理与生命周期处理
├── ui/
│   ├── floating-text/
│   │   ├── floating-window.ts        // 浮窗 DOM 生成、样式注入与事件挂载
│   │   └── floating-window.scss      // 毛玻璃、半透明背景、响应式排版样式
│   ├── plugin-settings-floating.ts   // 插件设置面板的悬浮文本配置项
│   └── plugin-settings.ts            // 挂载设置面板
└── plugin/
    ├── action-definitions.ts         // 注册 float-selected-text 到 organize 组
    ├── action-runner-organize-handlers.ts // 整理分类动作处理器分发
    └── plugin-lifecycle-menu.ts      // 注册 open-menu-content 与文档右键菜单
```

---

## 7. 实施计划与验证标准

1. **Step 1: Core 模块与纯函数测试**：编写 `floating-text-core.ts` 及单元测试，覆盖配置边界、透明度换算、字号缩放。
2. **Step 2: 浮窗管理与 DOM 注入**：构建 `floating-window-adapter.ts`，打通 Document Picture-in-Picture 与样式注入。
3. **Step 3: Action 与菜单集成**：
   - 在 `action-definitions.ts` 注册 `float-selected-text`；
   - 在 `action-runner-organize-handlers.ts` 实现“有选区取选区，无选区取全文”逻辑；
   - 在 `plugin-lifecycle.ts` 增加 `open-menu-content`（选区右键）与 `click-editortitleicon`（文档右键）菜单注入。
4. **Step 4: 设置页集成与持久化**：新增透明度与字号等配置面板。
5. **Step 5: 严格验证**：
   - 运行全部 Vitest 单元测试；
   - 运行 TypeScript 严格类型检查 (`pnpm typecheck:strict`)；
   - 验证构建与打包输出。
