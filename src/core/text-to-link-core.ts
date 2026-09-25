export type TextToLinkCandidate = {
  id: string;
  blockId?: string;
  originalUrl: string;
  targetUrl: string;
  domain: string;
  linkText: string;
  linkMarkdown: string;
  contextSnippet: string;
};

const TRAILING_PUNCTUATION_REGEX = /[.,!?;:。，！？；："'）\]]+$/;

/**
 * 从 URL 提取主机域名 (Domain / Hostname)
 */
export function extractDomainFromUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  const urlStr = rawUrl.trim();

  // 处理 mailto: 协议 (提取邮箱域名)
  if (/^mailto:/i.test(urlStr)) {
    const email = urlStr.replace(/^mailto:/i, "").split("?")[0];
    const atIndex = email.lastIndexOf("@");
    if (atIndex !== -1) {
      return email.slice(atIndex + 1) || email;
    }
    return email || rawUrl;
  }

  let normalized = urlStr;
  if (!/^(?:[a-z0-9+.-]+:\/\/)/i.test(normalized)) {
    normalized = `http://${normalized}`;
  }

  try {
    const parsed = new URL(normalized);
    let host = parsed.hostname || rawUrl;
    // 若环境返回了 Punycode (如 xn--...)，尝试使用原始 URL 中的 Unicode 域名
    if (/^xn--/i.test(host)) {
      const match = rawUrl.match(/^(?:[a-z0-9+.-]+:\/\/)?([^/:\s?#]+)/i);
      if (match) host = match[1];
    }
    return host;
  } catch {
    const match = normalized.match(/^https?:\/\/([^/:\s?#]+)/i);
    return match ? match[1] : rawUrl;
  }
}

/**
 * 常见代码托管与模型社区平台域名（不含 www.，全小写）
 */
const CODE_HOSTING_DOMAINS = new Set([
  "github.com",
  "gitee.com",
  "gitlab.com",
  "codeberg.org",
  "gitcode.com",
  "bitbucket.org",
  "huggingface.co",
  "hf.co",
]);

/**
 * 从 URL 中提取适合作为链接文本的名称（例如从 GitHub 仓库链接提取仓库名）
 * 规则：
 * 1. 代码托管平台（如 github.com, gitee.com 等）或 .git 仓库链接：
 *    - 形如 https://github.com/browser-use/jev-ultrafast -> 提取仓库名 "jev-ultrafast"
 *    - 无论是否带 .git、末尾斜杠、锚点或深度路径（如 /issues, /tree/main），均提取仓库名
 * 2. 其它网址退化为域名 (extractDomainFromUrl)
 */
export function extractLinkTextFromUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  const urlStr = rawUrl.trim();

  // 处理 mailto:
  if (/^mailto:/i.test(urlStr)) {
    return extractDomainFromUrl(urlStr);
  }

  let normalized = urlStr;
  if (!/^(?:[a-z0-9+.-]+:\/\/)/i.test(normalized)) {
    normalized = `http://${normalized}`;
  }

  try {
    const parsed = new URL(normalized);
    const host = (parsed.hostname || "").toLowerCase().replace(/^www\./i, "");
    const pathname = parsed.pathname || "";
    const segments = pathname
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);

    const isCodeHosting =
      CODE_HOSTING_DOMAINS.has(host) ||
      /^(?:git|github|gitlab|gitee|codeberg)\./i.test(host);

    const isGitEnding = /\.git$/i.test(pathname);

    if (isGitEnding) {
      const gitSeg = segments.find((s) => /\.git$/i.test(s)) || segments[segments.length - 1];
      if (gitSeg) {
        let repo = gitSeg.replace(/\.git$/i, "");
        try {
          repo = decodeURIComponent(repo);
        } catch {
          // ignore
        }
        if (repo) return repo;
      }
    }

    if (isCodeHosting && segments.length >= 2) {
      // 提取代码平台仓库名 (形如 https://github.com/browser-use/jev-ultrafast -> jev-ultrafast)
      let repo = segments[1].replace(/\.git$/i, "");
      try {
        repo = decodeURIComponent(repo);
      } catch {
        // ignore
      }
      if (repo) return repo;
    }
  } catch {
    // 忽略异常，降级到 extractDomainFromUrl
  }

  return extractDomainFromUrl(rawUrl);
}

/**
 * 标准化补全补齐 targetUrl 协议头
 */
export function normalizeTargetUrl(originalUrl: string): string {
  if (/^(?:[a-z0-9+.-]+:\/\/|mailto:)/i.test(originalUrl)) {
    return originalUrl;
  }
  if (/^www\./i.test(originalUrl)) {
    return `https://${originalUrl}`;
  }
  return `http://${originalUrl}`;
}

/**
 * 清理 URL 结尾处可能多匹配到的标点符号
 */
export function sanitizeUrlMatch(rawMatch: string): { url: string; trimmedSuffix: string } {
  let url = rawMatch;
  let trimmedSuffix = "";

  while (url.length > 0) {
    const trailingPunct = url.match(TRAILING_PUNCTUATION_REGEX);
    if (trailingPunct) {
      const punct = trailingPunct[0];
      trimmedSuffix = punct + trimmedSuffix;
      url = url.slice(0, -punct.length);
      continue;
    }
    // 检查闭合括号是否匹配
    const openParenCount = (url.match(/\(/g) || []).length;
    const closeParenCount = (url.match(/\)/g) || []).length;
    if (closeParenCount > openParenCount && url.endsWith(")")) {
      trimmedSuffix = ")" + trimmedSuffix;
      url = url.slice(0, -1);
      continue;
    }
    const openBracketCount = (url.match(/\[/g) || []).length;
    const closeBracketCount = (url.match(/\]/g) || []).length;
    if (closeBracketCount > openBracketCount && url.endsWith("]")) {
      trimmedSuffix = "]" + trimmedSuffix;
      url = url.slice(0, -1);
      continue;
    }
    break;
  }

  return { url, trimmedSuffix };
}

type MaskRegion = {
  placeholder: string;
  originalText: string;
};

/**
 * 对 Markdown 中的保护区域（代码块、行内代码、图片、已有链接、HTML 标签）进行掩码保护
 */
export function maskProtectedRegions(markdown: string): { maskedText: string; masks: MaskRegion[] } {
  const masks: MaskRegion[] = [];
  let maskCounter = 0;

  function createPlaceholder(text: string): string {
    const placeholder = `\u0000PROTECTED_${maskCounter++}\u0000`;
    masks.push({ placeholder, originalText: text });
    return placeholder;
  }

  let text = markdown;

  // 1. 围栏代码块 (Fenced code blocks)
  text = text.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, (match) => createPlaceholder(match));

  // 2. 图片 (Markdown & HTML img)
  text = text.replace(/!\[[^\]]*\]\([^)]+\)/g, (match) => createPlaceholder(match));
  text = text.replace(/<img\s+[^>]*>/gi, (match) => createPlaceholder(match));

  // 3. 已存在的 Markdown 链接 [text](url)
  text = text.replace(/\[[^\]]*\]\([^)]+\)/g, (match) => createPlaceholder(match));

  // 4. HTML <a> 标签及其他 HTML 标签 <a ...>...</a>
  text = text.replace(/<a\s+[^>]*>[\s\S]*?<\/a>/gi, (match) => createPlaceholder(match));
  text = text.replace(/<[a-z][^>]*>/gi, (match) => createPlaceholder(match));

  // 5. 行内代码 `...`
  text = text.replace(/`[^`\n]+`/g, (match) => createPlaceholder(match));

  return { maskedText: text, masks };
}

/**
 * 还原掩码区域
 */
export function unmaskProtectedRegions(maskedText: string, masks: MaskRegion[]): string {
  let text = maskedText;
  // 反向替换恢复
  for (let i = masks.length - 1; i >= 0; i--) {
    const { placeholder, originalText } = masks[i];
    text = text.split(placeholder).join(originalText);
  }
  return text;
}

/**
 * 剥离文本中的 IAL 属性标记 (例如 {: id="20260906094133..." ...} 或 \{: id="..."\})
 */
export function stripIalAttributes(text: string): string {
  if (!text) return "";
  let cleaned = text;
  // 1. 匹配各种闭合或末尾未闭合的 IAL 属性：{: ... } 或 \{: ... \}
  cleaned = cleaned.replace(/\\?\{:[\s\S]*?(?:\\?\}|$)/g, "");
  // 2. 清除可能遗留的 {: id="... 碎片
  cleaned = cleaned.replace(/\\?\{:\s*id="[^"]*"?/gi, "");
  return cleaned.replace(/\s+/g, " ").trim();
}

/**
 * 生成上下文摘要片段（彻底剥离 IAL 属性）
 */
function extractContextSnippet(fullText: string, targetUrl: string, matchIndexInMasked: number): string {
  const cleanText = stripIalAttributes(fullText);
  if (!cleanText) return targetUrl;

  let urlIndex = cleanText.indexOf(targetUrl);
  if (urlIndex === -1) {
    urlIndex = Math.max(0, Math.min(matchIndexInMasked, cleanText.length - 1));
  }

  const snippetRadius = 25;
  const start = Math.max(0, urlIndex - snippetRadius);
  const end = Math.min(cleanText.length, urlIndex + targetUrl.length + snippetRadius);
  let rawSnippet = cleanText.slice(start, end).replace(/\s+/g, " ");

  // 再次确保 snippet 中不包含任何残留 IAL
  rawSnippet = stripIalAttributes(rawSnippet);

  const prefix = start > 0 ? "..." : "";
  const suffix = end < cleanText.length ? "..." : "";
  return `${prefix}${rawSnippet}${suffix}`;
}

// 识别 URL / Scheme / IPv4 的正则表达式
const SCHEME_OR_WWW_URL_REGEX = /(?:(?:[a-z0-9+.-]+:\/\/|mailto:)|www\.)[^\s<>)\]>"',;]+/gi;
const IPV4_REGEX = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?::\d+)?(?:\/[^\s<>)\]>"',;\u4e00-\u9fa5]*)?/gi;

function findAllMatchesInMaskedText(maskedText: string): Array<{ rawMatch: string; index: number }> {
  const results: Array<{ rawMatch: string; index: number }> = [];

  // 1. 扫描带有协议头 (http/https/mailto等) 或 www. 的 URL
  let match: RegExpExecArray | null;
  const regex1 = new RegExp(SCHEME_OR_WWW_URL_REGEX.source, SCHEME_OR_WWW_URL_REGEX.flags);
  while ((match = regex1.exec(maskedText)) !== null) {
    results.push({ rawMatch: match[0], index: match.index });
  }

  // 2. 扫描 IPv4 地址
  const regex2 = new RegExp(IPV4_REGEX.source, IPV4_REGEX.flags);
  while ((match = regex2.exec(maskedText)) !== null) {
    results.push({ rawMatch: match[0], index: match.index });
  }

  // 按位置排序
  return results.sort((a, b) => a.index - b.index);
}

/**
 * 从单个 Markdown 字符串中扫描候选纯文本 URL
 */
export function findCandidatesInMarkdown(
  markdown: string,
  blockId?: string
): TextToLinkCandidate[] {
  if (!markdown) return [];

  const { maskedText, masks } = maskProtectedRegions(markdown);
  const candidates: TextToLinkCandidate[] = [];
  const seenOriginalUrls = new Set<string>();

  const matches = findAllMatchesInMaskedText(maskedText);

  for (const matchItem of matches) {
    const rawMatch = matchItem.rawMatch;
    const { url: originalUrl } = sanitizeUrlMatch(rawMatch);

    if (!originalUrl || seenOriginalUrls.has(originalUrl)) {
      continue;
    }
    seenOriginalUrls.add(originalUrl);

    const targetUrl = normalizeTargetUrl(originalUrl);
    const domain = extractDomainFromUrl(originalUrl);
    const linkText = extractLinkTextFromUrl(originalUrl);
    const linkMarkdown = `[${linkText}](${targetUrl})`;

    // 计算真实的上下文（排除占位符与 IAL 属性污染）
    const rawContextText = unmaskProtectedRegions(maskedText, masks);
    const snippet = extractContextSnippet(rawContextText, originalUrl, matchItem.index);

    candidates.push({
      id: `${blockId || "block"}-${candidates.length}-${Date.now()}`,
      blockId,
      originalUrl,
      targetUrl,
      domain,
      linkText,
      linkMarkdown,
      contextSnippet: snippet,
    });
  }

  return candidates;
}

/**
 * 在 Markdown 中替换指定的纯文本 URL 为 [linkText](targetUrl)
 */
export function convertTextToLinkInMarkdown(
  markdown: string,
  targetOriginalUrls: Set<string>
): { markdown: string; replacedCount: number } {
  if (!markdown || targetOriginalUrls.size === 0) {
    return { markdown, replacedCount: 0 };
  }

  const { maskedText, masks } = maskProtectedRegions(markdown);
  let replacedCount = 0;

  const replacePattern = (text: string, pattern: RegExp) => {
    return text.replace(new RegExp(pattern.source, pattern.flags), (rawMatch) => {
      const { url: originalUrl, trimmedSuffix } = sanitizeUrlMatch(rawMatch);
      if (targetOriginalUrls.has(originalUrl)) {
        replacedCount++;
        const targetUrl = normalizeTargetUrl(originalUrl);
        const linkText = extractLinkTextFromUrl(originalUrl);
        return `[${linkText}](${targetUrl})${trimmedSuffix}`;
      }
      return rawMatch;
    });
  };

  let resultMasked = replacePattern(maskedText, SCHEME_OR_WWW_URL_REGEX);
  resultMasked = replacePattern(resultMasked, IPV4_REGEX);

  const finalMarkdown = unmaskProtectedRegions(resultMasked, masks);
  return { markdown: finalMarkdown, replacedCount };
}
