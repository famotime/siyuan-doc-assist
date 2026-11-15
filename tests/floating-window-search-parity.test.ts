import { beforeAll, describe, expect, test } from "vitest";
import {
  filterFloatingSearchCandidates,
  highlightKeywordsInHtml,
  parseSearchKeywords,
  splitFloatingTextCandidates,
  stripFloatingPrefixMarkers
} from "@/core/floating-text-search-core";
import {
  buildFloatingWindowClientScript
} from "@/ui/floating-text/floating-window-client-script";
import type { FloatingWindowClientScriptParams } from "@/ui/floating-text/floating-window-client-script";

/**
 * 浮窗搜索逻辑双实现一致性守护测试。
 *
 * 悬浮窗的搜索逻辑存在两份实现：
 * - 真源（可测、有类型）：src/core/floating-text-search-core.ts
 * - 运行时版本：floating-window-client-script.ts 内嵌的 ES5 手工移植
 *   （悬浮窗 iframe 执行纯脚本，无法直接 import core 模块）
 *
 * 两份逻辑靠人工同步，本测试用同一批输入对两侧求值并断言输出一致，
 * 任何一侧被单独修改（漂移）都会在此失败。
 */

type ClientSearchFns = {
  strip: (raw: string) => string;
  parseCandidates: (str: string) => Array<Record<string, unknown>>;
  escapeHtml: (s: string) => string;
  highlight: (text: string, keywords: string[]) => string;
};

const CLIENT_PARAMS: FloatingWindowClientScriptParams = {
  text: "guard",
  fontSize: 14,
  opacity: 0.9,
  isMarkdownView: false,
  autoPasteOnSelect: false,
  isDialogFallback: false,
  rememberSize: false
};

let client: ClientSearchFns;

beforeAll(() => {
  client = loadClientSearchFns();
});

function loadClientSearchFns(): ClientSearchFns {
  const script = buildFloatingWindowClientScript(CLIENT_PARAMS);
  const start = script.indexOf("function stripLeadingPrefixes(");
  const end = script.indexOf("function openSearchBar(");
  expect(start, "client script 中未找到 stripLeadingPrefixes，守护测试的提取锚点需要更新").toBeGreaterThan(-1);
  expect(end, "client script 中未找到 openSearchBar，守护测试的提取锚点需要更新").toBeGreaterThan(start);

  const snippet = script.slice(start, end);
  const factory = new Function(
    `${snippet}\nreturn { strip: stripLeadingPrefixes, parseCandidates: parseCandidates, escapeHtml: escapeHtmlText, highlight: highlightKeywords };`
  );
  return factory() as ClientSearchFns;
}

