/**
 * 悬浮窗内置浏览器端脚本（client script）
 * 由 buildFloatingWindowClientScript 组装：注入初始状态的声明区（参数化插值）+ 无插值的脚本主体常量。
 * 原 floating-window-template.ts 内嵌脚本的纯字符串搬移，生成内容零改动。
 */

export type FloatingWindowClientScriptParams = {
  text: string;
  hostWebContentsId?: number | null;
  fontSize: number;
  opacity: number;
  fontSizeMin: number;
  fontSizeMax: number;
  /** 等价于 config.viewMode === "markdown" */
  isMarkdownView: boolean;
  autoPasteOnSelect: boolean;
  isDialogFallback: boolean;
  rememberSize: boolean;
};

const CLIENT_SCRIPT_BODY_PART1 = `          window.__docAssistantFloatingClientActive = true;
          function closeFloatingWindow() {
            if (isDialogFallback) {
              try {
                const evt = new CustomEvent("doc-assistant-floating-close", { bubbles: true, composed: true });
                document.dispatchEvent(evt);
              } catch (e) {}
              return;
            }

            try {
              if (window.__docAssistantHost && typeof window.__docAssistantHost.close === "function") {
                window.__docAssistantHost.close();
                return;
              }
            } catch (e) {}

            try {
              if (electronWin && typeof electronWin.close === "function") {
                electronWin.close();
                return;
              }
            } catch (e) {}

            try {
              const req = (typeof window !== "undefined" && window.require) || (typeof require === "function" ? require : null);
              if (req) {
                const elMod = req("electron");
                const ipc = elMod && elMod.ipcRenderer;
                if (ipc && typeof ipc.send === "function") {
                  ipc.send("siyuan-doc-assist-close-window");
                }
              }
            } catch (e) {}

            try {
              window.close();
            } catch (e) {}
          }
          const popoverEl = document.getElementById("ft-popover");
          const textView = document.getElementById("ft-text-view");
          const mdView = document.getElementById("ft-markdown-view");
          const pinBtn = document.getElementById("ft-btn-pin");
          const pinIconUse = document.querySelector("#ft-pin-icon use");
          const pinTooltip = document.getElementById("ft-pin-tooltip");
          let isPinned = true;
          const searchBtn = document.getElementById("ft-btn-search");
          const searchBarEl = document.getElementById("ft-search-bar");
          const searchInputEl = document.getElementById("ft-search-input");
          const searchCountEl = document.getElementById("ft-search-count");
          const searchClearBtn = document.getElementById("ft-search-clear");
          const searchCloseBtn = document.getElementById("ft-search-close");
          const searchResultsEl = document.getElementById("ft-search-results");
          let isSearchOpen = false;
          let currentMatchedCandidates = [];
          let selectedCandidateIndex = -1;

          const viewBtn = document.getElementById("ft-btn-view");
          const viewIconUse = document.querySelector("#ft-view-icon use");
          const viewTooltip = document.getElementById("ft-view-tooltip");
          const copyBtn = document.getElementById("ft-btn-copy");
          const copyIconUse = document.querySelector("#ft-copy-icon use");
          const copyTooltip = document.getElementById("ft-copy-tooltip");
          const settingsBtn = document.getElementById("ft-btn-settings");
          const closeBtn = document.getElementById("ft-btn-close");
          const slider = document.getElementById("ft-opacity-slider");
          const opacityLabel = document.getElementById("ft-opacity-label");
          const fontLabel = document.getElementById("ft-font-label");
          const fontIncBtn = document.getElementById("ft-font-inc");
          const fontDecBtn = document.getElementById("ft-font-dec");
          const wordCountEl = document.getElementById("ft-word-count");
          const toast = document.getElementById("ft-toast");

          let electron = null;
          let remote = null;
          let electronWin = null;
          let electronClipboard = null;

          function countWords(str) {
            if (!str) return 0;
            const cleaned = str.trim().replace(/\\s+/g, "");
            return cleaned.length;
          }

          function updateWordCount() {
            if (!wordCountEl) return;
            const text = getCurrentText();
            const len = countWords(text);
            if (len > 0) {
              wordCountEl.textContent = len + " 字";
              wordCountEl.style.display = "inline-block";
            } else {
              wordCountEl.textContent = "";
              wordCountEl.style.display = "none";
            }
          }

          function ensureImageSources(container) {
            if (!container) return;
            try {
              var imgs = container.querySelectorAll("img");
              for (var i = 0; i < imgs.length; i++) {
                var img = imgs[i];
                if (!img.getAttribute("src") && img.getAttribute("data-src")) {
                  img.setAttribute("src", img.getAttribute("data-src"));
                }
              }
            } catch (e) {}
          }

          ensureImageSources(mdView);
          updateWordCount();

          if (mdView) {
            mdView.addEventListener("click", function(e) {
              var target = e.target;
              if (target && target.tagName === "IMG") {
                target.classList.toggle("ft-img-expanded");
              }
            });
          }

          try {
            const req =
              (typeof window !== "undefined" && window.require) ||
              (typeof require === "function" ? require : null);
            if (req) {
              electron = req("electron");
              remote = req("@electron/remote") || (electron && electron.remote) || null;
            }
            if (remote && remote.getCurrentWindow) {
              electronWin = remote.getCurrentWindow();
            }
            if (electron && electron.clipboard) {
              electronClipboard = electron.clipboard;
            } else if (remote && remote.clipboard) {
              electronClipboard = remote.clipboard;
            }
          } catch (e) {
            console.warn("[DocAssistant][FloatingText] electron init warning:", e);
          }

          function fallbackExecCopy(str) {
            try {
              const ta = document.createElement("textarea");
              ta.value = str;
              ta.setAttribute("readonly", "");
              ta.style.position = "fixed";
              ta.style.left = "-9999px";
              ta.style.top = "0";
              ta.style.opacity = "0";
              document.body.appendChild(ta);
              ta.focus();
              ta.select();
              const ok = document.execCommand("copy");
              document.body.removeChild(ta);
              return Boolean(ok);
            } catch (err) {
              return false;
            }
          }

          function copyText(str) {
            if (electronClipboard && typeof electronClipboard.writeText === "function") {
              try {
                electronClipboard.writeText(str);
                return Promise.resolve(true);
              } catch (e) {}
            }

            const nav =
              (typeof window !== "undefined" && window.navigator) ||
              (typeof navigator !== "undefined" ? navigator : null);

            if (nav && nav.clipboard && typeof nav.clipboard.writeText === "function") {
              return nav.clipboard.writeText(str).then(function() {
                return true;
              }).catch(function() {
                return fallbackExecCopy(str);
              });
            }

            return Promise.resolve(fallbackExecCopy(str));
          }

          function saveConfig(patch) {
            if (!patch || typeof patch !== "object") return;

            // 1. Electron 原生环境：优先通过内置核心模块 electron.ipcRenderer 极速通知宿主主窗口
            try {
              const req =
                (typeof window !== "undefined" && window.require) ||
                (typeof require === "function" ? require : null);
              if (req) {
                const electronModule = req("electron");
                const ipc = electronModule && electronModule.ipcRenderer;
                if (ipc && typeof ipc.send === "function") {
                  // 单通道投递：sendTo 与 send 同时发会被宿主双路接收，导致配置双写。
                  if (typeof targetHostWebContentsId === "number" && typeof ipc.sendTo === "function") {
                    try {
                      ipc.sendTo(targetHostWebContentsId, "siyuan-doc-assist-save-floating-config", patch);
                    } catch (e) {
                      ipc.send("siyuan-doc-assist-save-floating-config", patch);
                    }
                  } else {
                    ipc.send("siyuan-doc-assist-save-floating-config", patch);
                  }
                }
              }
            } catch (ipcErr) {
              console.warn("[DocAssistant][FloatingText] IPC notification failed:", ipcErr);
            }

            // 2. 尝试调用 opener (如果是普通 window.open 弹出)
            try {
              if (window.opener && typeof window.opener.__saveDocAssistantFloatingConfig === "function") {
                window.opener.__saveDocAssistantFloatingConfig(patch);
              }
            } catch (openerErr) {}

            // 3. 尝试 BroadcastChannel (Web 同源环境)
            try {
              if (typeof BroadcastChannel !== "undefined") {
                const bc = new BroadcastChannel("siyuan-doc-assist-floating-channel");
                bc.postMessage({ type: "save-config", patch: patch });
                bc.close();
              }
            } catch (bcErr) {}

            // 4. 本地存储尝试写入（带异常保护）
            try {
              if (typeof localStorage !== "undefined" && localStorage && typeof localStorage.getItem === "function") {
                const raw = localStorage.getItem("doc-assistant.floating-text.config");
                const cur = raw ? JSON.parse(raw) : {};
                const next = Object.assign({}, cur, patch);
                localStorage.setItem("doc-assistant.floating-text.config", JSON.stringify(next));
              }
            } catch (e) {}

            // 5. 主进程跨窗口内存共享（若环境可用）
            try {
              if (remote && remote.process) {
                const curShared = remote.process.__siyuan_doc_assist_floating_config || {};
                remote.process.__siyuan_doc_assist_floating_config = Object.assign({}, curShared, patch);
              }
            } catch (e) {}

            // 6. Electron 磁盘 JSON 备份
            try {
              const req =
                (typeof window !== "undefined" && window.require) ||
                (typeof require === "function" ? require : null);
              if (req) {
                const fs = req("fs");
                const path = req("path");
                let userData = "";
                if (remote && remote.app && typeof remote.app.getPath === "function") {
                  try { userData = remote.app.getPath("userData"); } catch (e) {}
                }
                if (!userData && typeof process !== "undefined" && process.env) {
                  userData = process.env.APPDATA || process.env.HOME || "";
                }
                if (fs && path && userData) {
                  const cfgPath = path.join(userData, "siyuan-doc-assist-floating-config.json");
                  let diskData = {};
                  if (fs.existsSync(cfgPath)) {
                    try {
                      diskData = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
                    } catch (err) {}
                  }
                  const merged = Object.assign({}, diskData, patch);
                  fs.writeFileSync(cfgPath, JSON.stringify(merged, null, 2), "utf-8");
                }
              }
            } catch (fsErr) {
              console.warn("[DocAssistant][FloatingText] disk write failed:", fsErr);
            }
          }

          let toastTimer = null;
          function showToast(msg) {
            if (!toast) return;
            if (toastTimer) clearTimeout(toastTimer);
            toast.textContent = msg;
            toast.classList.add("ft-toast-show");
            toastTimer = setTimeout(function() {
              toast.classList.remove("ft-toast-show");
            }, 1500);
          }

          let copyFeedbackTimer = null;
          function triggerCopyFeedback(isPartial) {
            if (!copyBtn) return;
            copyBtn.classList.add("ft-btn-success");
            if (copyIconUse) {
              copyIconUse.setAttribute("href", "#ft-icon-check");
            }
            if (copyTooltip) {
              copyTooltip.innerHTML = (isPartial ? "已复制选中内容" : "已复制全部内容") + " ✓";
            }
            if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
            copyFeedbackTimer = setTimeout(function() {
              copyBtn.classList.remove("ft-btn-success");
              if (copyIconUse) {
                copyIconUse.setAttribute("href", "#ft-icon-copy");
              }
              if (copyTooltip) {
                copyTooltip.innerHTML = "复制全部内容 <kbd>Ctrl+C</kbd>";
              }
            }, 1500);
          }

          function updatePinUI() {
            if (pinBtn) {
              if (isPinned) {
                pinBtn.classList.add("ft-btn-active", "ft-btn-pinned");
                pinBtn.setAttribute("aria-label", "取消置顶");
              } else {
                pinBtn.classList.remove("ft-btn-active", "ft-btn-pinned");
                pinBtn.setAttribute("aria-label", "恢复置顶");
              }
            }
            if (pinIconUse) {
              pinIconUse.setAttribute("href", isPinned ? "#ft-icon-pin" : "#ft-icon-pin-off");
            }
            if (pinTooltip) {
              pinTooltip.innerHTML = (isPinned ? "取消置顶" : "恢复置顶") + " <kbd>Alt+P</kbd>";
            }
          }

          function setPinState(nextPinned) {
            isPinned = Boolean(nextPinned);
            updatePinUI();

            // 1. Electron 原生窗口置顶控制
            try {
              if (electronWin && typeof electronWin.setAlwaysOnTop === "function") {
                electronWin.setAlwaysOnTop(isPinned);
                if (isPinned) {
                  if (typeof electronWin.moveTop === "function") {
                    electronWin.moveTop();
                  }
                  if (typeof electronWin.focus === "function") {
                    electronWin.focus();
                  }
                }
              }
            } catch (err) {
              console.warn("[DocAssistant][FloatingText] electron setAlwaysOnTop failed:", err);
            }

            // 2. 宿主对象代理设置（双重保障）
            try {
              if (window.__docAssistantHost && typeof window.__docAssistantHost.setAlwaysOnTop === "function") {
                window.__docAssistantHost.setAlwaysOnTop(isPinned);
              }
            } catch (err) {}

            // 3. IPC 广播消息通知
            try {
              const req =
                (typeof window !== "undefined" && window.require) ||
                (typeof require === "function" ? require : null);
              if (req) {
                const electronModule = req("electron");
                const ipc = electronModule && electronModule.ipcRenderer;
                if (ipc && typeof ipc.send === "function") {
                  if (typeof targetHostWebContentsId === "number" && typeof ipc.sendTo === "function") {
                    try {
                      ipc.sendTo(targetHostWebContentsId, "siyuan-doc-assist-set-always-on-top", isPinned);
                    } catch (e) {
                      ipc.send("siyuan-doc-assist-set-always-on-top", isPinned);
                    }
                  } else {
                    ipc.send("siyuan-doc-assist-set-always-on-top", isPinned);
                  }
                }
              }
            } catch (ipcErr) {}

            showToast(isPinned ? "已恢复置顶" : "已取消置顶");
          }

          function togglePinState() {
            setPinState(!isPinned);
          }

          function updateFontSize(size) {
            size = Math.max(fontSizeMin, Math.min(fontSizeMax, size));
            currentFontSize = size;
            if (appEl) appEl.style.setProperty("--ft-font-size", size + "px");
            if (fontLabel) fontLabel.textContent = size + "px";
            saveConfig({ fontSize: size });
          }

          function updateOpacity(op) {
            if (appEl) appEl.style.setProperty("--ft-opacity", String(op));
            if (opacityLabel) opacityLabel.textContent = Math.round(op * 100) + "%";
            saveConfig({ opacity: op });
          }

          function getSelectedText() {
            try {
              const sel = window.getSelection ? window.getSelection() : null;
              if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
                return "";
              }
              return sel.toString();
            } catch (e) {
              return "";
            }
          }

          function stripKramdown(str) {
            if (!str) return "";
            var LF = String.fromCharCode(10);
            var CR = String.fromCharCode(13);
            var clean = str.split(CR + LF).join(LF).split(CR).join(LF);
            var lines = clean.split(LF);
            var res = [];
            for (var i = 0; i < lines.length; i++) {
              var l = lines[i];
              if (l.indexOf("{:") === -1) {
                res.push(l);
              } else {
                var cleaned = l.replace(new RegExp(String.fromCharCode(123) + ":[^}]*" + String.fromCharCode(125), "g"), "");
                if (cleaned.trim() || !l.trim()) {
                  res.push(cleaned);
                }
              }
            }
            return res.join(LF);
          }

          function renderMarkdown(md) {
            if (!md) return "";
            var clean = stripKramdown(md);
            // 1. 优先使用内置 marked 引擎解析（完整支持表格、多级列表、代码块、水平线等）
            try {
              var m = (typeof window !== "undefined" && window.marked) || (typeof marked !== "undefined" ? marked : null);
              if (m) {
                if (typeof m.parse === "function") {
                  return m.parse(clean, { gfm: true, breaks: true, async: false });
                }
                if (typeof m === "function") {
                  return m(clean, { gfm: true, breaks: true, async: false });
                }
              }
            } catch (markedErr) {
              console.warn("[DocAssistant][FloatingText] marked parse failed:", markedErr);
            }

            // 2. 终极降级：内置增强的 simpleMarkdownToHtml
            return simpleMarkdownToHtml(clean);
          }

          function toggleViewMode() {
            if (isSearchOpen) {
              closeSearchBar();
            }
            isMarkdown = !isMarkdown;
            if (viewIconUse) {
              viewIconUse.setAttribute("href", isMarkdown ? "#ft-icon-text" : "#ft-icon-preview");
            }
            if (viewTooltip) {
              viewTooltip.innerHTML = (isMarkdown ? "切换源码编辑" : "切换 Markdown 预览") + " <kbd>Ctrl+M</kbd>";
            }

            if (isMarkdown) {
              if (mdView) {
                var curText = getCurrentText();
                var LF = String.fromCharCode(10);
                var CR = String.fromCharCode(13);
                var normCur = (curText || "").split(CR + LF).join(LF).split(CR).join(LF);
                var normLast = (lastRenderedText || "").split(CR + LF).join(LF).split(CR).join(LF);
                if (normCur !== normLast || !mdView.innerHTML.trim()) {
                  var renderedHtml = renderMarkdown(curText);
                  mdView.innerHTML = renderedHtml;
                  lastRenderedText = curText;
                  ensureImageSources(mdView);
                }
              }
              if (textView) textView.style.display = "none";
              if (mdView) mdView.style.display = "block";
            } else {
              if (textView) {
                textView.style.display = "block";
                textView.focus();
              }
              if (mdView) mdView.style.display = "none";
            }
            saveConfig({ viewMode: isMarkdown ? "markdown" : "text" });
          }

          function closePopover() {
            if (popoverEl) popoverEl.classList.remove("ft-popover-open");
            if (settingsBtn) settingsBtn.classList.remove("ft-btn-active");
          }

          function stripLeadingPrefixes(raw) {
            if (!raw) return "";
            var str = raw.replace(/\\{:[^}]*\\}/g, "");
            var prev = "";
            var guard = 0;
            while (str !== prev && guard < 10) {
              prev = str;
              guard++;
              str = str.replace(/^[\\s\\t]+/, "");
              var quoteMatch = str.match(/^>+\\s*/);
              if (quoteMatch) {
                str = str.slice(quoteMatch[0].length);
                continue;
              }
              var headingMatch = str.match(/^#{1,6}\\s+/);
              if (headingMatch) {
                str = str.slice(headingMatch[0].length);
                continue;
              }
              var todoMatch = str.match(/^(?:[-*+]\\s+)?\\[([ xX])\\]\\s*/);
              if (todoMatch) {
                str = str.slice(todoMatch[0].length);
                continue;
              }
              var unorderedMatch = str.match(/^[-*+]\\s+/);
              if (unorderedMatch) {
                str = str.slice(unorderedMatch[0].length);
                continue;
              }
              var orderedMatch = str.match(/^\\d+[\\.\\)､、]\\s*/);
              if (orderedMatch) {
                str = str.slice(orderedMatch[0].length);
                continue;
              }
            }
            return str.trim();
          }

          function parseCandidates(str) {
            if (!str) return [];
            var LF = String.fromCharCode(10);
            var CR = String.fromCharCode(13);
            var clean = str.split(CR + LF).join(LF).split(CR).join(LF);
            var lines = clean.split(LF);
            var res = [];
            var id = 1;
            for (var i = 0; i < lines.length; i++) {
              var raw = lines[i];
              var cleaned = stripLeadingPrefixes(raw);
              if (!cleaned) continue;
              res.push({
                id: id++,
                line: i + 1,
                rawText: raw,
                displayText: cleaned,
                cleanText: cleaned,
              });
            }
            return res;
          }

          function escapeHtmlText(s) {
            if (!s) return "";
            return s
              .split("&").join("&amp;")
              .split("<").join("&lt;")
              .split(">").join("&gt;")
              .split('"').join("&quot;")
              .split("'").join("&#39;");
          }

          function highlightKeywords(text, keywords) {
            if (!text) return "";
            if (!keywords || keywords.length === 0) return escapeHtmlText(text);
            var escapedKws = [];
            // 反斜杠必须最先转义，否则先转义产生的 "\." 会被二次转义破坏（见 floating-window-search-parity 测试）
            var specialChars = ["\\\\", ".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]"];
            for (var i = 0; i < keywords.length; i++) {
              var curKw = keywords[i];
              for (var sc = 0; sc < specialChars.length; sc++) {
                curKw = curKw.split(specialChars[sc]).join("\\\\" + specialChars[sc]);
              }
              escapedKws.push(curKw);
            }
            var pattern = "(" + escapedKws.join("|") + ")";
            var regex = new RegExp(pattern, "gi");
            var parts = text.split(regex);
            var out = [];
            for (var j = 0; j < parts.length; j++) {
              var p = parts[j];
              var lowerP = p.toLowerCase();
              var isHit = false;
              for (var k = 0; k < keywords.length; k++) {
                if (keywords[k] === lowerP) {
                  isHit = true;
                  break;
                }
              }
              if (isHit) {
                out.push('<mark class="ft-search-highlight">' + escapeHtmlText(p) + "</mark>");
              } else {
                out.push(escapeHtmlText(p));
              }
            }
            return out.join("");
          }

          function openSearchBar() {
            isSearchOpen = true;
            if (searchBarEl) searchBarEl.style.display = "flex";
            if (searchBtn) searchBtn.classList.add("ft-btn-active");
            if (searchInputEl) {
              searchInputEl.focus();
              searchInputEl.select();
            }
            executeSearch();
          }

          function closeSearchBar() {
            isSearchOpen = false;
            if (searchBarEl) searchBarEl.style.display = "none";
            if (searchBtn) searchBtn.classList.remove("ft-btn-active");
            if (searchResultsEl) searchResultsEl.style.display = "none";
            if (isMarkdown) {
              if (mdView) mdView.style.display = "block";
              if (textView) textView.style.display = "none";
            } else {
              if (textView) textView.style.display = "block";
              if (mdView) mdView.style.display = "none";
            }
          }

          function toggleSearchBar() {
            if (isSearchOpen) {
              closeSearchBar();
            } else {
              openSearchBar();
            }
          }

          function requestAutoPaste() {
            var realPinned = Boolean(isPinned);
            if (electronWin && typeof electronWin.isAlwaysOnTop === "function") {
              try {
                realPinned = Boolean(electronWin.isAlwaysOnTop());
              } catch (e) {}
            }
            var pastePayload = { isPinned: realPinned, delayMs: realPinned ? 260 : 180 };
            var handled = false;

            if (realPinned) {
              try {
                if (document.activeElement && typeof document.activeElement.blur === "function") {
                  document.activeElement.blur();
                }
                if (typeof window.blur === "function") {
                  window.blur();
                }
                if (electronWin && typeof electronWin.setAlwaysOnTop === "function") {
                  electronWin.setAlwaysOnTop(true);
                }
              } catch (e) {}
            }

            var hostObj =
              (typeof window !== "undefined" && window.__docAssistantHost) ||
              (electronWin && electronWin.__docAssistantHost) ||
              null;

            if (hostObj && typeof hostObj.minimizeAndPaste === "function") {
              try {
                hostObj.minimizeAndPaste(pastePayload);
                handled = true;
              } catch (e) {}
            }
            if (!handled) {
              try {
                const req =
                  (typeof window !== "undefined" && window.require) ||
                  (typeof require === "function" ? require : null);
                if (req) {
                  const elMod = req("electron");
                  const ipc = elMod && elMod.ipcRenderer;
                  if (ipc && typeof ipc.send === "function") {
                    if (typeof targetHostWebContentsId === "number" && typeof ipc.sendTo === "function") {
                      try {
                        ipc.sendTo(targetHostWebContentsId, "siyuan-doc-assist-minimize-and-paste", pastePayload);
                      } catch (e) {
                        ipc.send("siyuan-doc-assist-minimize-and-paste", pastePayload);
                      }
                    } else {
                      ipc.send("siyuan-doc-assist-minimize-and-paste", pastePayload);
                    }
                    handled = true;
                  }
                }
              } catch (e) {}
            }
            if (!handled) {
              if (realPinned) {
                if (electronWin && typeof electronWin.blur === "function") {
                  try {
                    electronWin.blur();
                  } catch (e) {}
                }
              } else {
                if (electronWin && typeof electronWin.minimize === "function") {
                  try {
                    electronWin.minimize();
                  } catch (e) {}
                }
              }
            }
          }

          function selectCandidate(rawText) {
            if (typeof rawText !== "string") return;
            var cleanText = stripLeadingPrefixes(rawText);
            var textToCopy = cleanText || rawText.trim();
            if (!textToCopy) return;
            copyText(textToCopy).then(function(ok) {
              if (!ok) return;
              if (autoPasteOnSelect) {
                showToast("已复制并自动粘贴");
                requestAutoPaste();
              } else {
                showToast("已复制到剪贴板");
              }
            });
          }

          function updateCandidateSelection(index) {
            if (!searchResultsEl) return;
            var items = searchResultsEl.querySelectorAll(".ft-search-item");
            if (items.length === 0) {
              selectedCandidateIndex = -1;
              return;
            }
            selectedCandidateIndex = Math.max(0, Math.min(items.length - 1, index));
            for (var i = 0; i < items.length; i++) {
              var el = items[i];
              if (i === selectedCandidateIndex) {
                el.classList.add("is-selected");
                if (typeof el.scrollIntoView === "function") {
                  try { el.scrollIntoView({ block: "nearest" }); } catch (e) {}
                }
              } else {
                el.classList.remove("is-selected");
              }
            }
          }

          function executeSearch() {
            if (!searchInputEl || !searchResultsEl) return;
            var query = (searchInputEl.value || "").trim();
            if (!query) {
              if (searchClearBtn) searchClearBtn.style.display = "none";
              if (searchCountEl) searchCountEl.style.display = "none";
              searchResultsEl.style.display = "none";
              currentMatchedCandidates = [];
              selectedCandidateIndex = -1;
              if (isMarkdown) {
                if (mdView) mdView.style.display = "block";
                if (textView) textView.style.display = "none";
              } else {
                if (textView) textView.style.display = "block";
                if (mdView) mdView.style.display = "none";
              }
              return;
            }

            if (searchClearBtn) searchClearBtn.style.display = "inline-flex";

            var curText = getCurrentText() || originalText;
            var allCandidates = parseCandidates(curText);
            var keywords = query.toLowerCase().split(/\\s+/).filter(Boolean);

            var matched = allCandidates.filter(function(item) {
              var target = (item.cleanText || item.displayText || item.rawText).toLowerCase();
              return keywords.every(function(kw) {
                return target.indexOf(kw) !== -1;
              });
            });

            currentMatchedCandidates = matched;

            if (searchCountEl) {
              searchCountEl.style.display = "inline-block";
              searchCountEl.textContent = matched.length + " 项";
            }

            if (textView) textView.style.display = "none";
            if (mdView) mdView.style.display = "none";
            searchResultsEl.style.display = "flex";

            if (matched.length === 0) {
              searchResultsEl.innerHTML = '<div class="ft-search-empty">未找到匹配的内容</div>';
              selectedCandidateIndex = -1;
              return;
            }

            var html = "";
            for (var i = 0; i < matched.length; i++) {
              var item = matched[i];
              var isSel = i === 0 ? " is-selected" : "";
              var highlighted = highlightKeywords(item.displayText, keywords);
              html += '<div class="ft-search-item' + isSel + '" data-index="' + i + '" title="点击或按 Enter 复制">' +
                '<span class="ft-search-item-line">L' + item.line + '</span>' +
                '<span class="ft-search-item-text">' + highlighted + '</span>' +
                '<span class="ft-search-item-action">复制 ↵</span>' +
                '</div>';
            }

            searchResultsEl.innerHTML = html;
            selectedCandidateIndex = 0;
            searchResultsEl.scrollTop = 0;
          }

          if (searchBtn) {
            searchBtn.addEventListener("click", toggleSearchBar);
          }
          if (searchCloseBtn) {
            searchCloseBtn.addEventListener("click", closeSearchBar);
          }
          if (searchClearBtn) {
            searchClearBtn.addEventListener("click", function() {
              if (searchInputEl) {
                searchInputEl.value = "";
                searchInputEl.focus();
                executeSearch();
              }
            });
          }
          if (searchInputEl) {
            searchInputEl.addEventListener("input", executeSearch);
            searchInputEl.addEventListener("keydown", function(e) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (currentMatchedCandidates.length > 0) {
                  updateCandidateSelection((selectedCandidateIndex + 1) % currentMatchedCandidates.length);
                }
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (currentMatchedCandidates.length > 0) {
                  updateCandidateSelection((selectedCandidateIndex - 1 + currentMatchedCandidates.length) % currentMatchedCandidates.length);
                }
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (selectedCandidateIndex >= 0 && selectedCandidateIndex < currentMatchedCandidates.length) {
                  var targetCandidate = currentMatchedCandidates[selectedCandidateIndex];
                  selectCandidate(targetCandidate.cleanText || targetCandidate.displayText || targetCandidate.rawText);
                }
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                if (searchInputEl.value) {
                  searchInputEl.value = "";
                  executeSearch();
                } else {
                  closeSearchBar();
                }
              }
            });
          }

          if (searchResultsEl) {
            function findSearchItem(target) {
              var cur = target;
              while (cur && cur !== searchResultsEl) {
                if (cur.classList && cur.classList.contains("ft-search-item")) {
                  return cur;
                }
                cur = cur.parentElement;
              }
              return null;
            }

            searchResultsEl.addEventListener("click", function(e) {
              var item = findSearchItem(e.target);
              if (!item) return;
              var idx = parseInt(item.getAttribute("data-index"), 10);
              if (!isNaN(idx) && idx >= 0 && idx < currentMatchedCandidates.length) {
                updateCandidateSelection(idx);
                var targetCandidate = currentMatchedCandidates[idx];
                selectCandidate(targetCandidate.cleanText || targetCandidate.displayText || targetCandidate.rawText);
              }
            });

            searchResultsEl.addEventListener("mouseover", function(e) {
              var item = findSearchItem(e.target);
              if (!item) return;
              var idx = parseInt(item.getAttribute("data-index"), 10);
              if (!isNaN(idx) && idx >= 0 && idx < currentMatchedCandidates.length) {
                if (idx !== selectedCandidateIndex) {
                  selectedCandidateIndex = idx;
                  var allItems = searchResultsEl.querySelectorAll(".ft-search-item");
                  for (var i = 0; i < allItems.length; i++) {
                    if (i === idx) allItems[i].classList.add("is-selected");
                    else allItems[i].classList.remove("is-selected");
                  }
                }
              }
            });
          }

          document.addEventListener("click", function(e) {
            if (!popoverEl || !popoverEl.classList.contains("ft-popover-open")) return;
            var target = e.target;
            if (!popoverEl.contains(target) && (!settingsBtn || !settingsBtn.contains(target))) {
              closePopover();
            }
          });

          document.addEventListener("keydown", function(e) {
            if (e.key === "Escape") {
              if (isSearchOpen) {
                if (searchInputEl && searchInputEl.value) {
                  searchInputEl.value = "";
                  executeSearch();
                } else {
                  closeSearchBar();
                }
                return;
              }
              if (popoverEl && popoverEl.classList.contains("ft-popover-open")) {
                closePopover();
                return;
              }
              closeFloatingWindow();
              return;
            }

            if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
              e.preventDefault();
              openSearchBar();
              return;
            }

            if ((e.ctrlKey || e.metaKey) && (e.key === "m" || e.key === "M")) {
              e.preventDefault();
              toggleViewMode();
              return;
            }

            if ((e.altKey && (e.key === "p" || e.key === "P")) || ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "p" || e.key === "P"))) {
              // PiP/popup 无置顶按钮（无法真正置顶），快捷键同步隐藏，避免假状态机
              if (pinBtn) {
                e.preventDefault();
                togglePinState();
                return;
              }
            }

            if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
              const selected = getSelectedText();
              if (selected && selected.trim().length > 0) {
                e.preventDefault();
                copyText(selected).then(function(ok) {
                  if (ok) {
                    triggerCopyFeedback(true);
                  }
                });
              }
            }
          });

          document.addEventListener("wheel", function(e) {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              const delta = e.deltaY < 0 ? 1 : -1;
              updateFontSize(currentFontSize + delta);
            }
          }, { passive: false });

          function getCurrentText() {
            if (!textView) return "";
            var val = textView.innerText;
            if (typeof val === "string" && (val.length > 0 || textView.style.display !== "none")) {
              return val;
            }
            return textView.textContent || "";
          }

          function renderInline(str) {
            let res = str.split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
            res = res.replace(/\\x60([^\\x60]+)\\x60/g, '<code class="ft-inline-code">$1</code>');
            res = res.replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>");
            res = res.replace(/\\*([^*]+)\\*/g, "<em>$1</em>");
            res = res.replace(/~~([^~]+)~~/g, "<del>$1</del>");
            res = res.replace(/==([^=]+)==/g, "<mark>$1</mark>");
            res = res.replace(/!\\[([^\\]]*)\\]\\(([^)]+)\\)/g, '<img src="$2" alt="$1" class="ft-image" loading="lazy" />');
            res = res.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
            return res;
          }

          function simpleMarkdownToHtml(md) {
            if (!md) return "";
            const LF = String.fromCharCode(10);
            const CR = String.fromCharCode(13);
            const lines = md.split(LF);
            const parts = [];
            let inCode = false;
            let codeLines = [];
            let codeLang = "";
            let currentListMode = "none";

            function closeList() {
              if (currentListMode === "ul") {
                parts.push("</ul>");
                currentListMode = "none";
              } else if (currentListMode === "ol") {
                parts.push("</ol>");
                currentListMode = "none";
              }
            }

            for (let i = 0; i < lines.length; i++) {
              let line = lines[i];
              if (line.endsWith(CR)) line = line.slice(0, -1);
              const trimmed = line.trim();

              if (trimmed.startsWith("\\x60\\x60\\x60")) {
                closeList();
                if (!inCode) {
                  inCode = true;
                  codeLang = trimmed.slice(3).trim();
                  codeLines = [];
                } else {
                  inCode = false;
                  const codeEsc = codeLines.join(LF).split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
                  parts.push('<pre class="ft-code-block"><code class="language-' + codeLang + '">' + codeEsc + '</code></pre>');
                }
                continue;
              }

              if (inCode) {
                codeLines.push(line);
                continue;
              }

              if (!trimmed) {
                closeList();
                parts.push('<div class="ft-blank-line"></div>');
                continue;
              }

              // 水平分割线
              if (new RegExp("^(?:---+|\\*\\*\\*+|___+)\\s*$").test(trimmed)) {
                closeList();
                parts.push('<hr class="ft-hr" />');
                continue;
              }

              // 标题
              if (trimmed.startsWith("#")) {
                closeList();
                let level = 0;
                while (level < 6 && trimmed.charAt(level) === "#") level++;
                if (level > 0 && (trimmed.charAt(level) === " " || trimmed.charAt(level) === "\\t")) {
                  parts.push('<h' + level + ' class="ft-h' + level + '">' + renderInline(trimmed.slice(level).trim()) + '</h' + level + '>');
                  continue;
                }
              }

              // 待办项
              if (trimmed.startsWith("- [ ] ") || trimmed.startsWith("- [x] ") || trimmed.startsWith("- [X] ")) {
                closeList();
                const isChecked = trimmed.startsWith("- [x] ") || trimmed.startsWith("- [X] ");
                parts.push('<div class="ft-todo-item"><input type="checkbox" disabled ' + (isChecked ? "checked" : "") + '/> <span>' + renderInline(trimmed.slice(6)) + '</span></div>');
                continue;
              }

              // 无序列表
              if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("+ ")) {
                if (currentListMode === "ol") {
                  parts.push("</ol>");
                  currentListMode = "none";
                }
                if (currentListMode !== "ul") {
                  parts.push('<ul class="ft-ul">');
                  currentListMode = "ul";
                }
                parts.push('<li class="ft-list-item">' + renderInline(trimmed.slice(2)) + '</li>');
                continue;
              }

              // 有序列表
              const dotIdx = trimmed.indexOf(". ");
              if (dotIdx > 0 && !isNaN(Number(trimmed.slice(0, dotIdx)))) {
                if (currentListMode === "ul") {
                  parts.push("</ul>");
                  currentListMode = "none";
                }
                if (currentListMode !== "ol") {
                  parts.push('<ol class="ft-ol">');
                  currentListMode = "ol";
                }
                parts.push('<li class="ft-list-item ft-list-item-ordered">' + renderInline(trimmed.slice(dotIdx + 2)) + '</li>');
                continue;
              }

              // 引用块
              if (trimmed.startsWith(">")) {
                closeList();
                parts.push('<blockquote class="ft-blockquote">' + renderInline(trimmed.slice(1).trim()) + '</blockquote>');
                continue;
              }

              closeList();
              parts.push('<p class="ft-p">' + renderInline(line) + '</p>');
            }

            closeList();

            if (inCode && codeLines.length) {
              const codeEsc = codeLines.join(LF).split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
              parts.push('<pre class="ft-code-block"><code>' + codeEsc + '</code></pre>');
            }

            return parts.join(LF);
          }

          if (textView) {
            textView.addEventListener("input", function() {
              updateWordCount();
            });

            textView.addEventListener("paste", function(e) {
              e.preventDefault();
              const clipText = (e.clipboardData || window.clipboardData)?.getData("text/plain") || "";
              if (document.queryCommandSupported && document.queryCommandSupported("insertText")) {
                document.execCommand("insertText", false, clipText);
              } else {
                const sel = window.getSelection ? window.getSelection() : null;
                if (sel && sel.rangeCount > 0) {
                  const range = sel.getRangeAt(0);
                  range.deleteContents();
                  range.insertNode(document.createTextNode(clipText));
                  range.collapse(false);
                }
              }
              updateWordCount();
            });
          }

          if (closeBtn) {
            closeBtn.addEventListener("click", function(e) {
              if (e) {
                e.preventDefault();
                e.stopPropagation();
              }
              closeFloatingWindow();
            });
          }

          if (copyBtn) {
            copyBtn.addEventListener("mousedown", function(e) {
              e.preventDefault();
            });

            copyBtn.addEventListener("click", function() {
              const selected = getSelectedText();
              const hasSelection = Boolean(selected && selected.trim().length > 0);
              const target = hasSelection ? selected : getCurrentText();

              copyText(target).then(function(ok) {
                if (ok) {
                  triggerCopyFeedback(hasSelection);
                } else {
                  showToast("复制失败");
                }
              });
            });
          }

          if (pinBtn) {
            pinBtn.addEventListener("click", function() {
              togglePinState();
            });
          }

          if (viewBtn) {
            viewBtn.addEventListener("click", function() {
              toggleViewMode();
            });
          }

          if (settingsBtn && popoverEl) {
            settingsBtn.addEventListener("click", function(e) {
              e.stopPropagation();
              popoverEl.classList.toggle("ft-popover-open");
              settingsBtn.classList.toggle("ft-btn-active");
            });
          }

          let opacityDebounceTimer = null;
          if (slider) {
            slider.addEventListener("input", function() {
              const val = parseInt(slider.value, 10);
              const op = val / 100;
              if (appEl) appEl.style.setProperty("--ft-opacity", String(op));
              if (opacityLabel) opacityLabel.textContent = val + "%";
              if (opacityDebounceTimer) clearTimeout(opacityDebounceTimer);
              opacityDebounceTimer = setTimeout(function() {
                saveConfig({ opacity: op });
              }, 200);
            });
            slider.addEventListener("change", function() {
              if (opacityDebounceTimer) clearTimeout(opacityDebounceTimer);
              const val = parseInt(slider.value, 10);
              updateOpacity(val / 100);
            });
          }

          if (fontDecBtn) {
            fontDecBtn.addEventListener("click", function() {
              updateFontSize(currentFontSize - 1);
            });
          }
          if (fontIncBtn) {
            fontIncBtn.addEventListener("click", function() {
              updateFontSize(currentFontSize + 1);
            });
          }
`;

