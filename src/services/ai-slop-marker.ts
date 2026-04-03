import {
  AiServiceConfig,
  DEFAULT_AI_REQUEST_TIMEOUT_SECONDS,
  isAiServiceConfigComplete,
  normalizeAiServiceConfig,
} from "@/core/ai-service-config-core";
import { forwardProxy, ForwardProxyHeader, ForwardProxyResponse } from "@/services/kernel";

type ForwardProxyFn = (
  url: string,
  method?: string,
  payload?: any,
  headers?: ForwardProxyHeader[],
  timeout?: number,
  contentType?: string
) => Promise<ForwardProxyResponse>;

type IrrelevantParagraphCandidate = {
  id: string;
  markdown: string;
};

type DetectIrrelevantParagraphIdsParams = {
  config?: unknown;
  documentTitle?: string;
  paragraphs: IrrelevantParagraphCandidate[];
};

export function createAiSlopMarkerService(deps: {
  forwardProxy: ForwardProxyFn;
}) {
  return {
    async detectIrrelevantParagraphIds(
      params: DetectIrrelevantParagraphIdsParams
    ): Promise<string[]> {
      const config = normalizeAiServiceConfig(params.config);
      if (!config.enabled) {
        throw new Error("请先在设置中启用 AI 服务");
      }
      if (!isAiServiceConfigComplete(config)) {
        throw new Error("AI 服务配置不完整，请补充 Base URL、API Key 和 Model");
      }

      const paragraphs = normalizeParagraphCandidates(params.paragraphs);
      if (!paragraphs.length) {
        return [];
      }

      const endpoint = `${config.baseUrl.replace(/\/+$/u, "")}/chat/completions`;
      const body = JSON.stringify({
        model: config.model,
        messages: buildIrrelevantParagraphMessages({
          documentTitle: params.documentTitle,
          paragraphs,
        }),
        max_tokens: 400,
        temperature: 0.1,
      });

      const response = await deps.forwardProxy(
        endpoint,
        "POST",
        body,
        [
          { Authorization: `Bearer ${config.apiKey}` },
          { Accept: "application/json" },
        ],
        Math.max(
          1,
          config.requestTimeoutSeconds || DEFAULT_AI_REQUEST_TIMEOUT_SECONDS
        ) * 1000,
        "application/json"
      );

      if (!response || response.status < 200 || response.status >= 300) {
        throw new Error(`AI 口水内容筛选请求失败（${response?.status ?? "未知状态"}）`);
      }

      let payload: any;
      try {
        payload = JSON.parse(response.body || "{}");
      } catch {
        throw new Error("AI 接口返回了无法解析的 JSON");
      }

      return extractIrrelevantParagraphIds(payload, paragraphs);
    },
  };
}

function normalizeParagraphCandidates(
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

function buildIrrelevantParagraphMessages(params: {
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

function extractIrrelevantParagraphIds(
  payload: any,
  paragraphs: IrrelevantParagraphCandidate[]
): string[] {
  const content = extractMessageContent(payload);
  if (!content) {
    throw new Error("AI 未返回可用的段落筛选结果");
  }

  const allowedIds = new Set(paragraphs.map((item) => item.id));
  const parsed = parseJsonObject(content);
  const ids = Array.isArray(parsed?.paragraphIds) ? parsed.paragraphIds : [];
  const deduped: string[] = [];
  for (const value of ids) {
    const id = typeof value === "string" ? value.trim() : "";
    if (!id || !allowedIds.has(id) || deduped.includes(id)) {
      continue;
    }
    deduped.push(id);
  }
  return deduped;
}

function extractMessageContent(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((item) =>
        typeof item?.text === "string"
          ? item.text
          : typeof item === "string"
            ? item
            : ""
      )
      .join("\n")
      .trim();
  }
  return "";
}

function parseJsonObject(content: string): any {
  const trimmed = (content || "").trim();
  const normalized = trimmed
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  const jsonText =
    start >= 0 && end >= start ? normalized.slice(start, end + 1) : normalized;

  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error("AI 返回的段落筛选结果不是有效 JSON");
  }
}

const aiSlopMarkerService = createAiSlopMarkerService({ forwardProxy });

export async function detectIrrelevantParagraphIds(
  params: DetectIrrelevantParagraphIdsParams
): Promise<string[]> {
  return aiSlopMarkerService.detectIrrelevantParagraphIds(params);
}

export type { AiServiceConfig, DetectIrrelevantParagraphIdsParams, IrrelevantParagraphCandidate };
