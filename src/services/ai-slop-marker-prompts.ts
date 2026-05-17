export type IrrelevantParagraphCandidate = {
  id: string;
  markdown: string;
};

export type IrrelevantSegmentCandidate = {
  id: string;
  paragraphId: string;
  text: string;
  sourceText?: string;
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
  segments?: IrrelevantSegmentCandidate[];
}) {
  const segments = Array.isArray(params.segments) ? params.segments : [];
  const userPayload = segments.length > 0
    ? JSON.stringify(segments.map((item) => ({
      id: item.id,
      paragraphId: item.paragraphId,
      text: item.text,
    })))
    : JSON.stringify(params.paragraphs);
  return [
    {
      role: "system",
      content: [
        "你是思源笔记的文档清理助手。任务：从候选片段中选择明显不承载正文信息价值、可以弱化或删除的口水片段。",
        "口水内容举例：栏目说明、空洞套话、重复导航、文末公众号/社群广告、与正文无关的推广提醒、模板化免责声明、平台导语、关注/转发/加群引导、与主题弱相关的寒暄铺垫或套路化总结。",
        "判定原则：若候选片段主要承担导流、包装、重复说明、模板化免责声明或无信息增量的过渡，应返回该片段 id。",
        "保守边界：不要因为文字啰嗦就标记承载正文信息的句子；只有在是否属于口水内容不确定时才保留。",
        "禁止标记：标题、正文论点、事实信息、步骤、数据、结论、引用、示例、代码。",
        "输出要求：只返回候选片段 id，不要返回原文内容，不要改写、不要概括、不要新增片段。",
        "输出要求：只输出一个 JSON 对象，不要任何解释文字、不要 Markdown 代码块、不要推理过程。",
        "若有应标记的片段：{\"segmentIds\":[\"s1\",\"s2\"]}",
        "若没有应标记的片段：{\"segmentIds\":[]}",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        params.documentTitle ? `文档标题：${params.documentTitle}` : "",
        segments.length > 0
          ? `以下是 ${segments.length} 个候选片段（含片段 id、段落 id 和原文），请返回应标记删除线的片段 id：`
          : `以下是 ${params.paragraphs.length} 个段落（含 id 和 markdown 内容），请识别应标记删除线的口水片段：`,
        userPayload,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

export function buildKeyContentParagraphMessages(params: {
  documentTitle?: string;
  paragraphs: IrrelevantParagraphCandidate[];
  segments?: IrrelevantSegmentCandidate[];
}) {
  const segments = Array.isArray(params.segments) ? params.segments : [];
  const userPayload = segments.length > 0
    ? JSON.stringify(segments.map((item) => ({
      id: item.id,
      paragraphId: item.paragraphId,
      text: item.text,
    })))
    : JSON.stringify(params.paragraphs);
  return [
    {
      role: "system",
      content: [
        "你是思源笔记的文档重点标注助手。任务：从候选片段中选择最值得加粗强调的关键内容。",
        "值得标记的内容举例：关键概念、结论、主张、步骤名称、核心判断、重要术语、关键数据。",
        "标记规则：只返回候选片段 id，不要返回原文内容，不要改写、不要概括、不要新增片段。",
        "没有明确关键内容的候选片段不要出现在结果中。",
        "输出要求：只输出一个 JSON 对象，不要任何解释文字、不要 Markdown 代码块、不要推理过程。",
        "输出格式：{\"segmentIds\":[\"s1\",\"s2\"]}",
        "若所有候选片段都没有明确关键内容：{\"segmentIds\":[]}",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        params.documentTitle ? `文档标题：${params.documentTitle}` : "",
        segments.length > 0
          ? `以下是 ${segments.length} 个候选片段（含片段 id、段落 id 和原文），请返回适合局部加粗的片段 id：`
          : `以下是 ${params.paragraphs.length} 个段落（含 id 和 markdown 内容），请识别适合局部加粗的关键内容片段：`,
        userPayload,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}