describe("floating window search parity (core ↔ client script)", () => {
  const STRIP_CASES = [
    "",
    "   ",
    "普通段落文本",
    "  行首空格缩进",
    "\tTab 缩进",
    "> 引用",
    ">> 多层引用",
    "> > 空格分隔的嵌套引用",
    "# 一级标题",
    "###### 六级标题",
    "#tag 井号标签（后无空格，不应剥离）",
    "- [ ] 待办",
    "- [x] 已完成",
    "* [X] 大写已完成",
    "+ [ ] 加号待办",
    "[ ] 裸复选框",
    "- 无序列表",
    "* 星号列表",
    "+ 加号列表",
    "-5°C 负数（不应剥离）",
    "1. 有序列表点号",
    "2) 有序列表括号",
    "3、有序列表顿号",
    "10. 两位数编号",
    "1.point 无空格（不应剥离）",
    "  > - [ ] 深层复合嵌套",
    ">\t* 嵌套引用加列表",
    '{: id="20260906094133-abc1234" updated="20260906094133"} 带 IAL 的文本',
    "正文 {: id=\"x\" y=\"z\"} 行中 IAL",
    '{: id="a"}# IAL 加标题复合',
    "{: id=\"a\"}> - [ ] 复合嵌套加 IAL"
  ];

  test("stripFloatingPrefixMarkers ↔ stripLeadingPrefixes 逐例一致", () => {
    for (const raw of STRIP_CASES) {
      const fromCore = stripFloatingPrefixMarkers(raw);
      const fromClient = client.strip(raw);
      expect(fromClient, `输入: ${JSON.stringify(raw)}`).toBe(fromCore);
    }
  });

  const CANDIDATE_CASES = [
    "单行文本",
    "第一行\n第二行\n第三行",
    "CRLF 第一行\r\nCRLF 第二行",
    "孤立 CR 第一行\r孤立 CR 第二行",
    "有内容的行\n\n空行之后的行",
    "- [ ] 待办一\n- [x] 待办二\n> 引用行\n# 标题行",
    "\n\n\n",
    "   \n\t\n  ",
    '{: id="a"}第一行\n第二行 {: id="b"}'
  ];

  test("splitFloatingTextCandidates ↔ parseCandidates 输出结构逐字段一致", () => {
    for (const text of CANDIDATE_CASES) {
      const fromCore = splitFloatingTextCandidates(text);
      const fromClient = client.parseCandidates(text);
      expect(fromClient, `输入: ${JSON.stringify(text)}`).toEqual(fromCore);
    }
  });

  test("候选条目 id/line 编号规则一致（跳过被清洗为空的行）", () => {
    const text = "第一行\n\n   \n- [ ] 待办\n第五行原文但清洗为标题内容";
    const fromCore = splitFloatingTextCandidates(text);
    const fromClient = client.parseCandidates(text);
    expect(fromClient).toEqual(fromCore);
    expect(fromCore.map((c) => c.id)).toEqual([1, 2, 3]);
    expect(fromCore.map((c) => c.line)).toEqual([1, 4, 5]);
  });

  const HIGHLIGHT_CASES: Array<{ text: string; query: string }> = [
    { text: "hello world", query: "world" },
    { text: "Hello WORLD", query: "hello" },
    { text: "一变 больше 变化", query: "变" },
    { text: "ababab", query: "ab" },
    { text: "相邻命中词相连", query: "命中 相连" },
    { text: "访问 github.com 查看", query: "github.com" },
    { text: "正则特殊字符 a.b c*d e+f (g) [h] {i}", query: "a.b c*d (g)" },
    { text: "管道分隔 k|l 与反斜杠 m\\n", query: "k|l m\\n" },
    { text: "<div class=\"x\">HTML 实体 & 符号</div>", query: "div" },
    { text: "Tom & Jerry", query: "&" },
    { text: "引号 \"双\" 与 '单'", query: "双" },
    { text: "没有命中的文本", query: "不存在" },
    { text: "<script>alert(1)</script>", query: "" },
    { text: "🇨🇳 国旗与 👍🏽 表情", query: "国旗" }
  ];

  test("highlightKeywordsInHtml ↔ highlightKeywords 逐例一致", () => {
    for (const { text, query } of HIGHLIGHT_CASES) {
      const fromCore = highlightKeywordsInHtml(text, query);
      const fromClient = client.highlight(text, parseSearchKeywords(query));
      expect(fromClient, `输入: ${JSON.stringify({ text, query })}`).toBe(fromCore);
    }
  });

  test("关键词为空时两侧都退化为纯 HTML 转义", () => {
    const text = "<b>加粗</b> & \"引号\"";
    expect(client.highlight(text, [])).toBe(highlightKeywordsInHtml(text, ""));
    expect(client.highlight(text, [])).toBe("&lt;b&gt;加粗&lt;/b&gt; &amp; &quot;引号&quot;");
  });

  test("核心过滤逻辑 filterFloatingSearchCandidates 与现有测试语义保持（多关键词 AND、大小写不敏感）", () => {
    const candidates = splitFloatingTextCandidates("Apple Pie\nbanana SPLIT\napple banana smoothie");
    expect(filterFloatingSearchCandidates(candidates, "apple banana").map((c) => c.id)).toEqual([3]);
    expect(filterFloatingSearchCandidates(candidates, "APPLE").map((c) => c.id)).toEqual([1, 3]);
    expect(filterFloatingSearchCandidates(candidates, "  ")).toEqual([]);
  });

  test("executeSearch 内联的关键词切分与匹配逻辑未被单独改动（源码锚点）", () => {
    // client 端的关键词解析与过滤内联在 executeSearch 中（DOM 绑定无法单独提取），
    // 用源码片段锚点锁住实现：改动这些表达式时必须与 core 侧 parseSearchKeywords /
    // filterFloatingSearchCandidates 重新核对并更新本测试。
    // 注意：本模块内容位于模板字符串内，正则元字符必须写成 \\ 才能保留到运行时；
    // 历史上这里曾因单反斜杠 \s 被吞成 s 导致 built 脚本变成 split(/s+/)。
    const script = buildFloatingWindowClientScript(CLIENT_PARAMS);
    expect(script).toContain("var keywords = query.toLowerCase().split(/\\s+/).filter(Boolean);");
    expect(script).not.toContain("split(/s+/)");
    expect(script).toContain("var target = (item.cleanText || item.displayText || item.rawText).toLowerCase();");
    expect(script).toContain("return keywords.every(function(kw) {");
    expect(script).toContain("return target.indexOf(kw) !== -1;");
  });

  test("parseCandidates 的换行归一化与 core 的 split 规则一致（含孤立 CR）", () => {
    const script = buildFloatingWindowClientScript(CLIENT_PARAMS);
    expect(script).toContain("var clean = str.split(CR + LF).join(LF).split(CR).join(LF);");
  });
});
