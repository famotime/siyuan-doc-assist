# 浮窗 IPC 通道实机验证清单

创建时间：`2026-11-15`
关联：`docs/state-machine-audit-followups.md` 第 4 节「`@electron/remote` 跨渲染进程调用宿主闭包对象是否可靠」。

## 背景结论（源码核实，2026-11-15）

对照 `D:\MyCodingProjects\siyuan-note` 源码取证：

1. **官方不使用 `@electron/remote`**：`app/src` 全库 0 处 import；历史上 v2.10.9 明确
   「Use ipcRenderer to replace @electron/remote」（issue #9368），官方跨窗口控制全部走
   `ipcRenderer.send(SIYUAN_CMD)` → 主进程命令表。
2. **官方只对自家窗口 enable remote**：`app/electron/window/openWindow.ts:144`、
   `mainWindow.ts:499`、`settingsWindows.ts:85`；没有 `web-contents-created` 全局 enable。
   插件窗口默认**不在** enable 列表内，`remote.enable` 是否能对插件新建的
   BrowserWindow 生效未经验证（且 adapter 里 `remote.enable` 取自 guest 模块，
   该方法只存在于 `@electron/remote/main`，大概率是 undefined 空操作）。
3. **`ipcRenderer.sendTo` 已死路**：Electron 28 移除（官方当前 Electron 44.10.0）。
   client script 的 `sendTo(targetHostWebContentsId, ...)` 恒不可用，回退的
   `ipc.send(channel)` 发给主进程且主进程无对应 handler，等于丢弃。
4. 因此浮窗子窗口**实际可依赖的通道只剩一条**：子窗口 `remote.getCurrentWindow()`
   拿到宿主 BrowserWindow 代理 → 直接调用 `__docAssistantHost.*` 闭包对象。
   这条路是否可用取决于子窗口的 remote 是否被 enable —— **必须实机验证**。

## 验证步骤（桌面端思源 + 已安装本插件）

前置：确认思源版本与 Electron 版本（开发者工具 Console 输入
`process.versions.electron`），记录到结果表。

### A. Electron 原生浮窗基础可用性

1. 选中文本 → 悬浮选中文本，确认浮窗以原生窗口打开（非 Dialog 降级）。
   - [ ] 通过
2. Console（子窗口）：`typeof window.require === "function"` —— 确认 nodeIntegration。
   - [ ] true / false：____

### B. 子窗口 remote 可用性（关键判据）

3. 子窗口 Console 依次执行：
   ```js
   var remote = window.require("@electron/remote");
   var win = remote.getCurrentWindow();
   console.log(!!win, win && win.__docAssistantHost ? "HOST-OK" : "HOST-MISSING");
   ```
   - [ ] `HOST-OK` → 闭包调用通道可用，现有实现可靠
   - [ ] `HOST-MISSING` 或 require 抛错 → remote 未 enable，**现有实现全断**，
         需要立即推进通道改造（见下节）
4. 若 `HOST-MISSING`，再试：
   ```js
   var main = window.require("@electron/remote/main");
   console.log(typeof main); // "object" 说明 guest 模块可加载
   ```
   记录结果：____

### C. 功能面回归（每项记录可用/不可用）

5. 置顶切换（点击 pin 按钮 / Alt+P）：窗口置顶状态是否真实变化？
   - [ ] 真置顶 / [ ] 仅 UI 翻转 / [ ] 无反应
6. 拖拽标题栏移动窗口（Electron 环境 `moveWindow` 路径）：
   - [ ] 可拖动 / [ ] 不可拖动
7. 修改字号/不透明度后重开浮窗，配置是否持久化：
   - [ ] 持久化 / [ ] 丢失
8. 「最小化并粘贴」（如有入口）：
   - [ ] 可用 / [ ] 不可用
9. 关闭浮窗再打开（先建后关逻辑）：是否出现双窗口/残留窗口？
   - [ ] 正常 / [ ] 异常

### D. 非 Electron 环境抽查（可选）

10. 浏览器访问思源 → Document PiP / window.open 浮窗：置顶按钮应已隐藏
    （2026-11-15 改造），Esc 关闭、复制、字号调节可用。
    - [ ] 正常

## 结果处理

- **B 步 `HOST-OK` 且 C 全部可用**：在 followups 文档把第 4 节该项定级为「已验证可靠」，
  sendTo 死路径可另行清理（顺手项）。
- **B 步 `HOST-MISSING` 或任一功能不可用**：通道改造立项。建议方案（按优先级）：
  1. 子窗口内 `window.require("@electron/remote/main").enable(webContents)`（若可加载）；
  2. 主进程中转：宿主通过 `ipcMain.on` 注册自定义 handler，子窗口 `ipcRenderer.send`，
     宿主用 `win.webContents.send` 回推（需与官方通道风格一致，工程量中等）；
  3. `MessageChannelMain` 直连（工程量大）。
