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
        "你是思源笔记的文档清理助手。任务：按段落颗粒度识别明显可以弱化或删除的口水内容。",
        "口水内容举例：栏目说明、空洞套话、重复导航、文末公众号/社群广告、与正文无关的推广提醒、模板化免责声明。",
        "判定原则：仅在内容明显无关紧要时才标记；只要有一点不确定，就保留。",
        "禁止标记：标题、正文论点、事实信息、步骤、数据、结论、引用、示例、代码。",
        "输出要求：只输出一个 JSON 对象，不要任何解释文字、不要 Markdown 代码块、不要推理过程。",
        "若有应标记的段落：{\"paragraphIds\":[\"段落id1\",\"段落id2\"]}",
        "若没有应标记的段落：{\"paragraphIds\":[]}",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        params.documentTitle ? `文档标题：${params.documentTitle}` : "",
        `以下是 ${params.paragraphs.length} 个段落（含 id 和 markdown 内容），请筛选出应标记的段落 id：`,
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
        "你是思源笔记的文档重点标注助手。任务：从每个段落中识别最值得加粗强调的关键内容片段。",
        "值得标记的内容举例：关键概念、结论、主张、步骤名称、核心判断、重要术语、关键数据。",
        "标记规则：只标记段落中的局部短语（原文片段），不要返回整段文字，不要改写原文。",
        "没有明确关键内容的段落不要出现在结果中。",
        "输出要求：只输出一个 JSON 对象，不要任何解释文字、不要 Markdown 代码块、不要推理过程。",
        "输出格式：{\"paragraphs\":[{\"paragraphId\":\"段落id\",\"highlights\":[\"关键短语1\",\"关键短语2\"]}]}",
        "若所有段落都没有明确关键内容：{\"paragraphs\":[]}",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        params.documentTitle ? `文档标题：${params.documentTitle}` : "",
        `以下是 ${params.paragraphs.length} 个段落（含 id 和 markdown 内容），请识别适合局部加粗的关键内容片段：`,
        JSON.stringify(params.paragraphs),
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}