const CLIENT_SCRIPT_BODY_PART2 = `          let resizeTimer = null;
          window.addEventListener("resize", function() {
            if (!shouldRememberSize) return;
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function() {
              saveConfig({
                width: window.innerWidth,
                height: window.innerHeight,
              });
            }, 300);
          });

          // 标题栏鼠标拖动增强与多环境兜底 (仅在独立原生窗口/Web弹出窗下启用，应用内Dialog由宿主思源接管)
          const headerEl = document.querySelector(".ft-header");
          const actionsEl = document.querySelector(".ft-actions");
          if (headerEl && !isDialogFallback) {
            let isDragging = false;
            let startMouseX = 0;
            let startMouseY = 0;
            let startWinX = 0;
            let startWinY = 0;
            let hasMoved = false;

            function getWindowPosition() {
              if (electronWin && typeof electronWin.getPosition === "function") {
                try {
                  const pos = electronWin.getPosition();
                  if (Array.isArray(pos) && pos.length >= 2) return [pos[0], pos[1]];
                } catch (e) {}
              }
              if (window.__docAssistantHost && typeof window.__docAssistantHost.getPosition === "function") {
                try {
                  const pos = window.__docAssistantHost.getPosition();
                  if (Array.isArray(pos) && pos.length >= 2) return [pos[0], pos[1]];
                } catch (e) {}
              }
              const sx = typeof window.screenX === "number" ? window.screenX : 0;
              const sy = typeof window.screenY === "number" ? window.screenY : 0;
              return [sx, sy];
            }

            function setWindowPosition(x, y) {
              const rx = Math.round(x);
              const ry = Math.round(y);
              let moved = false;
              if (electronWin && typeof electronWin.setPosition === "function") {
                try {
                  if (typeof electronWin.setBounds === "function" && typeof electronWin.getSize === "function") {
                    var winSize = electronWin.getSize();
                    electronWin.setBounds({ x: rx, y: ry, width: winSize[0], height: winSize[1] });
                  } else {
                    electronWin.setPosition(rx, ry);
                  }
                  moved = true;
                } catch (e) {}
              }
              if (!moved && window.__docAssistantHost && typeof window.__docAssistantHost.setPosition === "function") {
                try {
                  window.__docAssistantHost.setPosition(rx, ry);
                  moved = true;
                } catch (e) {}
              }
              if (!moved) {
                try {
                  const req = (typeof window !== "undefined" && window.require) || (typeof require === "function" ? require : null);
                  if (req) {
                    const elMod = req("electron");
                    const ipc = elMod && elMod.ipcRenderer;
                    if (ipc && typeof ipc.send === "function") {
                      if (typeof targetHostWebContentsId === "number" && typeof ipc.sendTo === "function") {
                        ipc.sendTo(targetHostWebContentsId, "siyuan-doc-assist-move-window", { x: rx, y: ry });
                      } else {
                        ipc.send("siyuan-doc-assist-move-window", { x: rx, y: ry });
                      }
                      moved = true;
                    }
                  }
                } catch (e) {}
              }
              if (!moved && typeof window.moveTo === "function") {
                try {
                  window.moveTo(rx, ry);
                } catch (e) {}
              }
            }

            function onMouseMove(e) {
              if (!isDragging) return;
              const dx = e.screenX - startMouseX;
              const dy = e.screenY - startMouseY;
              if (!hasMoved && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
                hasMoved = true;
                if (appEl) appEl.classList.add("is-dragging");
              }
              if (hasMoved) {
                setWindowPosition(startWinX + dx, startWinY + dy);
              }
            }

            function onMouseUp(e) {
              if (!isDragging) return;
              isDragging = false;
              document.removeEventListener("mousemove", onMouseMove, true);
              document.removeEventListener("mouseup", onMouseUp, true);
              if (appEl) appEl.classList.remove("is-dragging");
              if (hasMoved) {
                e.preventDefault();
                e.stopPropagation();
              }
            }

            headerEl.addEventListener("mousedown", function(e) {
              if (e.button !== 0) return;
              if (actionsEl && actionsEl.contains(e.target)) return;

              // 立即主动获取窗口焦点，避免在非激活状态下首击拖拽被 Windows 系统吞噬
              try {
                if (electronWin && typeof electronWin.focus === "function") {
                  electronWin.focus();
                } else if (window.__docAssistantHost && typeof window.__docAssistantHost.focus === "function") {
                  window.__docAssistantHost.focus();
                }
                window.focus();
              } catch (focusErr) {}

              // 若处于原生 Electron 窗口环境，-webkit-app-region: drag 已由操作系统底层原生驱动拖拽，
              // 禁止同时在 JS mousemove 中高频调用 setPosition，避免在 Windows 125%/150% 等高 DPI 缩放下
              // 触发 Electron 底层尺寸跳变与系统 Aero Snap 贴靠冲突，导致横向宽度自动扩大。
              var hasNativeAppRegionDrag = Boolean(
                (electronWin || window.__docAssistantHost) &&
                window.getComputedStyle &&
                window.getComputedStyle(headerEl).webkitAppRegion === "drag"
              );
              if (hasNativeAppRegionDrag) {
                return;
              }

              isDragging = true;
              hasMoved = false;
              startMouseX = e.screenX;
              startMouseY = e.screenY;
              const [curX, curY] = getWindowPosition();
              startWinX = curX;
              startWinY = curY;

              document.addEventListener("mousemove", onMouseMove, true);
              document.addEventListener("mouseup", onMouseUp, true);
            });

            // 异常出口：窗口失焦（拖到窗外松键、Alt+Tab）时鼠标可能收不到 mouseup，
            // 不复位会让 isDragging 永久卡住，鼠标再进入窗口后未按键也会拖走窗口。
            window.addEventListener("blur", function() {
              if (!isDragging) return;
              isDragging = false;
              document.removeEventListener("mousemove", onMouseMove, true);
              document.removeEventListener("mouseup", onMouseUp, true);
              if (appEl) appEl.classList.remove("is-dragging");
            });
          }
        })();`;
export function buildFloatingWindowClientScript(params: FloatingWindowClientScriptParams): string {
  return `        (function() {
          const originalText = ${JSON.stringify(params.text)};
          let lastRenderedText = ${JSON.stringify(params.text)};
          const targetHostWebContentsId = ${typeof params.hostWebContentsId === "number" ? params.hostWebContentsId : "null"};
          let currentFontSize = ${params.fontSize};
          const fontSizeMin = ${params.fontSizeMin};
          const fontSizeMax = ${params.fontSizeMax};
          let isMarkdown = ${params.isMarkdownView};
          const autoPasteOnSelect = ${Boolean(params.autoPasteOnSelect)};
          const isDialogFallback = ${Boolean(params.isDialogFallback)};

${CLIENT_SCRIPT_BODY_PART1}
          const shouldRememberSize = ${Boolean(params.rememberSize)};
${CLIENT_SCRIPT_BODY_PART2}`;
}
