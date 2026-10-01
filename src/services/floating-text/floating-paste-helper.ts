/**
 * 系统按键与自动粘贴辅助工具
 * 当悬浮窗命中并选择文本、且开启了“浮窗命中文本直接粘贴”时，协助执行窗口失焦与系统级粘贴
 */

export function triggerSystemPaste(delayMs = 180): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const cp = (window as any).require?.("child_process");
    if (!cp || typeof cp.spawn !== "function") {
      return;
    }

    const platform = typeof process !== "undefined" ? process.platform : "";

    setTimeout(() => {
      try {
        if (platform === "win32") {
          // Windows: 使用 PowerShell 发送 Ctrl+V
          const child = cp.spawn(
            "powershell",
            [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; [System.Windows.Forms.SendKeys]::SendWait('^v')",
            ],
            { windowsHide: true }
          );
          child.on("error", (e: any) => {
            console.warn("[DocAssistant][FloatingText] Windows SendKeys error:", e);
          });
        } else if (platform === "darwin") {
          // macOS: 使用 AppleScript 发送 Cmd+V
          const child = cp.spawn("osascript", [
            "-e",
            'tell application "System Events" to keystroke "v" using command down',
          ]);
          child.on("error", (e: any) => {
            console.warn("[DocAssistant][FloatingText] macOS osascript error:", e);
          });
        } else if (platform === "linux") {
          // Linux: 使用 xdotool 发送 ctrl+v
          const child = cp.spawn("xdotool", ["key", "--clearmodifiers", "ctrl+v"]);
          child.on("error", (e: any) => {
            console.warn("[DocAssistant][FloatingText] Linux xdotool error:", e);
          });
        }
      } catch (innerErr) {
        console.warn("[DocAssistant][FloatingText] triggerSystemPaste execution warning:", innerErr);
      }
    }, Math.max(50, delayMs));
  } catch (err) {
    console.warn("[DocAssistant][FloatingText] triggerSystemPaste error:", err);
  }
}
