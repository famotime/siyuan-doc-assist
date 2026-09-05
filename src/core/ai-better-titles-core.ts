export const MAX_FULL_DOC_TITLE_INPUT_LENGTH = 15000;

export type BetterTitlesResult = {
  catchy: string[];
  summary: string[];
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * 对输入内容进行处理，如果是读取全文且超出最大长度保护（15,000 字），则截取前部内容
 */
export function prepareBetterTitlesInputText(
  content: string,
  isFullDoc: boolean
): string {
  const trimmed = (content || "").trim();
  if (isFullDoc && trimmed.length > MAX_FULL_DOC_TITLE_INPUT_LENGTH) {
    return trimmed.slice(0, MAX_FULL_DOC_TITLE_INPUT_LENGTH);
  }
  return trimmed;
}

/**
 * 构造请求 AI 生成更好标题的 Prompt 消息
 */
export function buildBetterTitlesMessages(params: {
  documentTitle?: string;
  content: string;
}): ChatMessage[] {
  const systemPrompt = [
    "你是一位资深的爆款文章标题专家和核心内容总结专家。",
    "请根据用户提供的文档内容，为该文档构思生成 6 个更好的候选标题：",
    "1. 前 3 个标题要求【更勾人】：通过设置悬念、抓人眼球的钩子吸引读者的强烈好奇心，引发阅读欲望，允许并鼓励适度使用生动的悬念句式或标点符号；",
    "2. 后 3 个标题要求【更平实】：通过一句话准确概括提炼本文的核心关键内容，语言质朴准确、清晰明了；",
    "3. 每个标题长度建议在 40 字以内，不得含有前后双引号、序号前缀（如“1.”、“标题一”）或多余的说明文字；",
    "4. 必须输出严格合法的 JSON 格式，结构如下：",
    '{"catchy": ["勾人标题1", "勾人标题2", "勾人标题3"], "summary": ["平实标题1", "平实标题2", "平实标题3"]}',
    "不要输出任何 JSON 以外的文字、开场白或解释说明。",
  ].join("\n");

  const userParts: string[] = [];
  if (params.documentTitle && params.documentTitle.trim()) {
    userParts.push(`当前原标题：${params.documentTitle.trim()}`);
  }
  userParts.push("参考内容：", params.content || "");

  return [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: userParts.join("\n\n"),
    },
  ];
}

/**
 * 清理单个标题文本：移除首尾引号、序号前缀（如 1.、-、[1]、标题1：等）
 */
export function cleanCandidateTitle(title: string): string {
  if (!title) return "";
  let text = title.trim();

  // 去除可能的 markdown 加粗或代码标记
  text = text.replace(/^\*+|\*+$/gu, "").replace(/^`+|`+$/gu, "");

  // 去除开头的序号或列表标记，例如 "1. ", "1、", "- ", "[1] ", "标题1: ", "【标题1】", "标题一："
  text = text.replace(/^(?:(?:\[?\d+[\].)、:\-\s]+)|(?:[-*•]\s+)|(?:[【\[]?标题\s*[一二三四五六七八九十\d]+[】\]]?[：:\s]*))/u, "");

  // 去除两端可能残留的外层引号
  text = text.replace(/^["'“‘]+|["'”’]+$/gu, "").trim();

  return text;
}

/**
 * 健壮解析大语言模型返回的候选标题结果
 */
export function parseBetterTitlesResponse(rawText: string): BetterTitlesResult {
  const result: BetterTitlesResult = {
    catchy: [],
    summary: [],
  };

  if (!rawText || !rawText.trim()) {
    return result;
  }

  const text = rawText.trim();

  // 1. 尝试直接从文本中提取 JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/u);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed?.catchy)) {
        result.catchy = parsed.catchy
          .map((item: unknown) => cleanCandidateTitle(String(item || "")))
          .filter(Boolean);
      }
      if (Array.isArray(parsed?.summary)) {
        result.summary = parsed.summary
          .map((item: unknown) => cleanCandidateTitle(String(item || "")))
          .filter(Boolean);
      }
      if (result.catchy.length > 0 || result.summary.length > 0) {
        return result;
      }
    } catch {
      // JSON 解析失败，进入容错降级解析
    }
  }

  // 2. 回退解析：按行分割并识别分段或序号列表
  const lines = text
    .split(/\r?\n/u)
    .map((l) => l.trim())
    .filter(Boolean);

  let currentCategory: "catchy" | "summary" | null = null;
  const uncategorized: string[] = [];

  for (const line of lines) {
    // 检查分类标题行
    if (/(?:勾人|吸引|好奇|欲望|catchy)/ui.test(line)) {
      currentCategory = "catchy";
      continue;
    }
    if (/(?:平实|概括|总结|一句话|summary)/ui.test(line)) {
      currentCategory = "summary";
      continue;
    }

    const cleaned = cleanCandidateTitle(line);
    if (!cleaned) continue;

    if (currentCategory === "catchy") {
      result.catchy.push(cleaned);
    } else if (currentCategory === "summary") {
      result.summary.push(cleaned);
    } else {
      uncategorized.push(cleaned);
    }
  }

  // 如果未能分类，则根据未分类项平分或前3后3分配
  if (result.catchy.length === 0 && result.summary.length === 0 && uncategorized.length > 0) {
    const half = Math.min(3, Math.ceil(uncategorized.length / 2));
    result.catchy = uncategorized.slice(0, half);
    result.summary = uncategorized.slice(half, half + 3);
  }

  return result;
}
