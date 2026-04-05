export type IrrelevantParagraphCandidate = {
  id: string;
  markdown: string;
};

export function normalizeParagraphCandidates(
  paragraphs: IrrelevantParagraphCandidate[]
): IrrelevantParagraphCandidate[] {
  if (!Array.isArray(paragraphs)) {
    return [];
  }
  return paragraphs
    .map((item) => ({
      id: typeof item?.id === "string" ? item.id.trim() : "",
      markdown: typeof item?.markdown === "string" ? item.markdown.trim() : "",
    }))
    .filter((item) => item.id && item.markdown);
}

export function buildIrrelevantParagraphMessages(params: {
  documentTitle?: string;
  paragraphs: IrrelevantParagraphCandidate[];
}) {
  return [
    {
      role: "system",
      content: [
        "你是思源笔记的文档清理助手。",
        "请按段落颗粒度识别明显可以弱化或预删除的口水内容，例如栏目说明、空洞套话、重复导航、文末公众号/社群广告、与正文无关的推广提醒。",
        "仅在内容明显无关紧要时才标记；只要有一点不确定，就保留。",
        "不要标记标题、正文论点、事实信息、步骤、数据、结论、引用、示例。",
        "只输出 JSON，不要解释，不要 Markdown 代码块。",
        "输出格式必须是：{\"paragraphIds\":[\"p1\",\"p2\"]}",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        params.documentTitle ? `文档标题：${params.documentTitle}` : "",
        "请从下面段落中挑出应添加删除线的段落 id：",
        JSON.stringify(params.paragraphs),
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

export function buildKeyContentParagraphMessages(params: {
  documentTitle?: string;
  paragraphs: IrrelevantParagraphCandidate[];
}) {
  return [
    {
      role: "system",
      content: [
        "你是思源笔记的文档重点标注助手。",
        "请从每个段落中识别最值得加粗强调的关键内容片段，例如关键概念、结论、主张、步骤名称、核心判断、重要术语。",
        "只标记段落中的局部短语，不要返回整段，不要改写原文。",
        "没有明确关键内容时返回空数组。",
        "不要输出 JSON 之外的任何解释，不要 Markdown 代码块。",
        "输出格式必须是：{\"paragraphs\":[{\"paragraphId\":\"p1\",\"highlights\":[\"关键短语1\",\"关键短语2\"]}]}",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        params.documentTitle ? `文档标题：${params.documentTitle}` : "",
        "请从下面段落中识别适合局部加粗的关键内容片段：",
        JSON.stringify(params.paragraphs),
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}
